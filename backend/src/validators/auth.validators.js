const ApiError = require('../errors/ApiError');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validateRegister(body) {
  const { username, password, name, mobile_number, email } = body || {};
  const missing = ['username', 'password', 'name', 'mobile_number', 'email'].filter((field) => !body || !body[field]);
  if (missing.length) {
    throw new ApiError(400, 'VALIDATION_ERROR', `Missing required field(s): ${missing.join(', ')}`);
  }
  if (typeof password !== 'string' || password.length < 6) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'password must be at least 6 characters');
  }
  if (typeof email !== 'string' || !EMAIL_RE.test(email)) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'email is not a valid email address');
  }
  if (typeof username !== 'string' || typeof name !== 'string' || typeof mobile_number !== 'string') {
    throw new ApiError(400, 'VALIDATION_ERROR', 'username, name, and mobile_number must be strings');
  }
}

function validateLogin(body) {
  const { username, password } = body || {};
  if (!username || !password) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'username and password are required');
  }
}

module.exports = { validateRegister, validateLogin };
