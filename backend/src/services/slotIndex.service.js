const { SLOTS_PER_DAY } = require('../config/workingHours');
const { alignToSlotIndices } = require('../utils/dateUtils');

// In-memory only, always rebuilt from schedule_table at boot so it can never
// drift out of sync with the JSON file that's the actual source of truth.
// key: `${doctorId}::${dateKey}` -> Array(22) of (appointmentId | null)
const index = new Map();

function keyFor(doctorId, dateKey) {
  return `${doctorId}::${dateKey}`;
}

function getOrCreateDay(doctorId, dateKey) {
  const key = keyFor(doctorId, dateKey);
  if (!index.has(key)) {
    index.set(key, new Array(SLOTS_PER_DAY).fill(null));
  }
  return index.get(key);
}

function buildFromSchedules(schedules) {
  index.clear();
  schedules
    .filter((appointment) => appointment.status === 'booked')
    .forEach((appointment) => {
      const start = new Date(appointment.start_datetime);
      const end = new Date(appointment.end_datetime);
      const alignment = alignToSlotIndices(start, end);
      if (!alignment.valid) return; // defensive: ignore malformed legacy rows
      const day = getOrCreateDay(appointment.doctor_id, alignment.dateKey);
      alignment.slotIndices.forEach((idx) => {
        day[idx] = appointment.appointment_id;
      });
    });
}

// Check pass — call synchronously right before occupyRange, with no await in between.
function isRangeFree(doctorId, dateKey, slotIndices) {
  const day = index.get(keyFor(doctorId, dateKey));
  if (!day) return true;
  return slotIndices.every((idx) => day[idx] === null);
}

// Commit pass — only call after isRangeFree returned true in the same synchronous tick.
function occupyRange(doctorId, dateKey, slotIndices, appointmentId) {
  const day = getOrCreateDay(doctorId, dateKey);
  slotIndices.forEach((idx) => {
    day[idx] = appointmentId;
  });
}

function releaseRange(doctorId, dateKey, slotIndices) {
  const day = index.get(keyFor(doctorId, dateKey));
  if (!day) return;
  slotIndices.forEach((idx) => {
    day[idx] = null;
  });
}

function getSlotStatus(doctorId, dateKey, slotIndex) {
  const day = index.get(keyFor(doctorId, dateKey));
  if (!day || day[slotIndex] === null) return 'free';
  return 'booked';
}

module.exports = {
  buildFromSchedules,
  isRangeFree,
  occupyRange,
  releaseRange,
  getSlotStatus,
};
