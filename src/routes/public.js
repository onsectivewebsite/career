const express = require('express');
const db = require('../lib/db');
const { upload } = require('../lib/upload');
const { csrfMiddleware } = require('../middleware/csrf');
const { sendMail, templates } = require('../lib/mailer');
const { setFlash } = require('../middleware/auth');

const router = express.Router();

const LEADERS = [
  { name: 'Rishabh', title: 'Founder & CEO', photo: '/static/img/team-rishabh.jpg', bio: 'Rishabh founded Onsective with a vision to build security and software platforms that enterprises genuinely enjoy using.' },
  { name: 'Shabir', title: 'Co-Founder & CTO', photo: '/static/img/team-shabir.jpg', bio: 'Shabir leads our technology. He has spent 15+ years shipping resilient systems at scale across security and cloud.' },
  { name: 'Kavya', title: 'Head of People', photo: '/static/img/team-kavya.jpg', bio: 'Kavya builds the Onsective team and culture — from hiring to growth and inclusion.' },
  { name: 'Kumakshi', title: 'Head of Operations', photo: '/static/img/team-kumakshi.jpg', bio: 'Kumakshi keeps the business humming — running ops, finance, and customer success.' },
  { name: 'Riyan', title: 'Head of Engineering', photo: '/static/img/team-riyan.jpg', bio: 'Riyan leads engineering execution across platform, product, and security services.' }
];

// Home
router.get('/', (req, res) => {
  const openJobs = db.prepare(`SELECT id, title, department, location, employment_type FROM jobs WHERE status='open' ORDER BY created_at DESC LIMIT 6`).all();
  res.render('public/home', { title: 'Careers', openJobs, leaders: LEADERS });
});

router.get('/leadership', (req, res) => {
  res.render('public/leadership', { title: 'Leadership', leaders: LEADERS });
});

router.get('/life', (req, res) => {
  res.render('public/life', { title: 'Life at Onsective' });
});

router.get('/contact', (req, res) => {
  res.render('public/contact', { title: 'Contact' });
});

// Jobs list with filters
router.get('/careers', (req, res) => {
  const { q, department, location, type } = req.query;
  let sql = `SELECT id, title, department, location, employment_type, experience_level, summary, created_at FROM jobs WHERE status='open'`;
  const params = [];
  if (q) { sql += ` AND (title LIKE ? OR summary LIKE ? OR description LIKE ?)`; params.push(`%${q}%`, `%${q}%`, `%${q}%`); }
  if (department) { sql += ` AND department = ?`; params.push(department); }
  if (location) { sql += ` AND location LIKE ?`; params.push(`%${location}%`); }
  if (type) { sql += ` AND employment_type = ?`; params.push(type); }
  sql += ` ORDER BY created_at DESC`;

  const jobs = db.prepare(sql).all(...params);
  const departments = db.prepare(`SELECT DISTINCT department FROM jobs WHERE status='open' ORDER BY department`).all().map(r => r.department);
  const types = db.prepare(`SELECT DISTINCT employment_type FROM jobs WHERE status='open' ORDER BY employment_type`).all().map(r => r.employment_type);
  res.render('public/careers', { title: 'Open roles', jobs, departments, types, filters: { q, department, location, type } });
});

// Job detail
router.get('/careers/:id', (req, res) => {
  const job = db.prepare(`SELECT * FROM jobs WHERE id = ?`).get(req.params.id);
  if (!job || (job.status !== 'open' && !(req.user && ['hr','admin'].includes(req.user.role)))) {
    return res.status(404).render('error', { title: 'Role not found', message: 'This role may have been filled or is no longer available.' });
  }
  // If accessed via referral token, record intent in session so the application links back
  const refToken = req.query.ref;
  if (refToken) {
    const ref = db.prepare(`SELECT id FROM referrals WHERE token = ? AND job_id = ?`).get(refToken, job.id);
    if (ref) req.session.referralId = ref.id;
  }
  res.render('public/job', { title: job.title, job });
});

// Apply — GET form
router.get('/careers/:id/apply', (req, res) => {
  const job = db.prepare(`SELECT * FROM jobs WHERE id = ? AND status='open'`).get(req.params.id);
  if (!job) return res.status(404).render('error', { title: 'Role unavailable', message: 'This role is no longer accepting applications.' });
  res.render('public/apply', { title: `Apply · ${job.title}`, job, prefill: req.user || null });
});

// Apply — POST (multipart; multer parses, then we run csrf manually)
router.post('/careers/:id/apply', upload.single('resume'), csrfMiddleware, async (req, res) => {
  const job = db.prepare(`SELECT * FROM jobs WHERE id = ? AND status='open'`).get(req.params.id);
  if (!job) return res.status(404).render('error', { title: 'Role unavailable', message: 'This role is no longer accepting applications.' });

  const { full_name, email, phone, location, linkedin, cover_letter } = req.body;
  if (!full_name || !email) {
    setFlash(req, 'error', 'Name and email are required.');
    return res.redirect(`/careers/${job.id}/apply`);
  }

  const resume = req.file || null;
  const candidate_id = req.user ? req.user.id : null;
  const referral_id = req.session.referralId || null;

  const info = db.prepare(`
    INSERT INTO applications (job_id, candidate_id, full_name, email, phone, location, linkedin, cover_letter, resume_path, resume_original_name, referral_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    job.id, candidate_id, full_name.trim(), email.trim().toLowerCase(),
    phone || null, location || null, linkedin || null, cover_letter || null,
    resume ? resume.filename : null, resume ? resume.originalname : null,
    referral_id
  );

  db.prepare(`INSERT INTO status_history (application_id, from_status, to_status, changed_by, note) VALUES (?, NULL, 'received', ?, 'Application submitted')`)
    .run(info.lastInsertRowid, candidate_id);

  if (referral_id) {
    db.prepare(`UPDATE referrals SET status='applied' WHERE id = ?`).run(referral_id);
    delete req.session.referralId;
  }

  // Email confirmation to candidate
  const appUrl = `${res.locals.appUrl}/candidate`;
  sendMail({
    to: email,
    subject: `We received your application — ${job.title}`,
    html: templates.applicationReceived({ name: full_name, jobTitle: job.title, appUrl })
  });

  // Notify HR/admin
  const admins = db.prepare(`SELECT email FROM users WHERE role IN ('hr','admin')`).all();
  const adminUrl = `${res.locals.appUrl}/admin/applications/${info.lastInsertRowid}`;
  for (const a of admins) {
    sendMail({
      to: a.email,
      subject: `New application · ${job.title} · ${full_name}`,
      html: templates.adminNewApplication({ jobTitle: job.title, candidateName: full_name, candidateEmail: email, adminUrl })
    });
  }

  setFlash(req, 'success', 'Application submitted. Check your email for a confirmation.');
  res.redirect(`/careers/${job.id}/apply/success`);
});

router.get('/careers/:id/apply/success', (req, res) => {
  const job = db.prepare(`SELECT id, title FROM jobs WHERE id = ?`).get(req.params.id);
  res.render('public/apply-success', { title: 'Application received', job });
});

module.exports = router;
