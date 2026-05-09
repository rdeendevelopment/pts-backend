const MODULE_KEYS = {
  CONVERSE: 'converse',
};

const CONVERSATION_TYPES = {
  DIRECT: 'direct',
  GROUP:  'group',
};

const MESSAGE_TYPES = {
  TEXT:   'text',
  IMAGE:  'image',
  FILE:   'file',
  SYSTEM: 'system',
};

const MEMBER_ROLES = {
  OWNER:  'owner',
  ADMIN:  'admin',
  MEMBER: 'member',
};

const PAGINATION = {
  DEFAULT_PAGE:  1,
  DEFAULT_LIMIT: 30,
  MAX_LIMIT:     100,
};

module.exports = {
  MODULE_KEYS,
  CONVERSATION_TYPES,
  MESSAGE_TYPES,
  MEMBER_ROLES,
  PAGINATION,
};
