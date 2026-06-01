const { test } = require('node:test');
const assert = require('node:assert/strict');

test('converse socket emits are best-effort and do not throw when socket service fails', async () => {
  const socketServicePath = require.resolve('../../socket/services/socket.service');
  const emitHelperPath = require.resolve('../../socket/helpers/socketEmit.helper');

  const originalSocket = require.cache[socketServicePath];
  const originalEmit = require.cache[emitHelperPath];

  delete require.cache[require.resolve('../helpers/converseRealtime.helper')];
  delete require.cache[require.resolve('../../socket/helpers/converseSocketEvents.helper')];

  require.cache[socketServicePath] = {
    id: socketServicePath,
    filename: socketServicePath,
    loaded: true,
    exports: {
      emitToConversation: () => {
        throw new Error('socket down');
      },
      emitToUser: () => {
        throw new Error('socket down');
      },
    },
  };

  require.cache[emitHelperPath] = {
    id: emitHelperPath,
    filename: emitHelperPath,
    loaded: true,
    exports: {
      emitBestEffort: (fn) => {
        try {
          fn();
        } catch (_err) {
          // swallowed
        }
      },
    },
  };

  const {
    emitConverseMessageCreated,
    emitConverseUnreadUpdated,
  } = require('../../socket/helpers/converseSocketEvents.helper');

  assert.doesNotThrow(() => {
    emitConverseMessageCreated('507f1f77bcf86cd799439020', { _id: '507f1f77bcf86cd799439021', text: 'hi' });
    emitConverseUnreadUpdated('507f1f77bcf86cd799439011', { conversationId: '507f1f77bcf86cd799439020', unreadCount: 1 });
  });

  if (originalSocket) require.cache[socketServicePath] = originalSocket;
  else delete require.cache[socketServicePath];
  if (originalEmit) require.cache[emitHelperPath] = originalEmit;
  else delete require.cache[emitHelperPath];
});
