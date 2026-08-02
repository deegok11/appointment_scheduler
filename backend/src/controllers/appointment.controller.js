const appointmentService = require('../services/appointment.service');
const { validateBookBody, validateCancelBody, validateAppointmentDetailsQuery } = require('../validators/appointment.validators');

function book(req, res, next) {
  try {
    validateBookBody(req.body);
    const appointment = appointmentService.bookAppointment({ body: req.body, user: req.user });
    res.status(201).json({ success: true, data: appointment });
  } catch (err) {
    next(err);
  }
}

function cancel(req, res, next) {
  try {
    validateCancelBody(req.body);
    const appointment = appointmentService.cancelAppointment({ body: req.body, user: req.user });
    res.status(200).json({ success: true, data: appointment });
  } catch (err) {
    next(err);
  }
}

function getDetails(req, res, next) {
  try {
    validateAppointmentDetailsQuery(req.query);
    const appointments = appointmentService.getAppointmentDetails({ query: req.query, user: req.user });
    res.status(200).json({ success: true, data: { appointments } });
  } catch (err) {
    next(err);
  }
}

module.exports = { book, cancel, getDetails };
