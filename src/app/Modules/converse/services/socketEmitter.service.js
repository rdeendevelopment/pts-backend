const { getIO } = require('../../../Services/task-system/socket.service');

function emitToConversation(conversationId, event, data, excludeSocketId) {
  const io = getIO();
  if (!io) return;
  const room = `conversation:${conversationId}`;
  if (excludeSocketId) {
    io.to(room).except(excludeSocketId).emit(event, data);
  } else {
    io.to(room).emit(event, data);
  }
}

function emitToUser(userId, event, data) {
  const io = getIO();
  if (!io) return;
  io.to(`user:${String(userId)}`).emit(event, data);
}

module.exports = { emitToConversation, emitToUser };
