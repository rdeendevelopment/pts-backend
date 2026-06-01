const routes = require('./announcements.routes');
const { ensureAnnouncementIndexes } = require('./models/announcement.model');
const { ensureAnnouncementReceiptIndexes } = require('./models/announcementReceipt.model');

async function ensureAnnouncementsModuleIndexes() {
  await ensureAnnouncementIndexes();
  await ensureAnnouncementReceiptIndexes();
}

module.exports = {
  routes,
  ensureAnnouncementsModuleIndexes,
};
