const fs = require('fs');
const fsPromises = require('fs/promises');
const path = require('path');

function readJson(filePath, defaultValue) {
  if (!fs.existsSync(filePath)) {
    writeJsonAtomicSync(filePath, defaultValue);
    return defaultValue;
  }
  const raw = fs.readFileSync(filePath, 'utf-8');
  if (!raw.trim()) return defaultValue;
  return JSON.parse(raw);
}

// Blocking writer, used only at boot to create a table file that doesn't exist yet.
function writeJsonAtomicSync(filePath, data) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const tmpPath = `${filePath}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), 'utf-8');
  fs.renameSync(tmpPath, filePath);
}

// One promise chain per file path, so two writes to the same file are never
// in flight at once. Without this, two async writes queued close together
// would race on the shared `${filePath}.tmp` and could let an older
// snapshot's rename clobber a newer one that finished first.
const writeQueues = new Map();

// Fire-and-forget writer used on every table mutation at runtime. Serializes
// a snapshot of `data` synchronously (so it reflects the exact in-memory
// state at call time), then queues the actual disk write in the background.
// Returns the pending promise so a caller *can* await it for a durability
// guarantee, but nothing in this codebase does — mutations return to the
// caller as soon as the in-memory state is updated, not after the disk write
// completes. A crash between those two points loses that one write.
function writeJsonAtomicAsync(filePath, data) {
  const json = JSON.stringify(data, null, 2);

  const previous = writeQueues.get(filePath) || Promise.resolve();
  const next = previous
    .catch(() => {}) // one failed write shouldn't block later writes to the same file
    .then(async () => {
      const dir = path.dirname(filePath);
      await fsPromises.mkdir(dir, { recursive: true });
      const tmpPath = `${filePath}.tmp`;
      await fsPromises.writeFile(tmpPath, json, 'utf-8');
      await fsPromises.rename(tmpPath, filePath);
    })
    .catch((err) => {
      console.error(`Failed to persist ${filePath}:`, err); // eslint-disable-line no-console
    });

  writeQueues.set(filePath, next);
  return next;
}

module.exports = { readJson, writeJsonAtomicSync, writeJsonAtomicAsync };
