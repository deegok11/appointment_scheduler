function pad(n) {
  return String(n).padStart(2, '0');
}

// "YYYY-MM-DD" using local getters (not toISOString, which is UTC and can
// shift the calendar day near midnight) -- matches the backend's naive local
// datetime convention.
export function toDateInputValue(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

// Start of the given calendar day, as a naive local ISO string.
export function dateInputToStartOfDayIso(dateStr) {
  return `${dateStr}T00:00:00`;
}

// Start of the day AFTER the given calendar day, so a [start, end) range
// built from these two helpers inclusively covers the whole end date rather
// than excluding it.
export function dateInputToExclusiveEndIso(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = addDays(new Date(y, m - 1, d), 1);
  return `${toDateInputValue(date)}T00:00:00`;
}
