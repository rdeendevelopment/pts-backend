const { AccountAdmin, CoreUser } = require('../../../MongoModels/core.model');

async function searchUsers(queryStr, actorId) {
  const term = String(queryStr || '').trim();
  const regex = term ? new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') : null;
  const userQuery = {
    isDeleted: false,
    isActive: true,
    _id: { $ne: actorId },
  };
  const adminQuery = {
    isDeleted: false,
    isActive: true,
    _id: { $ne: actorId },
  };

  if (regex) {
    userQuery.$or = [
      { firstName: regex },
      { lastName: regex },
      { email: regex },
      { userName: regex },
    ];
    adminQuery.$or = [
      { name: regex },
      { email: regex },
    ];
  }

  const [users, admins] = await Promise.all([
    CoreUser.find(userQuery)
    .select('_id firstName lastName email userName imageUrl')
    .limit(30)
    .lean(),
    AccountAdmin.find(adminQuery)
      .select('_id name email imageUrl type')
      .limit(20)
      .lean(),
  ]);

  const normalizedUsers = users.map((u) => ({
    _id: u._id,
    firstName: u.firstName || '',
    lastName: u.lastName || '',
    displayName: [u.firstName, u.lastName].filter(Boolean).join(' ') || u.email || '',
    email: u.email || '',
    userName: u.userName || '',
    imageUrl: u.imageUrl || '',
  }));

  const normalizedAdmins = admins.map((u) => ({
    _id: u._id,
    firstName: '',
    lastName: '',
    displayName: u.name || u.email || '',
    email: u.email || '',
    userName: '',
    imageUrl: u.imageUrl || '',
    role: u.type || 'admin',
  }));

  return [...normalizedUsers, ...normalizedAdmins]
    .filter((user) => user.displayName || user.email)
    .sort((a, b) => String(a.displayName || a.email).localeCompare(String(b.displayName || b.email)))
    .slice(0, 50);
}

module.exports = { searchUsers };
