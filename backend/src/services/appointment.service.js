const db = require('../store/db');
const ApiError = require('../errors/ApiError');
const { generateId } = require('../utils/idGenerator');
const { normalizeEmail, normalizeMobile } = require('../utils/normalize');
const {
  parseDateTime,
  formatDateTime,
  isPast,
  classifyDateTime,
  alignToSlotIndices,
} = require('../utils/dateUtils');
const doctorService = require('./doctor.service');
const slotIndexService = require('./slotIndex.service');

function nowIso() {
  return new Date().toISOString();
}

// Logged-in caller: identity comes from their own account, any mobile_number/email
// in the request body is ignored so a caller can't spoof contact info on their
// own account. Guest caller: both mobile_number and email are required.
function resolveIdentity(user, params) {
  if (user) {
    return { client_id: user.user_id, mobile_number: user.mobile_number, email: user.email };
  }
  const mobile = params.mobile_number;
  const email = params.email;
  if (!mobile || !email) {
    throw new ApiError(400, 'MISSING_GUEST_IDENTITY', 'mobile_number and email are required when not logged in');
  }
  return { client_id: null, mobile_number: normalizeMobile(mobile), email: normalizeEmail(email) };
}

function identityMatches(appointment, identity) {
  if (identity.client_id) {
    return appointment.client_id === identity.client_id;
  }
  return appointment.mobile_number === identity.mobile_number && appointment.email === identity.email;
}

function parseAndValidateRange(startRaw, endRaw) {
  const start = parseDateTime(startRaw);
  const end = parseDateTime(endRaw);
  if (!start || !end) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'start_datetime/end_datetime must be valid ISO datetime strings');
  }
  if (end.getTime() <= start.getTime()) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'end_datetime must be after start_datetime');
  }
  return { start, end };
}

function sameInstant(a, b) {
  return !!a && !!b && a.getTime() === b.getTime();
}

function bookAppointment({ body, user }) {
  const { doctor_id } = body;

  doctorService.getDoctorOrThrow(doctor_id);
  const { start, end } = parseAndValidateRange(body.start_datetime, body.end_datetime);

  if (isPast(start)) {
    throw new ApiError(400, 'PAST_DATETIME', 'start_datetime is in the past');
  }

  const startClass = classifyDateTime(start);
  if (startClass === 'NOT_WORKING_DAY' || startClass === 'OUTSIDE_WINDOW') {
    throw new ApiError(400, 'OUTSIDE_WORKING_HOURS', 'Doctors work Mon-Sat, 8AM-12PM and 1PM-8PM only');
  }
  if (startClass === 'NOT_ALIGNED') {
    throw new ApiError(400, 'NOT_SLOT_ALIGNED', 'start_datetime must fall on a 30-minute slot boundary');
  }

  const alignment = alignToSlotIndices(start, end);
  if (!alignment.valid) {
    throw new ApiError(
      400,
      'NOT_SLOT_ALIGNED',
      'Requested range must be a whole number of 30-min slots within a single working window (it cannot span the lunch break or midnight)'
    );
  }

  const identity = resolveIdentity(user, body);

  // Check pass (no await between here and the commit pass below).
  if (!slotIndexService.isRangeFree(doctor_id, alignment.dateKey, alignment.slotIndices)) {
    throw new ApiError(409, 'SLOT_CONFLICT', 'One or more requested slots are already booked for this doctor');
  }

  // Commit pass.
  const now = nowIso();
  const appointment = {
    appointment_id: generateId(),
    doctor_id,
    client_id: identity.client_id,
    start_datetime: formatDateTime(start),
    end_datetime: formatDateTime(end),
    mobile_number: identity.mobile_number,
    email: identity.email,
    status: 'booked',
    metadata: body.metadata || {},
    created_datetime: now,
    updated_datetime: now,
  };
  slotIndexService.occupyRange(doctor_id, alignment.dateKey, alignment.slotIndices, appointment.appointment_id);
  db.insert('schedules', appointment);

  return appointment;
}

function cancelAppointment({ body, user }) {
  const { doctor_id } = body;

  doctorService.getDoctorOrThrow(doctor_id);
  const { start, end } = parseAndValidateRange(body.start_datetime, body.end_datetime);
  const identity = resolveIdentity(user, body);

  const match = db.findOne(
    'schedules',
    (appt) =>
      appt.doctor_id === doctor_id &&
      sameInstant(parseDateTime(appt.start_datetime), start) &&
      sameInstant(parseDateTime(appt.end_datetime), end) &&
      identityMatches(appt, identity)
  );

  // Identity mismatch and "truly doesn't exist" return the same 404 so we
  // never confirm the existence of someone else's appointment.
  if (!match) {
    throw new ApiError(404, 'APPOINTMENT_NOT_FOUND', 'No matching appointment found for the given doctor, time, and identity');
  }
  if (match.status === 'cancelled') {
    throw new ApiError(409, 'ALREADY_CANCELLED', 'This appointment has already been cancelled');
  }

  const alignment = alignToSlotIndices(parseDateTime(match.start_datetime), parseDateTime(match.end_datetime));
  if (alignment.valid) {
    slotIndexService.releaseRange(doctor_id, alignment.dateKey, alignment.slotIndices);
  }

  const updated = db.update('schedules', 'appointment_id', match.appointment_id, {
    status: 'cancelled',
    updated_datetime: nowIso(),
  });

  return updated;
}

// start_datetime/end_datetime are mandatory -- results are filtered to
// appointments whose start_datetime falls within [start, end). The API stays
// a plain mechanism with no implicit "give me everything" mode; the chat
// agent is the one that decides what range to ask for, defaulting to "next
// 30 days" when the patient doesn't name one -- that default lives in the
// system prompt, not here.
function getAppointmentDetails({ query, user }) {
  const { start, end } = parseAndValidateRange(query.start_datetime, query.end_datetime);
  const identity = resolveIdentity(user, query);

  return db
    .findMany('schedules', (appt) => {
      if (!identityMatches(appt, identity)) return false;
      const apptStart = parseDateTime(appt.start_datetime);
      return apptStart && apptStart.getTime() >= start.getTime() && apptStart.getTime() < end.getTime();
    })
    .slice()
    .sort((a, b) => parseDateTime(a.start_datetime).getTime() - parseDateTime(b.start_datetime).getTime());
}

module.exports = { bookAppointment, cancelAppointment, getAppointmentDetails };
