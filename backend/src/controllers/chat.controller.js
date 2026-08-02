const chatService = require('../services/chat.service');
const ApiError = require('../errors/ApiError');
const { validateChatMessage } = require('../validators/chat.validators');

async function sendMessage(req, res, next) {
  try {
    validateChatMessage(req.body);

    // Logged-in callers always use their auth session_id (server-controlled,
    // tied to logout). Guests have no auth session, so they must supply their
    // own client-generated session_id to keep one conversation's history
    // together across requests; any session_id a logged-in caller sends is
    // ignored in favor of their real session.
    const sessionId = req.user ? req.session.session_id : req.body.session_id;
    if (!sessionId || typeof sessionId !== 'string') {
      throw new ApiError(400, 'VALIDATION_ERROR', 'session_id is required when not logged in');
    }

    const reply = await chatService.sendMessage({
      sessionId,
      user: req.user,
      userMessage: req.body.message,
    });
    res.status(200).json({ success: true, data: { reply } });
  } catch (err) {
    next(err);
  }
}

module.exports = { sendMessage };
