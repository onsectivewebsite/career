const express = require('express');
const bcrypt = require('bcrypt');
const db = require('../lib/db');
const { requireAuth, setFlash } = require('../middleware/auth');

const router = express.Router();

router.get('/', requireAuth(), (req, res) => {
  // For HR/admin viewing their own account, show candidate view anyway (applications they've submitted)
  const apps = db.prepare(`
    SELECT a.id, a.status, a.created_at, j.title, j.department, j.location
    FROM applications a
    JOIN jobs j ON j.id = a.job_id
    WHERE a.candidate_id = ? OR a.email = ?
    ORDER BY a.created_at DESC
  `).all(req.user.id, req.user.email);

  // Also show referrals made for this email (if someone was referred before creating an account)
  const referrals = db.prepare(`
    SELECT r.id, r.status, r.created_at, j.title, u.name AS referrer_name
    FROM referrals r
    JOIN jobs j ON j.id = r.job_id
    JOIN users u ON u.id = r.employee_id
    WHERE LOWER(r.candidate_email) = LOWER(?)
    ORDER BY r.created_at DESC
  `).all(req.user.email);

  res.render('candidate/dashboard', { title: 'My applications', apps, referrals });
});

router.get('/application/:id', requireAuth(), (req, res) => {
  const app = db.prepare(`
    SELECT a.*, j.title AS job_title, j.location AS job_location, j.department AS job_department
    FROM applications a
    JOIN jobs j ON j.id = a.job_id
    WHERE a.id = ? AND (a.candidate_id = ? OR a.email = ?)
  `).get(req.params.id, req.user.id, req.user.email);
  if (!app) return res.status(404).render('error', { title: 'Not found', message: 'Application not found.' });
  const history = db.prepare(`SELECT * FROM status_history WHERE application_id = ? ORDER BY created_at ASC`).all(app.id);
  res.render('candidate/application', { title: app.job_title, app, history });
});

router.post('/application/:id/withdraw', requireAuth(), (req, res) => {
  const app = db.prepare(`SELECT id, status FROM applications WHERE id = ? AND (candidate_id = ? OR email = ?)`)
    .get(req.params.id, req.user.id, req.user.email);
  if (!app) return res.status(404).render('error', { title: 'Not found', message: 'Application not found.' });
  if (['hired', 'rejected', 'withdrawn'].includes(app.status)) {
    setFlash(req, 'error', 'This application cannot be withdrawn.');
    return res.redirect('/candidate');
  }
  db.prepare(`UPDATE applications SET status='withdrawn', updated_at=strftime('%s','now') WHERE id = ?`).run(app.id);
  db.prepare(`INSERT INTO status_history (application_id, from_status, to_status, changed_by, note) VALUES (?, ?, 'withdrawn', ?, 'Withdrawn by candidate')`)
    .run(app.id, app.status, req.user.id);
  setFlash(req, 'success', 'Application withdrawn.');
  res.redirect('/candidate');
});

router.get('/profile', requireAuth(), (req, res) => {
  res.render('candidate/profile', { title: 'Profile' });
});

router.post('/profile', requireAuth(), async (req, res) => {
  const { name, phone, headline, location, linkedin, current_password, new_password, confirm } = req.body;
  db.prepare(`UPDATE users SET name = ?, phone = ?, headline = ?, location = ?, linkedin = ? WHERE id = ?`)
    .run((name || '').trim() || req.user.name, phone || null, headline || null, location || null, linkedin || null, req.user.id);

  if (new_password) {
    const fresh = db.prepare(`SELECT password_hash FROM users WHERE id = ?`).get(req.user.id);
    const ok = await bcrypt.compare(current_password || '', fresh.password_hash);
    if (!ok) {
      setFlash(req, 'error', 'Current password is incorrect.');
      return res.redirect('/candidate/profile');
    }
    if (new_password.length < 8 || new_password !== confirm) {
      setFlash(req, 'error', 'New password must be 8+ chars and match confirmation.');
      return res.redirect('/candidate/profile');
    }
    const hash = await bcrypt.hash(new_password, 10);
    db.prepare(`UPDATE users SET password_hash = ? WHERE id = ?`).run(hash, req.user.id);
  }

  setFlash(req, 'success', 'Profile updated.');
  res.redirect('/candidate/profile');
});

module.exports = router;
