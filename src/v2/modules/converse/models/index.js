const { ensureConversationIndexes } = require('./conversation.model');
const { ensureConversationParticipantIndexes } = require('./conversationParticipant.model');
const { ensureMessageIndexes } = require('./message.model');

module.exports = {
  ensureConversationIndexes,
  ensureConversationParticipantIndexes,
  ensureMessageIndexes,
};
