const express = require('express');
const controller = require('../controllers/doctor.controller');
const { requireAuth } = require('../middleware/auth.middleware');

const router = express.Router();

router.get('/me/appointments', requireAuth, controller.getMyAppointments);
router.get('/appointments', controller.getDoctorAppointments);
router.get('/', controller.getDoctorList);

module.exports = router;
