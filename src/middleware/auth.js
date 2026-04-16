const db = require('../lib/db');

function currentUser(req) {
  if (!req.session || !req.session.userId) return null;
  return db.prepare('SELECT id, email, name, role, phone, headline, location, linkedin FROM users WHERE id = ?').get(req.session.userId);
}

function attachUser(req, res, next) {
  const u = currentUser(req);
  req.user = u;
  res.locals.currentUser = u;
  res.locals.flash = req.session.flash || null;
  if (req.session) delete req.session.flash;
  next();
}

function setFlash(req, type, message) {
  if (!req.session) return;
  req.session.flash = { type, message };
}

function requireAuth(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      setFlash(req, 'error', 'Please sign in to continue.');
      return res.redirect('/login?next=' + encodeURIComponent(req.originalUrl));
    }
    if (roles.length && !roles.includes(req.user.role)) {
      return res.status(403).render('error', { title: 'Forbidden', message: "You don't have access to that page." });
    }
    next();
  };
}

module.exports = { attachUser, requireAuth, setFlash, currentUser };
