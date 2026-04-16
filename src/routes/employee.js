const express = require('express');
const crypto = require('crypto');
const db = require('../lib/db');
const { requireAuth, setFlash } = require('../middleware/auth');
const { sendMail, templates } = require('../lib/mailer');

const router = express.Router();

// Any authenticated employee OR hr/admin (so leaders can refer too)
function employeeOrStaff(req, res, next) {
  if (!req.user) {
    setFlash(req, 'error', 'Please sign in to continue.');
    return res.redirect('/login?next=' + encodeURIComponent(req.originalUrl));
  }
  if (!['employee', 'hr', 'admin'].includes(req.user.role)) {
    return res.status(403).render('error', { title: 'Forbidden', message: 'Employee portal is for Onsective staff only.' });
  }
  next();
}

router.get('/', employeeOrStaff, (req, res) => {
  const openJobs = db.prepare(`SELECT id, title, department, location, employment_type, referral_bonus FROM jobs WHERE status='open' ORDER BY created_at DESC`).all();
  const myRefs = db.prepare(`
    SELECT r.*, j.title AS job_title, j.department AS job_department
    FROM referrals r
    JOIN jobs j ON j.id = r.job_id
    WHERE r.employee_id = ?
    ORDER BY r.created_at DESC
  `).all(req.user.id);

  // Count referrals by status for summary
  const stats = db.prepare(`
    SELECT status, COUNT(*) AS n FROM referrals WHERE employee_id = ? GROUP BY status
  `).all(req.user.id);
  const summary = { invited: 0, applied: 0, interview: 0, hired: 0, rejected: 0 };
  for (const s of stats) summary[s.status] = s.n;

  res.render('employee/dashboard', { title: 'Employee referrals', openJobs, myRefs, summary });
});

router.get('/refer/:jobId', employeeOrStaff, (req, res) => {
  const job = db.prepare(`SELECT * FROM jobs WHERE id = ? AND status='open'`).get(req.params.jobId);
  if (!job) return res.status(404).render('error', { title: 'Role unavailable', message: 'This role is not accepting referrals right now.' });
  res.render('employee/refer', { title: `Refer · ${job.title}`, job });
});

router.post('/refer/:jobId', employeeOrStaff, async (req, res) => {
  const job = db.prepare(`SELECT * FROM jobs WHERE id = ? AND status='open'`).get(req.params.jobId);
  if (!job) return res.status(404).render('error', { title: 'Role unavailable', message: 'This role is not accepting referrals right now.' });
  const { candidate_name, candidate_email, candidate_phone, relationship, note } = req.body;
  if (!candidate_name || !candidate_email) {
    setFlash(req, 'error', 'Candidate name and email are required.');
    return res.redirect(`/employee/refer/${job.id}`);
  }
  // Deduplicate: the same employee shouldn't refer the same email twice for the same role
  const existing = db.prepare(`SELECT id FROM referrals WHERE employee_id = ? AND job_id = ? AND LOWER(candidate_email) = LOWER(?)`)
    .get(req.user.id, job.id, candidate_email);
  if (existing) {
    setFlash(req, 'error', 'You have already referred this candidate for this role.');
    return res.redirect('/employee');
  }

  const token = crypto.randomBytes(18).toString('hex');
  const info = db.prepare(`
    INSERT INTO referrals (employee_id, job_id, candidate_name, candidate_email, candidate_phone, relationship, note, token)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(req.user.id, job.id, candidate_name.trim(), candidate_email.trim().toLowerCase(), candidate_phone || null, relationship || null, note || null, token);

  const jobUrl = `${res.locals.appUrl}/careers/${job.id}?ref=${token}`;

  // Invite candidate
  sendMail({
    to: candidate_email,
    subject: `${req.user.name} referred you for ${job.title} at Onsective`,
    html: templates.referralInvite({ candidateName: candidate_name, referrerName: req.user.name, jobTitle: job.title, jobUrl })
  });
  // Confirm referrer
  sendMail({
    to: req.user.email,
    subject: `Referral recorded · ${job.title}`,
    html: templates.referralConfirmation({ referrerName: req.user.name, candidateName: candidate_name, jobTitle: job.title })
  });
  // Notify HR
  const hrs = db.prepare(`SELECT email FROM users WHERE role IN ('hr','admin')`).all();
  for (const h of hrs) {
    sendMail({
      to: h.email,
      subject: `New referral · ${job.title} · ${candidate_name}`,
      html: `<p><strong>${req.user.name}</strong> referred <strong>${candidate_name}</strong> (${candidate_email}) for <strong>${job.title}</strong>.</p>${note ? `<p><em>Note:</em> ${note}</p>` : ''}<p><a href="${res.locals.appUrl}/admin/referrals">View in admin</a></p>`
    });
  }

  setFlash(req, 'success', `Referral for ${candidate_name} recorded. They've been emailed a direct apply link.`);
  res.redirect('/employee');
});

module.exports = router;
