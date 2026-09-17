const { warn } = require('../../../kernel/logger');
const notificationService = require('../../tasks/services/taskNotification.service');
const socketService = require('../../socket/services/socket.service');
const userRepository = require('../../users/repositories/user.repository');

function safePreview(value, max = 120) {
  const text = String(value || '').replace(/```[\s\S]*?```/g, '[code]')
    .replace(/\s+/g, ' ').trim();
  if (!text) return 'Sent an attachment';
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

function notificationKind({ conversation, recipientId, mentions, mentionAll, replyTo }) {
  if (mentionAll || mentions.has(String(recipientId))) return 'mentioned';
  if (replyTo?.senderId && String(replyTo.senderId) === String(recipientId)) return 'replied';
  if (conversation.type === 'direct') return 'direct_message';
  return null;
}

function titleFor(kind, actorName, conversationTitle) {
  if (kind === 'mentioned') return `${actorName} mentioned you in ${conversationTitle}`;
  if (kind === 'replied') return `${actorName} replied to your message`;
  return `${actorName} sent you a message`;
}

async function notifyForMessage({ conversation, message, actorUserId, actorName, participants = [] }) {
  if (!conversation || !message || !actorUserId) return [];
  let actor = null;
  try { actor = await userRepository.findById(actorUserId); } catch (_) { /* best-effort enrichment */ }
  const actorAccountId = actor?.accountId || null;
  const mentionIds = new Set((message.mentions || []).map(String));
  const conversationTitle = conversation.title || (conversation.type === 'direct' ? 'Converse' : 'conversation');
  const created = [];

  for (const participant of participants) {
    const recipientId = String(participant.userId || '');
    if (!recipientId || recipientId === String(actorUserId) || participant.isMuted) continue;
    const kind = notificationKind({
      conversation,
      recipientId,
      mentions: mentionIds,
      mentionAll: Boolean(message.mentionAll),
      replyTo: message.replyTo,
    });
    if (!kind) continue;

    // Joining a conversation room means the user is actively viewing that chat.
    if (await socketService.isUserInConversation(recipientId, conversation._id)) continue;

    try {
      const notification = await notificationService.createAndEmitNotification({
        userId: recipientId,
        actorId: actorAccountId,
        actorName: actorName || actor?.displayName || 'Someone',
        type: `converse_${kind}`,
        module: 'converse',
        eventKey: kind,
        entityType: 'conversation',
        entityId: String(conversation._id),
        category: kind === 'mentioned' ? 'mention' : 'comment',
        title: titleFor(kind, actorName || actor?.displayName || 'Someone', conversationTitle),
        message: safePreview(message.text),
        link: `/converse/${conversation._id}?messageId=${message._id}`,
        metadata: {
          conversationId: String(conversation._id),
          conversationType: conversation.type,
          conversationTitle,
          messageId: String(message._id),
          preview: safePreview(message.text),
        },
        dedupeKey: `converse:${message._id}:${recipientId}`,
      });
      if (notification) created.push(notification);
    } catch (error) {
      // Messaging must remain available even when the notification subsystem is degraded.
      warn('Converse notification delivery skipped', {
        conversationId: String(conversation._id),
        messageId: String(message._id),
        recipientId,
        message: error.message,
      });
    }
  }
  return created;
}

module.exports = { safePreview, notificationKind, notifyForMessage };
