const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const socketService = require('../services/socket.service');
const socketErrorCodes = require('../errors/socketErrorCodes');

beforeEach(() => {
  socketService.shutdownSocket();
});

test('isSocketReady is false before initialization', () => {
  assert.equal(socketService.isSocketReady(), false);
});

test('emit methods throw when socket is not initialized', () => {
  assert.throws(
    () => socketService.emitToUser('507f1f77bcf86cd799439012', 'task.created', {}),
    (err) => err.code === socketErrorCodes.SOCKET_NOT_INITIALIZED
  );
});

test('initializeSocket marks namespace ready on standalone server', () => {
  const server = http.createServer();
  socketService.initializeSocket(server);

  assert.equal(socketService.isSocketReady(), true);
  assert.ok(socketService.getSocketServer());

  socketService.shutdownSocket();
  server.close();
});
