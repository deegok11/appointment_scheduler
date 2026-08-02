const express = require('express');
const controller = require('../controllers/chat.controller');
const { optionalAuth } = require('../middleware/auth.middleware');

const router = express.Router();

router.post('/', optionalAuth, controller.sendMessage);

module.exports = router;
