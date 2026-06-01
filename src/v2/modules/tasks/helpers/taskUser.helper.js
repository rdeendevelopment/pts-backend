const userRepository = require('../../users/repositories/user.repository');
const accountRepository = require('../../auth/repositories/account.repository');

function displayName(user) {
  if (!user) return '';
  if (user.displayName && String(user.displayName).trim()) return String(user.displayName).trim();
  const fullName = `${user.firstName || ''} ${user.lastName || ''}`.trim();
  if (fullName) return fullName;
  return user.email || '';
}

async function resolveUsersByIds(userIds = []) {
  const ids = [...new Set((userIds || []).map((id) => String(id)).filter(Boolean))];
  const map = {};
  await Promise.all(ids.map(async (id) => {
    const user = await userRepository.findById(id);
    if (user) map[id] = user;
  }));
  return map;
}

/** Comments/activity store PtsAccount ids in authorId/performedBy fields. */
async function resolveAuthorsByAccountIds(accountIds = []) {
  const ids = [...new Set((accountIds || []).map((id) => String(id)).filter(Boolean))];
  const map = {};

  await Promise.all(ids.map(async (accountId) => {
    const [account, user] = await Promise.all([
      accountRepository.findById(accountId),
      userRepository.findByAccountId(accountId),
    ]);

    map[accountId] = user || {
      email: account?.email || '',
      firstName: account?.firstName || '',
      lastName: account?.lastName || '',
      displayName: account?.email || '',
    };
  }));

  return map;
}

function authorFieldsFromMap(authorMap, authorId) {
  const author = authorMap[String(authorId)] || null;
  return {
    authorName: displayName(author) || 'Someone',
    authorEmail: author?.email || '',
  };
}

async function buildAssignees(userIds, assignedBy) {
  const map = await resolveUsersByIds(userIds);
  return userIds.map((userId) => {
    const user = map[String(userId)];
    return {
      userId,
      assignedBy,
      assignedAt: new Date(),
      name: displayName(user),
      email: user?.email || '',
    };
  });
}

module.exports = {
  displayName,
  resolveUsersByIds,
  resolveAuthorsByAccountIds,
  authorFieldsFromMap,
  buildAssignees,
};
