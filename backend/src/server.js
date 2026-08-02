const config = require('./config');
const db = require('./store/db');
const slotIndexService = require('./services/slotIndex.service');
const createApp = require('./app');

db.loadAll();
slotIndexService.buildFromSchedules(db.getAll('schedules'));

const app = createApp();

app.listen(config.port, () => {
  console.log(`Scheduler backend listening on http://localhost:${config.port}`); // eslint-disable-line no-console
});
