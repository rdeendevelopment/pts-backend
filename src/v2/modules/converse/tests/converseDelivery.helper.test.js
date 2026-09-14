const { test } = require('node:test');
const assert = require('node:assert/strict');
const socketService = require('../../socket/services/socket.service');
const { SERVER_EVENTS } = require('../../socket/constants/socket.constants');
const { emitConverseMessageDelivered } = require('../../socket/helpers/converseSocketEvents.helper');

test('one new-message event is emitted per participant user room', () => {
  const originalEmit = socketService.emitToUser;
  const originalReady = socketService.isSocketReady;
  const sent = [];
  socketService.isSocketReady = () => true;
  socketService.emitToUser = (userId, event, payload) => sent.push({ userId: String(userId), event, payload });
  try {
    emitConverseMessageDelivered('507f1f77bcf86cd799439030', {
      _id: '507f1f77bcf86cd799439099', conversationId: '507f1f77bcf86cd799439030',
      senderId: '507f1f77bcf86cd799439011', text: 'hello', type: 'text', createdAt: new Date(),
    }, [
      { userId: '507f1f77bcf86cd799439011', unreadCount: 0 },
      { userId: '507f1f77bcf86cd799439012', unreadCount: 1 },
      { userId: '507f1f77bcf86cd799439012', unreadCount: 1 },
    ]);
    const created = sent.filter((row) => row.event === SERVER_EVENTS.CONVERSE_MESSAGE_CREATED);
    assert.deepEqual(created.map((row) => row.userId), [
      '507f1f77bcf86cd799439011', '507f1f77bcf86cd799439012',
    ]);
    assert.equal(created[1].payload.message.text, 'hello');
  } finally {
    socketService.emitToUser = originalEmit;
    socketService.isSocketReady = originalReady;
  }
});
