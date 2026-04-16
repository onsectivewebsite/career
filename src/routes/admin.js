const express = require('express');
const bcrypt = require('bcrypt');
const db = require('../lib/db');
const { requireAuth, setFlash } = require('../middleware/auth');
const { sendMail, templates } = require('../lib/mailer');

const router = express.Router();
const staff = requireAuth('hr', 'admin');
const adminOnly = requireAuth('admin');

// Dashboard
router.get('/', staff, (req, res) => {
  const counts = {
    openJobs: db.prepare(`SELECT COUNT(*) AS n FROM jobs WHERE status='open'`).get().n,
    totalJobs: db.prepare(`SELECT COUNT(*) AS n FROM jobs`).get().n,
    totalApps: db.prepare(`SELECT COUNT(*) AS n FROM applications`).get().n,
    activeApps: db.prepare(`SELECT COUNT(*) AS n FROM applications WHERE status NOT IN ('hired','rejected','withdrawn')`).get().n,
    referrals: db.prepare(`SELECT COUNT(*) AS n FROM referrals`).get().n,
    users: db.prepare(`SELECT COUNT(*) AS n FROM users`).get().n
  };
  const recentApps = db.prepare(`
    SELECT a.id, a.full_name, a.email, a.status, a.created_at, j.title AS job_title
    FROM applications a JOIN jobs j ON j.id = a.job_id
    ORDER BY a.created_at DESC LIMIT 8
  `).all();
  const pipeline = db.prepare(`
    SELECT status, COUNT(*) AS n FROM applications GROUP BY status
  `).all();
  const pipelineMap = { received: 0, screening: 0, interview: 0, offer: 0, hired: 0, rejected: 0, withdrawn: 0 };
  for (const p of pipeline) pipelineMap[p.status] = p.n;
  res.render('admin/dashboard', { title: 'Admin dashboard', counts, recentApps, pipeline: pipelineMap });
});

// Jobs list
router.get('/jobs', staff, (req, res) => {
  const jobs = db.prepare(`
    SELECT j.*, u.name AS posted_by_name,
      (SELECT COUNT(*) FROM applications a WHERE a.job_id = j.id) AS app_count
    FROM jobs j LEFT JOIN users u ON u.id = j.posted_by
    ORDER BY j.created_at DESC
  `).all();
  res.render('admin/jobs', { title: 'Jobs', jobs });
});

// New/edit job
router.get('/jobs/new', staff, (req, res) => {
  res.render('admin/job-form', { title: 'New job', job: null });
});
router.get('/jobs/:id/edit', staff, (req, res) => {
  const job = db.prepare(`SELECT * FROM jobs WHERE id = ?`).get(req.params.id);
  if (!job) return res.status(404).render('error', { title: 'Not found', message: 'Job not found.' });
  res.render('admin/job-form', { title: `Edit · ${job.title}`, job });
});

function jobFields(body) {
  return {
    title: (body.title || '').trim(),
    department: (body.department || '').trim(),
    location: (body.location || '').trim(),
    employment_type: (body.employment_type || '').trim(),
    experience_level: (body.experience_level || '').trim(),
    salary_range: body.salary_range || null,
    summary: (body.summary || '').trim(),
    description: (body.description || '').trim(),
    requirements: (body.requirements || '').trim(),
    benefits: body.benefits || null,
    referral_bonus: body.referral_bonus || null,
    status: ['open','closed','draft'].includes(body.status) ? body.status : 'open'
  };
}

router.post('/jobs', staff, (req, res) => {
  const f = jobFields(req.body);
  if (!f.title || !f.department || !f.location || !f.employment_type || !f.experience_level || !f.summary || !f.description || !f.requirements) {
    setFlash(req, 'error', 'All required fields must be completed.');
    return res.redirect('/admin/jobs/new');
  }
  db.prepare(`
    INSERT INTO jobs (title, department, location, employment_type, experience_level, salary_range, summary, description, requirements, benefits, referral_bonus, status, posted_by)
    VALUES (@title, @department, @location, @employment_type, @experience_level, @salary_range, @summary, @description, @requirements, @benefits, @referral_bonus, @status, @posted_by)
  `).run({ ...f, posted_by: req.user.id });
  setFlash(req, 'success', 'Job created.');
  res.redirect('/admin/jobs');
});

