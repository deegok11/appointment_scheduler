function normalizeEmail(email) {
  return typeof email === 'string' ? email.trim().toLowerCase() : email;
}

function normalizeMobile(mobile) {
  return typeof mobile === 'string' ? mobile.replace(/\D/g, '') : mobile;
}

module.exports = { normalizeEmail, normalizeMobile };
