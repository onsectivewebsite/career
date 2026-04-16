const express = require('express');
const crypto = require('crypto');
const bcrypt = require('bcrypt');
const db = require('../lib/db');
const { sendMail, templates } = require('../lib/mailer');
const { setFlash } = require('../middleware/auth');

const router = express.Router();

router.get('/register', (req, res) => {
  if (req.user) return res.redirect('/');
  res.render('auth/register', { title: 'Create account', values: {} });
});

router.post('/register', async (req, res) => {
  const { name, email, password, confirm, phone } = req.body;
  const clean = { name: (name || '').trim(), email: (email || '').trim().toLowerCase(), phone: phone || null };
  if (!clean.name || !clean.email || !password) {
    setFlash(req, 'error', 'Name, email, and password are required.');
    return res.status(400).render('auth/register', { title: 'Create account', values: clean });
  }
  if (password.length < 8) {
    setFlash(req, 'error', 'Password must be at least 8 characters.');
    return res.status(400).render('auth/register', { title: 'Create account', values: clean });
  }
  if (password !== confirm) {
    setFlash(req, 'error', "Passwords don't match.");
    return res.status(400).render('auth/register', { title: 'Create account', values: clean });
  }
  const existing = db.prepare(`SELECT id FROM users WHERE email = ?`).get(clean.email);
  if (existing) {
    setFlash(req, 'error', 'An account with that email already exists. Try signing in instead.');
    return res.status(409).render('auth/register', { title: 'Create account', values: clean });
  }
  const hash = await bcrypt.hash(password, 10);
  const info = db.prepare(`INSERT INTO users (email, password_hash, name, role, phone) VALUES (?, ?, ?, 'candidate', ?)`)
    .run(clean.email, hash, clean.name, clean.phone);
  req.session.userId = info.lastInsertRowid;
  setFlash(req, 'success', `Welcome, ${clean.name.split(' ')[0]}!`);
  res.redirect(req.query.next || '/candidate');
});

router.get('/login', (req, res) => {
  if (req.user) return res.redirect('/');
  res.render('auth/login', { title: 'Sign in', next: req.query.next || '' });
});

router.post('/login', async (req, res) => {
  const email = (req.body.email || '').trim().toLowerCase();
  const password = req.body.password || '';
  const user = db.prepare(`SELECT * FROM users WHERE email = ?`).get(email);
  if (!user || !(await bcrypt.compare(password, user.password_hash))) {
    setFlash(req, 'error', 'Invalid email or password.');
    return res.status(401).render('auth/login', { title: 'Sign in', next: req.body.next || '' });
  }
  req.session.userId = user.id;
  setFlash(req, 'success', `Welcome back, ${user.name.split(' ')[0]}.`);
  const next = req.body.next;
  if (next && next.startsWith('/')) return res.redirect(next);
  if (user.role === 'admin' || user.role === 'hr') return res.redirect('/admin');
  if (user.role === 'employee') return res.redirect('/employee');
  return res.redirect('/candidate');
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/'));
});

router.get('/forgot', (req, res) => {
  res.render('auth/forgot', { title: 'Reset password' });
});

router.post('/forgot', async (req, res) => {
  const email = (req.body.email || '').trim().toLowerCase();
  const user = db.prepare(`SELECT id, name, email FROM users WHERE email = ?`).get(email);
  // Always show success to avoid email enumeration
  if (user) {
    const token = crypto.randomBytes(24).toString('hex');
    const expires = Math.floor(Date.now() / 1000) + 60 * 60; // 1 hr
    db.prepare(`UPDATE users SET reset_token = ?, reset_expires = ? WHERE id = ?`).run(token, expires, user.id);
    const url = `${res.locals.appUrl}/reset/${token}`;
    await sendMail({
      to: user.email,
      subject: 'Reset your Onsective account password',
      html: templates.passwordReset({ name: user.name, url })
    });
  }
  setFlash(req, 'success', 'If an account exists for that email, a reset link was sent.');
  res.redirect('/login');
});

router.get('/reset/:token', (req, res) => {
  const now = Math.floor(Date.now() / 1000);
  const user = db.prepare(`SELECT id FROM users WHERE reset_token = ? AND reset_expires > ?`).get(req.params.token, now);
  if (!user) return res.status(400).render('error', { title: 'Invalid link', message: 'Reset link is invalid or has expired.' });
  res.render('auth/reset', { title: 'Set a new password', token: req.params.token });
});

router.post('/reset/:token', async (req, res) => {
  const now = Math.floor(Date.now() / 1000);
  const user = db.prepare(`SELECT id FROM users WHERE reset_token = ? AND reset_expires > ?`).get(req.params.token, now);
  if (!user) return res.status(400).render('error', { title: 'Invalid link', message: 'Reset link is invalid or has expired.' });
  const { password, confirm } = req.body;
  if (!password || password.length < 8 || password !== confirm) {
    setFlash(req, 'error', 'Passwords must match and be at least 8 characters.');
    return res.status(400).render('auth/reset', { title: 'Set a new password', token: req.params.token });
  }
  const hash = await bcrypt.hash(password, 10);
  db.prepare(`UPDATE users SET password_hash = ?, reset_token = NULL, reset_expires = NULL WHERE id = ?`).run(hash, user.id);
  setFlash(req, 'success', 'Password updated. Please sign in.');
  res.redirect('/login');
});

module.exports = router;
