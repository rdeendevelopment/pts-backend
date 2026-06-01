const { Schema } = require('mongoose');

const LegacyRoleSchema = new Schema(
  {
    legacyId: Number,
    name: String,
  },
  { collection: 'roles', strict: false }
);

const LegacyUserSchema = new Schema(
  {},
  { collection: 'users', strict: false }
);

const LegacyAccountAdminSchema = new Schema(
  {},
  { collection: 'account_admins', strict: false }
);

function getLegacyRoleModel(sourceConnection) {
  return sourceConnection.models.LegacyRole
    || sourceConnection.model('LegacyRole', LegacyRoleSchema);
}

function getLegacyUserModel(sourceConnection) {
  return sourceConnection.models.LegacyUser
    || sourceConnection.model('LegacyUser', LegacyUserSchema);
}

function getLegacyAccountAdminModel(sourceConnection) {
  return sourceConnection.models.LegacyAccountAdmin
    || sourceConnection.model('LegacyAccountAdmin', LegacyAccountAdminSchema);
}

async function listLegacyRoles(sourceConnection) {
  const Role = getLegacyRoleModel(sourceConnection);
  return Role.find({}, { _id: 1, name: 1 }).lean();
}

async function countLegacyUsers(sourceConnection) {
  const User = getLegacyUserModel(sourceConnection);
  const Admin = getLegacyAccountAdminModel(sourceConnection);
  const [userCount, adminCount] = await Promise.all([
    User.countDocuments({}),
    Admin.countDocuments({}),
  ]);
  return { userCount, adminCount, sourceCount: userCount + adminCount };
}

async function listLegacyUsers(sourceConnection, { skip = 0, limit = 500 } = {}) {
  const User = getLegacyUserModel(sourceConnection);
  return User.find({})
    .sort({ _id: 1 })
    .skip(skip)
    .limit(limit)
    .lean();
}

async function listLegacyAccountAdmins(sourceConnection, { skip = 0, limit = 500 } = {}) {
  const Admin = getLegacyAccountAdminModel(sourceConnection);
  return Admin.find({})
    .sort({ _id: 1 })
    .skip(skip)
    .limit(limit)
    .lean();
}

async function loadAllLegacyAuthRows(sourceConnection) {
  const roleNameById = new Map(
    (await listLegacyRoles(sourceConnection)).map((row) => [String(row._id), row.name])
  );

  const [users, admins] = await Promise.all([
    listLegacyUsers(sourceConnection, { skip: 0, limit: 100000 }),
    listLegacyAccountAdmins(sourceConnection, { skip: 0, limit: 100000 }),
  ]);

  return {
    roleNameById,
    users,
    admins,
  };
}

module.exports = {
  countLegacyUsers,
  loadAllLegacyAuthRows,
};
