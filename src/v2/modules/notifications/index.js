const routes = require('./notifications.routes');
const { ensureNotificationSettingsIndexes } = require('./models/notificationSettings.model');

module.exports = {
  routes,
  ensureNotificationSettingsIndexes,
};
