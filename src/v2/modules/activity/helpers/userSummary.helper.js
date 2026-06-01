const { getUserModel } = require('../../users/models/user.model');

function toUserSummaryDto(user) {
  if (!user) return null;
  const doc = user.toObject ? user.toObject() : user;
  const firstName = doc.firstName || '';
  const lastName = doc.lastName || '';
  return {
    userId: String(doc._id),
    firstName,
    lastName,
    email: doc.email || null,
    displayName: doc.displayName || [firstName, lastName].filter(Boolean).join(' ').trim() || doc.email || null,
  };
}

async function resolveUsersByIds(userIds = []) {
  const unique = [...new Set(userIds.map((id) => String(id)).filter(Boolean))];
  if (!unique.length) return new Map();

  const User = getUserModel();
  const users = await User.find({ _id: { $in: unique }, isDeleted: false }).lean();
  const map = new Map();
  for (const user of users) {
    map.set(String(user._id), toUserSummaryDto(user));
  }
  return map;
}

module.exports = {
  toUserSummaryDto,
  resolveUsersByIds,
};
