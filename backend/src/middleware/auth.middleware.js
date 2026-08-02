const jwt = require('jsonwebtoken');
const config = require('../config');
const db = require('../store/db');
const ApiError = require('../errors/ApiError');
const authService = require('../services/auth.service');

// Verifies the JWT signature/expiry, then confirms the session it references is
// still active in the sessions store (not revoked, not expired). Returns
// { user, session } or throws ApiError. Never returns null for a *present*
// Authorization header — an invalid/expired token is always rejected outright.
function verifyPresentedToken(req) {
  const header = req.headers.authorization;
  const token = header.slice('Bearer '.length).trim();

  let decoded;
  try {
    decoded = jwt.verify(token, config.jwtSecret);
  } catch (err) {
    throw new ApiError(401, 'UNAUTHORIZED', 'Invalid or expired token');
  }

  const session = db.findById('sessions', 'session_id', decoded.session_id);
  const sessionActive = session && !session.revoked_datetime && new Date(session.expires_datetime).getTime() >= Date.now();
  if (!sessionActive) {
    throw new ApiError(401, 'UNAUTHORIZED', 'Session is no longer valid');
  }

  const user = db.findById('users', 'user_id', decoded.sub);
  if (!user) {
    throw new ApiError(401, 'UNAUTHORIZED', 'User no longer exists');
  }

  authService.touchSession(session.session_id);
  return { user, session };
}

function requireAuth(req, res, next) {
  try {
    if (!req.headers.authorization) {
      throw new ApiError(401, 'UNAUTHORIZED', 'Authentication required');
    }
    const { user, session } = verifyPresentedToken(req);
    req.user = user;
    req.session = session;
    next();
  } catch (err) {
    next(err);
  }
}

// Guest requests (no Authorization header) proceed with req.user = null.
// A *present* header must still be valid — it is never silently downgraded to guest.
function optionalAuth(req, res, next) {
  try {
    if (!req.headers.authorization) {
      req.user = null;
      req.session = null;
      return next();
    }
    const { user, session } = verifyPresentedToken(req);
    req.user = user;
    req.session = session;
    return next();
  } catch (err) {
    return next(err);
  }
}

module.exports = { requireAuth, optionalAuth };
