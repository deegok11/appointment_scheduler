const bcrypt = require('bcryptjs');
const config = require('../config');
const db = require('../store/db');
const { generateId } = require('../utils/idGenerator');
const { normalizeEmail, normalizeMobile } = require('../utils/normalize');
const { formatDateTime, alignToSlotIndices } = require('../utils/dateUtils');
const seedData = require('./seedData');

function nowIso() {
  return new Date().toISOString();
}

// Finds a Date `daysAhead` from today at the given local hour, nudged forward
// past Sunday if it lands there, so seed bookings always fall on a working day.
function nextWorkingDateAtHour(daysAhead, hour, minute = 0) {
  const date = new Date();
  date.setDate(date.getDate() + daysAhead);
  date.setHours(hour, minute, 0, 0);
  while (date.getDay() === 0) {
    date.setDate(date.getDate() + 1);
  }
  return date;
}

function createUser({ username, password, name, mobile_number, email }) {
  const now = nowIso();
  const user = {
    user_id: generateId(),
    username,
    password: bcrypt.hashSync(password, config.bcryptRounds),
    name,
    mobile_number: normalizeMobile(mobile_number),
    email: normalizeEmail(email),
    created_datetime: now,
    updated_datetime: now,
    metadata: {},
  };
  db.insert('users', user);
  return user;
}

function createBooking(doctorId, start, end, identity) {
  const alignment = alignToSlotIndices(start, end);
  if (!alignment.valid) {
    throw new Error(`Seed booking not slot-aligned: ${start} - ${end} (${alignment.reason})`);
  }
  const now = nowIso();
  const appointment = {
    appointment_id: generateId(),
    doctor_id: doctorId,
    client_id: identity.client_id || null,
    start_datetime: formatDateTime(start),
    end_datetime: formatDateTime(end),
    mobile_number: identity.mobile_number,
    email: identity.email,
    status: 'booked',
    metadata: {},
    created_datetime: now,
    updated_datetime: now,
  };
  db.insert('schedules', appointment);
  return appointment;
}

function run() {
  db.loadAll();
  const force = process.argv.includes('--force');

  if (!force && db.getAll('users').length > 0) {
    console.log('Data already present — skipping seed (run `npm run seed -- --force` to wipe and reseed).'); // eslint-disable-line no-console
    return;
  }

  if (force) {
    ['users', 'doctors', 'schedules', 'sessions'].forEach((table) => {
      db.getAll(table).length = 0;
    });
  }

  const doctorUsers = seedData.doctors.map(createUser);
  const doctorRows = seedData.doctors.map((d, i) => {
    const now = nowIso();
    const doctor = {
      doctor_id: generateId(),
      user_id: doctorUsers[i].user_id,
      clinic_name: d.clinic_name,
      clinic_address: d.clinic_address,
      clinic_metadata: d.clinic_metadata,
      created_datetime: now,
      updated_datetime: now,
    };
    db.insert('doctors', doctor);
    return doctor;
  });

  const patientUsers = seedData.patients.map(createUser);
  const [drAmit, drSneha] = doctorRows;
  const [ravi, meera] = patientUsers;

  createBooking(drAmit.doctor_id, nextWorkingDateAtHour(2, 10, 0), nextWorkingDateAtHour(2, 10, 30), {
    client_id: ravi.user_id,
    mobile_number: ravi.mobile_number,
    email: ravi.email,
  });
  createBooking(drAmit.doctor_id, nextWorkingDateAtHour(2, 14, 0), nextWorkingDateAtHour(2, 15, 0), {
    client_id: null,
    mobile_number: normalizeMobile('9988776655'),
    email: normalizeEmail('guest.patient@example.com'),
  });
  createBooking(drSneha.doctor_id, nextWorkingDateAtHour(3, 9, 0), nextWorkingDateAtHour(3, 9, 30), {
    client_id: meera.user_id,
    mobile_number: meera.mobile_number,
    email: meera.email,
  });
  const cancelledBooking = createBooking(drSneha.doctor_id, nextWorkingDateAtHour(4, 16, 0), nextWorkingDateAtHour(4, 17, 0), {
    client_id: null,
    mobile_number: normalizeMobile('9988776656'),
    email: normalizeEmail('another.guest@example.com'),
  });
  db.update('schedules', 'appointment_id', cancelledBooking.appointment_id, {
    status: 'cancelled',
    updated_datetime: nowIso(),
  });

  console.log('Seed complete:'); // eslint-disable-line no-console
  console.log(`  Doctors: ${doctorRows.length}, Patients: ${patientUsers.length}, Bookings: 4 (1 cancelled)`); // eslint-disable-line no-console
  console.log('Sample credentials:'); // eslint-disable-line no-console
  console.log(`  Doctor login  -> username: ${seedData.doctors[0].username}, password: ${seedData.doctors[0].password}`); // eslint-disable-line no-console
  console.log(`  Patient login -> username: ${seedData.patients[0].username}, password: ${seedData.patients[0].password}`); // eslint-disable-line no-console
}

run();
