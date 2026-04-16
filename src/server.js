require('dotenv').config();
const path = require('path');
const fs = require('fs');
const express = require('express');
const session = require('express-session');
const SQLiteStore = require('connect-sqlite3')(session);

const { attachUser } = require('./middleware/auth');
const { csrfMiddleware } = require('./middleware/csrf');
const { seed } = require('./lib/seed');

const publicRoutes = require('./routes/public');
const authRoutes = require('./routes/auth');
const candidateRoutes = require('./routes/candidate');
const employeeRoutes = require('./routes/employee');
const adminRoutes = require('./routes/admin');

const app = express();

// Views
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

// Static (public assets — open)
app.use('/static', express.static(path.join(__dirname, '..', 'public'), { maxAge: '7d' }));

// Body parsing
app.use(express.urlencoded({ extended: true, limit: '1mb' }));
app.use(express.json({ limit: '1mb' }));

// Session (SQLite-backed)
const sessionsDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(sessionsDir)) fs.mkdirSync(sessionsDir, { recursive: true });

app.use(session({
  store: new SQLiteStore({ db: 'sessions.db', dir: sessionsDir }),
  secret: process.env.SESSION_SECRET || 'dev-secret-change-me',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 1000 * 60 * 60 * 24 * 14
  }
}));

// Uploads — gated: only authenticated HR/admin can download resumes
app.use('/uploads', (req, res, next) => {
  if (!req.session || !req.session.userId) return res.status(403).send('Forbidden');
  const db = require('./lib/db');
  const u = db.prepare('SELECT role FROM users WHERE id = ?').get(req.session.userId);
  if (!u || !['hr', 'admin'].includes(u.role)) return res.status(403).send('Forbidden');
  next();
}, express.static(path.join(__dirname, '..', 'uploads')));

// Attach user + CSRF to every request
app.use(attachUser);

// Template helpers
app.use((req, res, next) => {
  res.locals.appUrl = process.env.APP_URL || `http://localhost:${process.env.PORT || 3000}`;
  res.locals.path = req.path;
  res.locals.formatDate = (ts) => {
    if (!ts) return '';
    const d = new Date(typeof ts === 'number' ? ts * 1000 : ts);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };
  res.locals.statusBadge = (s) => {
    const map = {
      received: 'bg-slate-100 text-slate-700',
      screening: 'bg-blue-100 text-blue-700',
      interview: 'bg-indigo-100 text-indigo-700',
      offer: 'bg-amber-100 text-amber-800',
      hired: 'bg-emerald-100 text-emerald-700',
      rejected: 'bg-rose-100 text-rose-700',
      withdrawn: 'bg-slate-100 text-slate-500',
      open: 'bg-emerald-100 text-emerald-700',
      closed: 'bg-slate-100 text-slate-500',
      draft: 'bg-amber-100 text-amber-700',
      invited: 'bg-blue-100 text-blue-700',
      applied: 'bg-indigo-100 text-indigo-700'
    };
    return map[s] || 'bg-slate-100 text-slate-700';
  };
  next();
});

// CSRF applies to all mutating routes; mounted selectively so multer can still parse multipart before CSRF check
// We apply CSRF globally but routes that upload files must call multer before this middleware via route-level ordering.
// Because multer parses multipart into req.body (where _csrf lives), we run csrf AFTER multer for those routes.
// For non-multipart routes, global csrf is fine.
// Strategy: attach a flag to skip global csrf for multipart routes, which handle it themselves.
app.use((req, res, next) => {
  if (req.is('multipart/form-data')) return next(); // route will handle CSRF after multer
  return csrfMiddleware(req, res, next);
});

// Routes
app.use('/', publicRoutes);
app.use('/', authRoutes);
app.use('/candidate', candidateRoutes);
app.use('/employee', employeeRoutes);
app.use('/admin', adminRoutes);

// 404
app.use((req, res) => {
  res.status(404).render('error', { title: 'Not found', message: 'That page could not be found.' });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('[error]', err);
  const status = err.status || 500;
  res.status(status).render('error', { title: 'Something went wrong', message: err.message || 'Unexpected error' });
});

// Boot
const PORT = Number(process.env.PORT || 3000);
try { seed(); } catch (e) { console.error('[seed]', e); }
app.listen(PORT, () => {
  console.log(`Onsective Careers listening on http://localhost:${PORT}`);
});
