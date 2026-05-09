const { CONVERSATION_TYPES, MEMBER_ROLES } = require('../constants/converse.constants');

function groupAdmin(req, res, next) {
  const conv = req.conversation;
  const member = req.conversationMember;

  if (!conv || !member) {
    return res.status(403).json({ success: false, message: 'Access denied' });
  }

  if (conv.type !== CONVERSATION_TYPES.GROUP) {
    return res.status(422).json({
      success: false,
      message: 'This operation is only available for group conversations',
    });
  }

  if (![MEMBER_ROLES.OWNER, MEMBER_ROLES.ADMIN].includes(member.role)) {
    return res.status(403).json({
      success: false,
      message: 'Only group owners and admins can perform this action',
    });
  }

  return next();
}

module.exports = groupAdmin;
