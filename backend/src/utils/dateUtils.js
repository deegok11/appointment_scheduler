const {
  SLOT_MINUTES,
  WORKING_DAYS,
  MORNING_WINDOW,
  AFTERNOON_WINDOW,
  MORNING_SLOTS,
  SLOTS_PER_DAY,
} = require('../config/workingHours');

const SLOT_MS = SLOT_MINUTES * 60 * 1000;

function pad(n) {
  return String(n).padStart(2, '0');
}

function parseDateTime(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function dateKeyOf(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

// Formats as a naive "YYYY-MM-DDTHH:mm:ss" local wall-clock string (no Z/offset),
// the mirror image of how parseDateTime reads a string without a timezone
// designator as local time. Using Date#toISOString() here would silently
// convert to UTC and break that naive-datetime convention.
function formatDateTime(date) {
  return `${dateKeyOf(date)}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function isWorkingDay(date) {
  return WORKING_DAYS.includes(date.getDay());
}

function isPast(date) {
  return date.getTime() < Date.now();
}

// Returns the 0-21 slot index for a Date that lands exactly on a slot boundary
// within a working window, or null if it's outside working hours / not aligned.
function getSlotIndexForDateTime(date) {
  if (date.getSeconds() !== 0 || date.getMilliseconds() !== 0) return null;

  const totalMin = date.getHours() * 60 + date.getMinutes();
  const mStartMin = MORNING_WINDOW.startHour * 60;
  const mEndMin = MORNING_WINDOW.endHour * 60;
  const aStartMin = AFTERNOON_WINDOW.startHour * 60;
  const aEndMin = AFTERNOON_WINDOW.endHour * 60;

  if (totalMin >= mStartMin && totalMin < mEndMin && (totalMin - mStartMin) % SLOT_MINUTES === 0) {
    return (totalMin - mStartMin) / SLOT_MINUTES;
  }
  if (totalMin >= aStartMin && totalMin < aEndMin && (totalMin - aStartMin) % SLOT_MINUTES === 0) {
    return MORNING_SLOTS + (totalMin - aStartMin) / SLOT_MINUTES;
  }
  return null;
}

// Absolute start/end Date for a given date-key ("YYYY-MM-DD") + slot index (0-21).
function getSlotDateTime(dateKey, slotIndex) {
  const [y, m, d] = dateKey.split('-').map(Number);
  let hour;
  let minute;
  if (slotIndex < MORNING_SLOTS) {
    const totalMin = MORNING_WINDOW.startHour * 60 + slotIndex * SLOT_MINUTES;
    hour = Math.floor(totalMin / 60);
    minute = totalMin % 60;
  } else {
    const offset = slotIndex - MORNING_SLOTS;
    const totalMin = AFTERNOON_WINDOW.startHour * 60 + offset * SLOT_MINUTES;
    hour = Math.floor(totalMin / 60);
    minute = totalMin % 60;
  }
  const start = new Date(y, m - 1, d, hour, minute, 0, 0);
  const end = new Date(start.getTime() + SLOT_MS);
  return { start, end };
}

// Classifies a single point in time against the working-hours grid:
//  - 'NOT_WORKING_DAY': falls on a Sunday
//  - 'OUTSIDE_WINDOW': working day, but before 8AM, after 8PM, or in the 12-1PM lunch gap
//  - 'NOT_ALIGNED': within a working window but not on a 30-min slot boundary
//  - 'OK': a valid slot-boundary instant
// Kept separate from alignToSlotIndices so callers can distinguish "outside
// working hours entirely" from "wrong shape of an otherwise-valid range".
function classifyDateTime(date) {
  if (!isWorkingDay(date)) return 'NOT_WORKING_DAY';

  const totalMin = date.getHours() * 60 + date.getMinutes();
  const mStartMin = MORNING_WINDOW.startHour * 60;
  const mEndMin = MORNING_WINDOW.endHour * 60;
  const aStartMin = AFTERNOON_WINDOW.startHour * 60;
  const aEndMin = AFTERNOON_WINDOW.endHour * 60;

  const withinMorning = totalMin >= mStartMin && totalMin < mEndMin;
  const withinAfternoon = totalMin >= aStartMin && totalMin < aEndMin;
  if (!withinMorning && !withinAfternoon) return 'OUTSIDE_WINDOW';

  return getSlotIndexForDateTime(date) === null ? 'NOT_ALIGNED' : 'OK';
}

// Validates that [startDate, endDate) lands on a contiguous run of slots within
// a single working day, with no gaps (e.g. can't span the lunch break or midnight).
// Returns { valid: true, dateKey, slotIndices } or { valid: false, reason }.
function alignToSlotIndices(startDate, endDate) {
  if (!isWorkingDay(startDate)) {
    return { valid: false, reason: 'NOT_WORKING_DAY' };
  }
  if (dateKeyOf(startDate) !== dateKeyOf(endDate)) {
    return { valid: false, reason: 'CROSSES_DATE' };
  }

  const diffMs = endDate.getTime() - startDate.getTime();
  if (diffMs <= 0 || diffMs % SLOT_MS !== 0) {
    return { valid: false, reason: 'NOT_SLOT_ALIGNED' };
  }
  const numSlots = diffMs / SLOT_MS;

  const startIndex = getSlotIndexForDateTime(startDate);
  if (startIndex === null) {
    return { valid: false, reason: 'NOT_SLOT_ALIGNED' };
  }

  const indices = [startIndex];
  let cursor = new Date(startDate.getTime());
  for (let i = 1; i < numSlots; i += 1) {
    cursor = new Date(cursor.getTime() + SLOT_MS);
    const idx = getSlotIndexForDateTime(cursor);
    if (idx === null || idx !== indices[indices.length - 1] + 1) {
      return { valid: false, reason: 'NOT_SLOT_ALIGNED' };
    }
    indices.push(idx);
  }

  return { valid: true, dateKey: dateKeyOf(startDate), slotIndices: indices };
}

// Enumerates every slot on every working day between startDate and endDate
// (inclusive by calendar date) whose [slotStart, slotEnd) overlaps the query range.
function getSlotGridForRange(startDate, endDate) {
  const slots = [];
  const cursorDate = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
  const lastDate = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate());

  while (cursorDate.getTime() <= lastDate.getTime()) {
    if (isWorkingDay(cursorDate)) {
      const dateKey = dateKeyOf(cursorDate);
      for (let slotIndex = 0; slotIndex < SLOTS_PER_DAY; slotIndex += 1) {
        const { start, end } = getSlotDateTime(dateKey, slotIndex);
        if (start.getTime() < endDate.getTime() && end.getTime() > startDate.getTime()) {
          slots.push({ dateKey, slotIndex, start, end });
        }
      }
    }
    cursorDate.setDate(cursorDate.getDate() + 1);
  }

  return slots;
}

module.exports = {
  parseDateTime,
  dateKeyOf,
  formatDateTime,
  isWorkingDay,
  isPast,
  classifyDateTime,
  getSlotIndexForDateTime,
  getSlotDateTime,
  alignToSlotIndices,
  getSlotGridForRange,
};
