const express = require('express');
const controller = require('../controllers/appointment.controller');
const { optionalAuth } = require('../middleware/auth.middleware');

const router = express.Router();

router.post('/book', optionalAuth, controller.book);
router.post('/cancel', optionalAuth, controller.cancel);
router.get('/details', optionalAuth, controller.getDetails);

module.exports = router;
