const ApiError = require('../errors/ApiError');

function validateChatMessage(body) {
  const { message } = body || {};
  if (!message || typeof message !== 'string' || !message.trim()) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'message is required');
  }
}

module.exports = { validateChatMessage };
