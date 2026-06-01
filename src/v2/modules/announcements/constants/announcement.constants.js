const ANNOUNCEMENT_TYPES = ['info', 'success', 'warning', 'maintenance', 'critical'];
const ANNOUNCEMENT_PRIORITIES = ['low', 'normal', 'high', 'critical'];
const AUDIENCE_TYPES = ['all', 'roles', 'users', 'client'];

const MAX_TITLE_LENGTH = 120;
const MAX_MESSAGE_LENGTH = 2000;

module.exports = {
  ANNOUNCEMENT_TYPES,
  ANNOUNCEMENT_PRIORITIES,
  AUDIENCE_TYPES,
  MAX_TITLE_LENGTH,
  MAX_MESSAGE_LENGTH,
};
