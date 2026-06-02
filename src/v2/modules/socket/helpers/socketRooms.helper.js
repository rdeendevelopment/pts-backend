const { AppError } = require('../../../kernel/errors');
const { assertObjectId } = require('../../../kernel/validators/objectId');
const { ROOM_PREFIX } = require('../constants/socket.constants');
const socketErrorCodes = require('../errors/socketErrorCodes');

function toIdString(id, fieldName) {
  return String(assertObjectId(id, fieldName));
}

function getAccountRoom(accountId) {
  return `${ROOM_PREFIX.ACCOUNT}:${toIdString(accountId, 'accountId')}`;
}

function getUserRoom(userId) {
  return `${ROOM_PREFIX.USER}:${toIdString(userId, 'userId')}`;
}

function getRoleRoom(role) {
  const value = String(role || '').trim().toLowerCase().replace(/_/g, '-');
  if (!value) {
    throw new AppError('Invalid socket role room', {
      status: 400,
      code: socketErrorCodes.SOCKET_ROOM_INVALID,
    });
  }
  return `${ROOM_PREFIX.ROLE}:${value}`;
}

function getProjectRoom(projectId) {
  return `${ROOM_PREFIX.PROJECT}:${toIdString(projectId, 'projectId')}`;
}

function getTaskRoom(taskId) {
  return `${ROOM_PREFIX.TASK}:${toIdString(taskId, 'taskId')}`;
}

function getConversationRoom(conversationId) {
  return `${ROOM_PREFIX.CONVERSATION}:${toIdString(conversationId, 'conversationId')}`;
}

const ALLOWED_PREFIXES = new Set(Object.values(ROOM_PREFIX));

function assertKnownRoom(roomName) {
  if (!roomName || typeof roomName !== 'string') {
    throw new AppError('Invalid socket room', {
      status: 400,
      code: socketErrorCodes.SOCKET_ROOM_INVALID,
    });
  }

  const prefix = roomName.split(':')[0];
  if (!ALLOWED_PREFIXES.has(prefix)) {
    throw new AppError('Invalid socket room', {
      status: 400,
      code: socketErrorCodes.SOCKET_ROOM_INVALID,
      details: { room: roomName },
    });
  }

  return roomName;
}

module.exports = {
  getAccountRoom,
  getUserRoom,
  getRoleRoom,
  getProjectRoom,
  getTaskRoom,
  getConversationRoom,
  assertKnownRoom,
  ROOM_PREFIX,
};
