const CONVERSATION_TYPES = {
  DIRECT: 'direct',
  GROUP: 'group',
  PROJECT: 'project',
};

const MEMBER_ROLES = {
  OWNER: 'owner',
  ADMIN: 'admin',
  MEMBER: 'member',
};

const MESSAGE_TYPES = {
  TEXT: 'text',
  FILE: 'file',
  SYSTEM: 'system',
};

const MESSAGE_STATUS = {
  SENDING: 'sending',
  SENT: 'sent',
  DELIVERED: 'delivered',
  SEEN: 'seen',
};

const ADMIN_ROLES = new Set([MEMBER_ROLES.OWNER, MEMBER_ROLES.ADMIN]);

module.exports = {
  CONVERSATION_TYPES,
  MEMBER_ROLES,
  MESSAGE_TYPES,
  MESSAGE_STATUS,
  ADMIN_ROLES,
  MIN_GROUP_PARTICIPANTS: 2,
  MAX_MESSAGE_LENGTH: 4000,
  MAX_GROUP_TITLE_LENGTH: 120,
};
