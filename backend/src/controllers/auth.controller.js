const authService = require('../services/auth.service');
const { validateRegister, validateLogin } = require('../validators/auth.validators');

function register(req, res, next) {
  try {
    validateRegister(req.body);
    const user = authService.register(req.body);
    res.status(201).json({ success: true, data: user });
  } catch (err) {
    next(err);
  }
}

function login(req, res, next) {
  try {
    validateLogin(req.body);
    const result = authService.login(req.body);
    res.status(200).json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

function logout(req, res, next) {
  try {
    authService.revokeSession(req.session.session_id);
    res.status(200).json({ success: true, data: { message: 'Logged out' } });
  } catch (err) {
    next(err);
  }
}

module.exports = { register, login, logout };
