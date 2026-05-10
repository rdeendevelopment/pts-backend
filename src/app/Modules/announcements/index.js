const { ensureAnnouncementIndexes } = require('./models/announcement.model');

module.exports = {
  router: require('./routes/announcement.routes'),
  ensureAnnouncementIndexes,
};
