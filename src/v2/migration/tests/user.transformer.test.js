const { test } = require('node:test');
const assert = require('node:assert/strict');
const { Types } = require('mongoose');
const {
  normalizeEmail,
  isCompatibleBcryptHash,
  mapLegacyStatus,
  mapLegacyAccountType,
  mapAccountTypeToRoleKey,
  pickStrongerAccountType,
  buildMergedAccountPayload,
  groupSourceRowsByEmail,
  normalizeLegacySourceRow,
  detectDuplicateEmailConflict,
} = require('../transformers/user.transformer');
const { buildMapUpsertQuery } = require('../repositories/migrationMap.repository');

test('normalizeEmail lowercases and trims', () => {
  assert.equal(normalizeEmail('  Admin@Example.COM '), 'admin@example.com');
  assert.equal(normalizeEmail(''), null);
  assert.equal(normalizeEmail(null), null);
});

const SAMPLE_BCRYPT_HASH = '$2b$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy';

test('isCompatibleBcryptHash accepts legacy bcrypt hashes', () => {
  assert.equal(isCompatibleBcryptHash(SAMPLE_BCRYPT_HASH), true);
  assert.equal(isCompatibleBcryptHash('plain-text'), false);
  assert.equal(isCompatibleBcryptHash(null), false);
});

test('duplicate email rows merge to strongest account type', () => {
  const rows = [
    {
      sourceCollection: 'users',
      email: 'person@example.com',
      roleName: 'EMPLOYEE',
      isActive: true,
      isDeleted: false,
    },
    {
      sourceCollection: 'account_admins',
      email: 'person@example.com',
      adminType: 'super-admin',
      isActive: true,
      isDeleted: false,
    },
  ];

  const merged = buildMergedAccountPayload(rows);
  assert.equal(merged.error, undefined);
  assert.equal(merged.accountType, 'super_admin');
  assert.equal(merged.mergedCount, 2);
});

test('role mapping maps legacy roles to v2 account types', () => {
  assert.equal(mapLegacyAccountType({ sourceCollection: 'users', roleName: 'MANAGER' }), 'manager');
  assert.equal(mapLegacyAccountType({ sourceCollection: 'users', roleString: 'employee' }), 'employee');
  assert.equal(
    mapLegacyAccountType({ sourceCollection: 'account_admins', adminType: 'super-admin' }),
    'super_admin'
  );
  assert.equal(mapAccountTypeToRoleKey('admin'), 'admin');
});

test('status mapping respects deleted and inactive flags', () => {
  assert.equal(mapLegacyStatus({ isActive: true, isDeleted: false }), 'active');
  assert.equal(mapLegacyStatus({ isActive: false, isDeleted: false }), 'inactive');
  assert.equal(mapLegacyStatus({ isActive: true, isDeleted: true }), 'inactive');
  assert.equal(mapLegacyStatus({ isActive: true, isDeleted: false, isVerified: false }), 'pending');
});

test('transformer output includes normalized source row shape', () => {
  const objectId = new Types.ObjectId();
  const row = normalizeLegacySourceRow(
    {
      _id: objectId,
      legacyId: 42,
      firstName: 'Jane',
      lastName: 'Doe',
      email: ' Jane@Example.com ',
      password: SAMPLE_BCRYPT_HASH,
      isActive: true,
      isDeleted: false,
      roleId: new Types.ObjectId(),
    },
    'users',
    new Map([[String(new Types.ObjectId()), 'ADMIN']])
  );

  assert.equal(row.sourceCollection, 'users');
  assert.equal(row.legacyId, 42);
  assert.equal(row.email, ' Jane@Example.com ');
  assert.equal(row.oldObjectId.toString(), objectId.toString());
});

test('groupSourceRowsByEmail isolates missing email rows', () => {
  const grouped = groupSourceRowsByEmail([
    { sourceCollection: 'users', oldObjectId: new Types.ObjectId(), email: 'a@example.com' },
    { sourceCollection: 'users', oldObjectId: new Types.ObjectId(), email: null },
  ]);

  assert.equal(grouped.get('a@example.com').rows.length, 1);
  const missingGroups = [...grouped.values()].filter((group) => group.missingEmail);
  assert.equal(missingGroups.length, 1);
});

test('pickStrongerAccountType prefers super_admin', () => {
  assert.equal(pickStrongerAccountType('employee', 'admin'), 'admin');
  assert.equal(pickStrongerAccountType('admin', 'super_admin'), 'super_admin');
  assert.equal(pickStrongerAccountType('manager', 'employee'), 'manager');
});

test('detectDuplicateEmailConflict flags multiple active super admins with conflicting types', () => {
  const conflict = detectDuplicateEmailConflict([
    {
      sourceCollection: 'account_admins',
      adminType: 'super-admin',
      isDeleted: false,
      isActive: true,
    },
    {
      sourceCollection: 'account_admins',
      adminType: 'super_admin',
      isDeleted: false,
      isActive: true,
    },
  ]);

  assert.match(conflict, /conflicting admin types/i);
});

test('resolvePasswordMigration migrates bcrypt and forces reset for incompatible hashes', async () => {
  const { resolvePasswordMigration } = require('../transformers/user.transformer');

  const migrated = await resolvePasswordMigration(SAMPLE_BCRYPT_HASH, { mustChangePassword: true });
  assert.equal(migrated.passwordHash, SAMPLE_BCRYPT_HASH);
  assert.equal(migrated.passwordMigrated, true);
  assert.equal(migrated.passwordResetRequired, true);
  assert.equal(migrated.forcedReset, false);

  const forced = await resolvePasswordMigration('legacy-md5-hash');
  assert.notEqual(forced.passwordHash, 'legacy-md5-hash');
  assert.equal(forced.passwordMigrated, false);
  assert.equal(forced.passwordResetRequired, true);
  assert.equal(forced.forcedReset, true);
});

test('migration map upsert key includes entity, collection, and old refs', () => {
  const oldObjectId = new Types.ObjectId();
  const query = buildMapUpsertQuery({
    entityType: 'account',
    oldCollection: 'users',
    oldObjectId,
    oldId: 10,
  });

  assert.deepEqual(query, {
    entityType: 'account',
    oldCollection: 'users',
    oldObjectId,
    oldId: 10,
  });
});
