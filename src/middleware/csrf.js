const crypto = require('crypto');

function ensureToken(req) {
  if (!req.session.csrfToken) {
    req.session.csrfToken = crypto.randomBytes(24).toString('hex');
  }
  return req.session.csrfToken;
}

function csrfMiddleware(req, res, next) {
  const token = ensureToken(req);
  res.locals.csrfToken = token;
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  // Multipart forms put _csrf in req.body after multer parses; JSON APIs can use header.
  const submitted = (req.body && req.body._csrf) || req.get('x-csrf-token');
  if (!submitted || submitted !== token) {
    return res.status(403).render('error', { title: 'Invalid session', message: 'Your session has expired. Please reload the page and try again.' });
  }
  next();
}

module.exports = { csrfMiddleware, ensureToken };