router.post('/jobs/:id', staff, (req, res) => {
  const job = db.prepare(`SELECT id FROM jobs WHERE id = ?`).get(req.params.id);
  if (!job) return res.status(404).render('error', { title: 'Not found', message: 'Job not found.' });
  const f = jobFields(req.body);
  db.prepare(`
    UPDATE jobs SET title=@title, department=@department, location=@location, employment_type=@employment_type,
      experience_level=@experience_level, salary_range=@salary_range, summary=@summary, description=@description,
      requirements=@requirements, benefits=@benefits, referral_bonus=@referral_bonus, status=@status,
      updated_at=strftime('%s','now')
    WHERE id=@id
  `).run({ ...f, id: job.id });
  setFlash(req, 'success', 'Job updated.');
  res.redirect('/admin/jobs');
});

router.post('/jobs/:id/delete', adminOnly, (req, res) => {
  db.prepare(`DELETE FROM jobs WHERE id = ?`).run(req.params.id);
  setFlash(req, 'success', 'Job deleted.');
  res.redirect('/admin/jobs');
});

// Applications list
router.get('/applications', staff, (req, res) => {
  const { status, q, job_id } = req.query;
  let sql = `
    SELECT a.*, j.title AS job_title, j.department AS job_department,
      r.id AS ref_id, u.name AS referrer_name
    FROM applications a
    JOIN jobs j ON j.id = a.job_id
    LEFT JOIN referrals r ON r.id = a.referral_id
    LEFT JOIN users u ON u.id = r.employee_id
    WHERE 1=1
  `;
  const params = [];
  if (status) { sql += ` AND a.status = ?`; params.push(status); }
  if (job_id) { sql += ` AND a.job_id = ?`; params.push(job_id); }
  if (q) { sql += ` AND (a.full_name LIKE ? OR a.email LIKE ?)`; params.push(`%${q}%`, `%${q}%`); }
  sql += ` ORDER BY a.created_at DESC`;
  const apps = db.prepare(sql).all(...params);
  const jobs = db.prepare(`SELECT id, title FROM jobs ORDER BY title`).all();
  res.render('admin/applications', { title: 'Applications', apps, jobs, filters: { status, q, job_id } });
});

router.get('/applications/:id', staff, (req, res) => {
  const app = db.prepare(`
    SELECT a.*, j.title AS job_title, j.department AS job_department, j.location AS job_location,
      r.id AS ref_id, u.name AS referrer_name, u.email AS referrer_email
    FROM applications a
    JOIN jobs j ON j.id = a.job_id
    LEFT JOIN referrals r ON r.id = a.referral_id
    LEFT JOIN users u ON u.id = r.employee_id
    WHERE a.id = ?
  `).get(req.params.id);
  if (!app) return res.status(404).render('error', { title: 'Not found', message: 'Application not found.' });
  const history = db.prepare(`
    SELECT h.*, u.name AS changed_by_name FROM status_history h
    LEFT JOIN users u ON u.id = h.changed_by
    WHERE application_id = ? ORDER BY h.created_at DESC
  `).all(app.id);
  res.render('admin/application-detail', { title: app.full_name, app, history });
});

router.post('/applications/:id/status', staff, async (req, res) => {
  const app = db.prepare(`SELECT a.*, j.title AS job_title FROM applications a JOIN jobs j ON j.id = a.job_id WHERE a.id = ?`).get(req.params.id);
  if (!app) return res.status(404).render('error', { title: 'Not found', message: 'Application not found.' });
  const { status, note } = req.body;
  const valid = ['received','screening','interview','offer','hired','rejected','withdrawn'];
  if (!valid.includes(status)) {
    setFlash(req, 'error', 'Invalid status.');
    return res.redirect(`/admin/applications/${app.id}`);
  }
  db.prepare(`UPDATE applications SET status = ?, notes = COALESCE(?, notes), updated_at = strftime('%s','now') WHERE id = ?`)
    .run(status, note || null, app.id);
  db.prepare(`INSERT INTO status_history (application_id, from_status, to_status, changed_by, note) VALUES (?, ?, ?, ?, ?)`)
    .run(app.id, app.status, status, req.user.id, note || null);

  // If the application came from a referral, keep the referral in sync
  if (app.referral_id) {
    const refStatus = status === 'hired' ? 'hired' : status === 'rejected' || status === 'withdrawn' ? 'rejected' : status === 'interview' || status === 'offer' ? 'interview' : 'applied';
    db.prepare(`UPDATE referrals SET status = ? WHERE id = ?`).run(refStatus, app.referral_id);
  }

  // Email candidate about status change
  const appUrl = `${res.locals.appUrl}/candidate`;
  sendMail({
    to: app.email,
    subject: `Update on your ${app.job_title} application`,
    html: templates.applicationStatus({ name: app.full_name, jobTitle: app.job_title, status, note, appUrl })
  });

  setFlash(req, 'success', `Status updated to ${status}.`);
  res.redirect(`/admin/applications/${app.id}`);
});

