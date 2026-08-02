const ApiError = require('../errors/ApiError');
const { parseDateTime } = require('../utils/dateUtils');

function parseRequiredRange(start_datetime, end_datetime) {
  if (!start_datetime || !end_datetime) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'start_datetime and end_datetime are required');
  }
  const start = parseDateTime(start_datetime);
  const end = parseDateTime(end_datetime);
  if (!start || !end) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'start_datetime/end_datetime must be valid ISO datetime strings');
  }
  if (end.getTime() <= start.getTime()) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'end_datetime must be after start_datetime');
  }
  return { start, end };
}

function validateDoctorAppointmentsQuery(query) {
  const { doctor_id, start_datetime, end_datetime } = query || {};
  if (!doctor_id) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'doctor_id is required');
  }
  const { start, end } = parseRequiredRange(start_datetime, end_datetime);
  return { doctorId: doctor_id, start, end };
}

function validateAppointmentActionBody(body) {
  const { doctor_id, start_datetime, end_datetime, mobile_number, email } = body || {};
  if (!doctor_id || typeof doctor_id !== 'string') {
    throw new ApiError(400, 'VALIDATION_ERROR', 'doctor_id is required');
  }
  if (!start_datetime || !end_datetime) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'start_datetime and end_datetime are required');
  }
  if (mobile_number !== undefined && typeof mobile_number !== 'string') {
    throw new ApiError(400, 'VALIDATION_ERROR', 'mobile_number must be a string');
  }
  if (email !== undefined && typeof email !== 'string') {
    throw new ApiError(400, 'VALIDATION_ERROR', 'email must be a string');
  }
}

function validateAppointmentDetailsQuery(query) {
  const { start_datetime, end_datetime, mobile_number, email } = query || {};
  if (mobile_number !== undefined && typeof mobile_number !== 'string') {
    throw new ApiError(400, 'VALIDATION_ERROR', 'mobile_number must be a string');
  }
  if (email !== undefined && typeof email !== 'string') {
    throw new ApiError(400, 'VALIDATION_ERROR', 'email must be a string');
  }
  return parseRequiredRange(start_datetime, end_datetime);
}

function validateMyAppointmentsQuery(query) {
  const { start_datetime, end_datetime } = query || {};
  return parseRequiredRange(start_datetime, end_datetime);
}

module.exports = {
  validateDoctorAppointmentsQuery,
  validateBookBody: validateAppointmentActionBody,
  validateCancelBody: validateAppointmentActionBody,
  validateAppointmentDetailsQuery,
  validateMyAppointmentsQuery,
};
