const SLOT_MINUTES = 30;

// 0 = Sunday ... 6 = Saturday. Doctors work Monday(1)-Saturday(6).
const WORKING_DAYS = [1, 2, 3, 4, 5, 6];

// Each window is [startHour, endHour) in 24h local time.
const MORNING_WINDOW = { startHour: 8, endHour: 12 };
const AFTERNOON_WINDOW = { startHour: 13, endHour: 20 };

const MORNING_SLOTS = ((MORNING_WINDOW.endHour - MORNING_WINDOW.startHour) * 60) / SLOT_MINUTES; // 8
const AFTERNOON_SLOTS = ((AFTERNOON_WINDOW.endHour - AFTERNOON_WINDOW.startHour) * 60) / SLOT_MINUTES; // 14
const SLOTS_PER_DAY = MORNING_SLOTS + AFTERNOON_SLOTS; // 22

module.exports = {
  SLOT_MINUTES,
  WORKING_DAYS,
  MORNING_WINDOW,
  AFTERNOON_WINDOW,
  MORNING_SLOTS,
  AFTERNOON_SLOTS,
  SLOTS_PER_DAY,
};
