const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const config = require('../config');
const db = require('../store/db');
const ApiError = require('../errors/ApiError');
const { generateId } = require('../utils/idGenerator');
const { normalizeEmail, normalizeMobile } = require('../utils/normalize');
const chatService = require('./chat.service');
const doctorService = require('./doctor.service');

function nowIso() {
  return new Date().toISOString();
}

function toPublicUser(user) {
  const { user_id, username, name, mobile_number, email, created_datetime, updated_datetime } = user;
  const is_doctor = Boolean(doctorService.findDoctorByUserId(user_id));
  return { user_id, username, name, mobile_number, email, created_datetime, updated_datetime, is_doctor };
}

function register({ username, password, name, mobile_number, email, metadata }) {
  const existing = db.findOne('users', (u) => u.username === username);
  if (existing) {
    throw new ApiError(409, 'USERNAME_TAKEN', `username "${username}" is already taken`);
  }

  const now = nowIso();
  const user = {
    user_id: generateId(),
    username,
    password: bcrypt.hashSync(password, config.bcryptRounds),
    name,
    mobile_number: normalizeMobile(mobile_number),
    email: normalizeEmail(email),
    created_datetime: now,
    updated_datetime: now,
    metadata: metadata || {},
  };
  db.insert('users', user);
  return toPublicUser(user);
}

function login({ username, password }) {
  const user = db.findOne('users', (u) => u.username === username);
  if (!user || !bcrypt.compareSync(password, user.password)) {
    throw new ApiError(401, 'INVALID_CREDENTIALS', 'Invalid username or password');
  }

  const sessionId = generateId();
  const now = nowIso();
  const token = jwt.sign({ sub: user.user_id, session_id: sessionId }, config.jwtSecret, {
    expiresIn: config.jwtExpiresIn,
  });
  const decoded = jwt.decode(token);

  db.insert('sessions', {
    session_id: sessionId,
    user_id: user.user_id,
    issued_datetime: now,
    expires_datetime: new Date(decoded.exp * 1000).toISOString(),
    revoked_datetime: null,
    last_used_datetime: now,
  });

  return { token, user: toPublicUser(user) };
}

function revokeSession(sessionId) {
  db.update('sessions', 'session_id', sessionId, { revoked_datetime: nowIso() });
  chatService.clearHistory(sessionId);
}

function touchSession(sessionId) {
  db.update('sessions', 'session_id', sessionId, { last_used_datetime: nowIso() });
}

module.exports = { register, login, revokeSession, touchSession, toPublicUser };
