const db = require('../store/db');
const ApiError = require('../errors/ApiError');
const slotIndex = require('./slotIndex.service');
const { getSlotGridForRange, formatDateTime, parseDateTime } = require('../utils/dateUtils');

function toPublicDoctor(doctor) {
  const user = db.findById('users', 'user_id', doctor.user_id);
  return {
    doctor_id: doctor.doctor_id,
    name: user ? user.name : null,
    mobile_number: user ? user.mobile_number : null,
    email: user ? user.email : null,
    clinic_name: doctor.clinic_name,
    clinic_address: doctor.clinic_address,
    clinic_metadata: doctor.clinic_metadata,
  };
}

function listDoctors() {
  return db.getAll('doctors').map(toPublicDoctor);
}

function getDoctorOrThrow(doctorId) {
  const doctor = db.findById('doctors', 'doctor_id', doctorId);
  if (!doctor) {
    throw new ApiError(404, 'DOCTOR_NOT_FOUND', `No doctor with doctor_id "${doctorId}"`);
  }
  return doctor;
}

function findDoctorByUserId(userId) {
  return db.findOne('doctors', (d) => d.user_id === userId);
}

function getAvailability(doctorId, start, end) {
  getDoctorOrThrow(doctorId);
  const slots = getSlotGridForRange(start, end);
  return slots.map((slot) => ({
    date: slot.dateKey,
    slot_index: slot.slotIndex,
    start_datetime: formatDateTime(slot.start),
    end_datetime: formatDateTime(slot.end),
    status: slotIndex.getSlotStatus(doctorId, slot.dateKey, slot.slotIndex),
  }));
}

// The doctor's own view of their schedule -- unlike getAvailability (public,
// free/busy only, no PII), this returns full appointment details including
// the patient's name (resolved via client_id for logged-in bookers; guests
// only ever have mobile_number/email, so patient_name is null for those).
function getMyAppointments(userId, start, end) {
  const doctor = findDoctorByUserId(userId);
  if (!doctor) {
    throw new ApiError(403, 'NOT_A_DOCTOR', 'This account is not associated with a doctor');
  }

  return db
    .findMany('schedules', (appt) => {
      if (appt.doctor_id !== doctor.doctor_id) return false;
      const apptStart = parseDateTime(appt.start_datetime);
      return apptStart && apptStart.getTime() >= start.getTime() && apptStart.getTime() < end.getTime();
    })
    .map((appt) => {
      const patient = appt.client_id ? db.findById('users', 'user_id', appt.client_id) : null;
      return {
        appointment_id: appt.appointment_id,
        start_datetime: appt.start_datetime,
        end_datetime: appt.end_datetime,
        status: appt.status,
        patient_name: patient ? patient.name : null,
        mobile_number: appt.mobile_number,
        email: appt.email,
      };
    })
    .sort((a, b) => parseDateTime(a.start_datetime).getTime() - parseDateTime(b.start_datetime).getTime());
}

module.exports = { listDoctors, getDoctorOrThrow, findDoctorByUserId, getAvailability, getMyAppointments, toPublicDoctor };
