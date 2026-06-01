const { AppError } = require('../../../kernel/errors');
const { assertObjectId } = require('../../../kernel/validators/objectId');
const projectsModule = require('../../projects');
const taskRepository = require('../../tasks/repositories/task.repository');
const socketErrorCodes = require('../errors/socketErrorCodes');
const {
  getProjectRoom,
  getTaskRoom,
  getConversationRoom,
} = require('../helpers/socketRooms.helper');

function forbidden(details = {}) {
  throw new AppError('Not allowed to join this room', {
    status: 403,
    code: socketErrorCodes.SOCKET_FORBIDDEN,
    details,
  });
}

async function assertProjectRoomAccess(projectId, userId) {
  if (!userId) {
    forbidden({ reason: 'User profile required for project rooms' });
  }

  const normalizedProjectId = assertObjectId(projectId, 'projectId');
  await projectsModule.getProjectForActivity(normalizedProjectId);

  const assignment = await projectsModule.getAssignmentForUser(normalizedProjectId, userId);
  if (!assignment) {
    forbidden({ projectId: String(normalizedProjectId), userId: String(userId) });
  }

  return getProjectRoom(normalizedProjectId);
}

async function assertTaskRoomAccess(taskId, userId) {
  const normalizedTaskId = assertObjectId(taskId, 'taskId');
  const task = await taskRepository.findById(normalizedTaskId);
  if (!task) {
    throw new AppError('Task not found', {
      status: 404,
      code: socketErrorCodes.SOCKET_ROOM_INVALID,
      details: { taskId: String(normalizedTaskId) },
    });
  }

  await assertProjectRoomAccess(task.projectId, userId);
  return getTaskRoom(normalizedTaskId);
}

async function assertConversationRoomAccess(conversationId, userId) {
  const normalizedConversationId = assertObjectId(conversationId, 'conversationId');
  const converseService = require('../../converse/services/converse.service');
  await converseService.assertConversationParticipant(normalizedConversationId, userId);
  return getConversationRoom(normalizedConversationId);
}

module.exports = {
  assertProjectRoomAccess,
  assertTaskRoomAccess,
  assertConversationRoomAccess,
};