// Referrals list
router.get('/referrals', staff, (req, res) => {
  const refs = db.prepare(`
    SELECT r.*, j.title AS job_title, u.name AS employee_name, u.email AS employee_email
    FROM referrals r
    JOIN jobs j ON j.id = r.job_id
    JOIN users u ON u.id = r.employee_id
    ORDER BY r.created_at DESC
  `).all();
  res.render('admin/referrals', { title: 'Referrals', refs });
});

// Users list + invite
router.get('/users', adminOnly, (req, res) => {
  const users = db.prepare(`SELECT id, email, name, role, created_at FROM users ORDER BY created_at DESC`).all();
  res.render('admin/users', { title: 'Users', users });
});

router.post('/users', adminOnly, async (req, res) => {
  const { name, email, role, password } = req.body;
  if (!name || !email || !role || !password) {
    setFlash(req, 'error', 'Name, email, role, and password are required.');
    return res.redirect('/admin/users');
  }
  if (!['candidate','employee','hr','admin'].includes(role)) {
    setFlash(req, 'error', 'Invalid role.');
    return res.redirect('/admin/users');
  }
  if (password.length < 8) {
    setFlash(req, 'error', 'Password must be 8+ characters.');
    return res.redirect('/admin/users');
  }
  const hash = await bcrypt.hash(password, 10);
  try {
    db.prepare(`INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)`)
      .run(name.trim(), email.trim().toLowerCase(), hash, role);
    setFlash(req, 'success', 'User created.');
  } catch (e) {
    setFlash(req, 'error', e.message.includes('UNIQUE') ? 'A user with that email already exists.' : 'Could not create user.');
  }
  res.redirect('/admin/users');
});

router.post('/users/:id/role', adminOnly, (req, res) => {
  const { role } = req.body;
  if (!['candidate','employee','hr','admin'].includes(role)) {
    setFlash(req, 'error', 'Invalid role.');
    return res.redirect('/admin/users');
  }
  if (Number(req.params.id) === req.user.id && role !== 'admin') {
    setFlash(req, 'error', 'You cannot demote yourself.');
    return res.redirect('/admin/users');
  }
  db.prepare(`UPDATE users SET role = ? WHERE id = ?`).run(role, req.params.id);
  setFlash(req, 'success', 'Role updated.');
  res.redirect('/admin/users');
});

router.post('/users/:id/delete', adminOnly, (req, res) => {
  if (Number(req.params.id) === req.user.id) {
    setFlash(req, 'error', 'You cannot delete your own account.');
    return res.redirect('/admin/users');
  }
  db.prepare(`DELETE FROM users WHERE id = ?`).run(req.params.id);
  setFlash(req, 'success', 'User deleted.');
  res.redirect('/admin/users');
});

router.post('/users/:id/reset', adminOnly, async (req, res) => {
  const { password } = req.body;
  if (!password || password.length < 8) {
    setFlash(req, 'error', 'Password must be 8+ characters.');
    return res.redirect('/admin/users');
  }
  const hash = await bcrypt.hash(password, 10);
  db.prepare(`UPDATE users SET password_hash = ? WHERE id = ?`).run(hash, req.params.id);
  setFlash(req, 'success', 'Password reset.');
  res.redirect('/admin/users');
});

module.exports = router;
