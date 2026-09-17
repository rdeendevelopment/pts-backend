const test = require('node:test');
const assert = require('node:assert/strict');

const { MessageSchema } = require('../models/message.model');
const { ConversationSchema } = require('../models/conversation.model');
const service = require('../services/converse.service');
const { toMessageDto, toLastMessageDto } = require('../dto/converse.dto');

test('Converse persists explicit media classification and forwarding metadata', () => {
  const attachment = MessageSchema.path('attachments').schema;
  assert.ok(attachment.path('storageKey'));
  assert.ok(attachment.path('mimeType'));
  assert.ok(attachment.path('category'));
  assert.ok(attachment.path('duration'));
  assert.ok(MessageSchema.path('isForwarded'));
  assert.equal(typeof service.forwardMessage, 'function');
});

test('Converse last-message previews retain attachment category and safe filename', () => {
  const lastMessage = ConversationSchema.path('lastMessage').schema;
  assert.ok(lastMessage.path('attachmentCategory'));
  assert.ok(lastMessage.path('attachmentFileName'));
  const dto = toLastMessageDto({ attachmentCategory: 'voice', attachmentFileName: 'voice-note.webm' });
  assert.equal(dto.attachmentCategory, 'voice');
  assert.equal(dto.attachmentFileName, 'voice-note.webm');
});

test('forwarded marker is returned to recipients', () => {
  const dto = toMessageDto({ _id: 'm', conversationId: 'c', senderId: 'u', isForwarded: true });
  assert.equal(dto.isForwarded, true);
});
