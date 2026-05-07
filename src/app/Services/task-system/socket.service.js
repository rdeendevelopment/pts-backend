const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const constants = require('../../../../config/constants');
const { CoreUser, AccountAdmin } = require('../../MongoModels');

let io = null;
const userSockets = {};

function socketKeysForUser(user) {
  return [String(user._id), String(user.legacyId)].filter(Boolean);
}

function initSocket(httpServer) {
  io = new Server(httpServer, {
    cors: { origin: '*', methods: ['GET', 'POST'] },
  });

  io.use(async (socket, next) => {
    try {
      const rawToken = socket.handshake.auth?.token || socket.handshake.headers?.authorization;
      const token = String(rawToken || '').replace(/^Bearer\s+/i, '').trim();
      if (!token) return next(new Error('No token'));

      const decoded = jwt.verify(token, constants.APP_SECRET);
      const tokenUserId = decoded?.user?.id;
      if (!tokenUserId) return next(new Error('Invalid token'));

      const accountType = decoded?.user?.accountType;
      const Model = accountType === 'admin' ? AccountAdmin : CoreUser;
      const user = await Model.findOne({
        legacyId: Number(tokenUserId),
        isDeleted: false,
        isActive: true,
      }).lean();
      if (!user) return next(new Error('User not found'));

      socket.userKeys = socketKeysForUser(user);
      next();
    } catch {
      next(new Error('Authentication failed'));
    }
  });

  io.on('connection', (socket) => {
    (socket.userKeys || []).forEach((key) => {
      userSockets[key] = socket.id;
    });

    socket.on('disconnect', () => {
      (socket.userKeys || []).forEach((key) => {
        if (userSockets[key] === socket.id) delete userSockets[key];
      });
    });
  });
}

function sendToUser(userId, event, data) {
  if (!io) return;
  const socketId = userSockets[String(userId)];
  if (socketId) io.to(socketId).emit(event, data);
}

function getIO() {
  return io;
}

module.exports = { initSocket, sendToUser, getIO };
