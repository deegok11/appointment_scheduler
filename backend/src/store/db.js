const path = require('path');
const config = require('../config');
const { readJson, writeJsonAtomicAsync } = require('./jsonStore');

const FILES = {
  users: 'users.json',
  doctors: 'doctors.json',
  schedules: 'schedules.json',
  sessions: 'sessions.json',
};

const tables = {
  users: [],
  doctors: [],
  schedules: [],
  sessions: [],
};

function filePathFor(table) {
  return path.join(config.dataDir, FILES[table]);
}

function loadAll() {
  Object.keys(FILES).forEach((table) => {
    tables[table] = readJson(filePathFor(table), []);
  });
}

// Fire-and-forget: the disk write happens in the background, not before
// insert()/update() return. Safe for the slot-index concurrency logic because
// the in-memory mutation (which is what that logic depends on) already
// happened synchronously above, before persist() is even called.
function persist(table) {
  writeJsonAtomicAsync(filePathFor(table), tables[table]);
}

function getAll(table) {
  return tables[table];
}

function findById(table, idField, id) {
  return tables[table].find((row) => row[idField] === id) || null;
}

function findOne(table, predicate) {
  return tables[table].find(predicate) || null;
}

function findMany(table, predicate) {
  return tables[table].filter(predicate);
}

function insert(table, row) {
  tables[table].push(row);
  persist(table);
  return row;
}

function update(table, idField, id, patch) {
  const row = findById(table, idField, id);
  if (!row) return null;
  Object.assign(row, patch);
  persist(table);
  return row;
}

module.exports = {
  loadAll,
  getAll,
  findById,
  findOne,
  findMany,
  insert,
  update,
};
