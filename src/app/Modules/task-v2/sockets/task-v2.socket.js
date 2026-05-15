// V2 socket helpers — completely separate from the legacy socket.service.js.
// Uses the shared io instance from the old socket service (same HTTP server).
// All V2 events are prefixed with "taskV2:" to avoid collision with v1 events.
// Project rooms: "taskV2:project:{projectSourceId}"

const { getIO, sendToUser } = require('../../../Services/task-system/socket.service');

const v2ProjectRoom = (projectSourceId) => `taskV2:project:${projectSourceId}`;

function registerV2SocketHandlers(socket) {
  socket.on('taskV2:joinProject', ({ projectId } = {}) => {
    if (projectId) socket.join(v2ProjectRoom(String(projectId)));
  });

  socket.on('taskV2:leaveProject', ({ projectId } = {}) => {
    if (projectId) socket.leave(v2ProjectRoom(String(projectId)));
  });
}

function broadcastToV2Project(projectSourceId, event, data, excludeSocketId = null) {
  const io = getIO();
  if (!io || !projectSourceId) return;
  const room = v2ProjectRoom(String(projectSourceId));
  const emitter = excludeSocketId ? io.to(room).except(excludeSocketId) : io.to(room);
  emitter.emit(`taskV2:${event}`, data);
}

function notifyV2User(userId, event, data) {
  if (!userId) return;
  // Deliver via authenticated socket map (same mechanism as legacy sendToUser).
  sendToUser(userId, `taskV2:${event}`, data || {});
}

module.exports = { registerV2SocketHandlers, broadcastToV2Project, notifyV2User, v2ProjectRoom };
