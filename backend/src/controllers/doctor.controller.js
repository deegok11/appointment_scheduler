const doctorService = require('../services/doctor.service');
const { validateDoctorAppointmentsQuery, validateMyAppointmentsQuery } = require('../validators/appointment.validators');

function getDoctorList(req, res, next) {
  try {
    const doctors = doctorService.listDoctors();
    res.status(200).json({ success: true, data: { doctors } });
  } catch (err) {
    next(err);
  }
}

function getDoctorAppointments(req, res, next) {
  try {
    const { doctorId, start, end } = validateDoctorAppointmentsQuery(req.query);
    const slots = doctorService.getAvailability(doctorId, start, end);
    res.status(200).json({ success: true, data: { doctor_id: doctorId, slots } });
  } catch (err) {
    next(err);
  }
}

function getMyAppointments(req, res, next) {
  try {
    const { start, end } = validateMyAppointmentsQuery(req.query);
    const appointments = doctorService.getMyAppointments(req.user.user_id, start, end);
    res.status(200).json({ success: true, data: { appointments } });
  } catch (err) {
    next(err);
  }
}

module.exports = { getDoctorList, getDoctorAppointments, getMyAppointments };
