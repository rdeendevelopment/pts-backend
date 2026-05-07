const bcrypt = require('bcrypt');

const { connectMongo, mongoose } = require('../config/mongo');
const {
  AccountAdmin,
  ActivityCategory,
  CoreModule,
  Permission,
  Role,
} = require('../src/app/MongoModels');
const {
  ROLE_MODULES,
  ROLE_PERMISSIONS,
} = require('../src/app/Services/auth/access-control.service');

const MODULE_LABELS = {
  dashboard: 'Dashboard',
  projects: 'Projects',
  tasks: 'Tasks',
  time_clock: 'Time Clock',
  employees: 'Employees',
  clients: 'Clients',
  reports: 'Reports',
  settings: 'Settings',
};

const PERMISSION_LABELS = {
  'projects.view': 'View Projects',
  'projects.view_budget': 'View Project Budgets',
  'projects.request_budget_hours': 'Request Budget Hours',
  'projects.create': 'Create Projects',
  'projects.update': 'Update Projects',
  'projects.assign_users': 'Assign Project Users',
  'projects.manage_budget': 'Manage Project Budgets',
  'projects.approve_budget_request': 'Approve Budget Requests',
  'projects.delete': 'Delete Projects',
  'tasks.view': 'View Tasks',
  'tasks.create': 'Create Tasks',
  'tasks.update_own': 'Update Own Tasks',
  'tasks.update_all': 'Update All Tasks',
  'tasks.assign': 'Assign Tasks',
  'tasks.delete': 'Delete Tasks',
  'time.view_own': 'View Own Time',
  'time.create': 'Create Time Entries',
  'time.update_own': 'Update Own Time',
  'time.submit': 'Submit Timesheets',
  'time.view_team': 'View Team Time',
  'time.approve': 'Approve Time',
  'time.reject': 'Reject Time',
  'time.view_all': 'View All Time',
  'reports.view_own': 'View Own Reports',
  'reports.view_team': 'View Team Reports',
  'reports.view_all': 'View All Reports',
  'employees.view': 'View Employees',
  'employees.create': 'Create Employees',
  'employees.update': 'Update Employees',
  'employees.deactivate': 'Deactivate Employees',
  'employees.assign_roles': 'Assign Employee Roles',
  'clients.view': 'View Clients',
  'clients.create': 'Create Clients',
  'clients.update': 'Update Clients',
  'clients.delete': 'Delete Clients',
  'settings.view': 'View Settings',
  'settings.manage_modules': 'Manage Modules',
  'settings.manage_permissions': 'Manage Permissions',
};

const ACTIVITY_CATEGORIES = [
  { name: 'Development', description: 'Engineering and implementation work' },
  { name: 'Design', description: 'UI, UX, and product design work' },
  { name: 'Testing', description: 'QA, review, and verification work' },
  { name: 'Meeting', description: 'Client, planning, and internal meetings' },
  { name: 'Research', description: 'Discovery, analysis, and technical research' },
  { name: 'Project Management', description: 'Coordination, planning, and reporting' },
  { name: 'Support', description: 'Maintenance, fixes, and support work' },
];

async function nextLegacyId(Model) {
  const row = await Model.findOne({}, { legacyId: 1 }).sort({ legacyId: -1 }).lean();
  return Number(row?.legacyId || 0) + 1;
}

async function ensureByUnique(Model, query, payload) {
  const existing = await Model.findOne(query);
  if (existing) {
    await Model.updateOne(query, { $set: payload });
    return Model.findOne(query);
  }

  return Model.create({
    legacyId: await nextLegacyId(Model),
    ...payload,
  });
}

function roleNames() {
  return Array.from(new Set([
    ...Object.keys(ROLE_MODULES),
    ...Object.keys(ROLE_PERMISSIONS),
  ]));
}

async function seedModules() {
  const keys = Array.from(new Set(Object.values(ROLE_MODULES).flat()));
  const modules = {};

  for (const keyName of keys) {
    const doc = await ensureByUnique(
      CoreModule,
      { keyName },
      {
        keyName,
        name: MODULE_LABELS[keyName] || keyName,
        isActive: true,
      }
    );
    modules[keyName] = doc._id;
  }

  return modules;
}

async function seedPermissions() {
  const keys = Array.from(new Set(Object.values(ROLE_PERMISSIONS).flat()));
  const permissions = {};

  for (const keyName of keys) {
    const doc = await ensureByUnique(
      Permission,
      { keyName },
      {
        keyName,
        name: PERMISSION_LABELS[keyName] || keyName,
        description: null,
      }
    );
    permissions[keyName] = doc._id;
  }

  return permissions;
}

async function seedRoles(modules, permissions) {
  for (const name of roleNames()) {
    const moduleIds = (ROLE_MODULES[name] || []).map((key) => modules[key]).filter(Boolean);
    const permissionIds = (ROLE_PERMISSIONS[name] || []).map((key) => permissions[key]).filter(Boolean);

    await ensureByUnique(
      Role,
      { name },
      {
        name,
        moduleIds,
        permissionIds,
      }
    );
  }
}

async function seedActivityCategories() {
  for (const category of ACTIVITY_CATEGORIES) {
    await ensureByUnique(
      ActivityCategory,
      { name: category.name },
      {
        ...category,
        isActive: true,
      }
    );
  }
}

async function seedDefaultAdmin() {
  const email = process.env.BOOTSTRAP_ADMIN_EMAIL;
  const password = process.env.BOOTSTRAP_ADMIN_PASSWORD;
  const name = process.env.BOOTSTRAP_ADMIN_NAME || 'Super Admin';

  if (!email || !password) {
    console.log('Skipping default admin. Set BOOTSTRAP_ADMIN_EMAIL and BOOTSTRAP_ADMIN_PASSWORD to create one.');
    return;
  }

  const existing = await AccountAdmin.findOne({ email: email.toLowerCase(), isDeleted: false });
  if (existing) {
    console.log(`Default admin already exists: ${email}`);
    return;
  }

  const superAdminRole = await Role.findOne({ name: 'SUPER_ADMIN' }).lean();

  await AccountAdmin.create({
    legacyId: await nextLegacyId(AccountAdmin),
    roleId: superAdminRole?._id || null,
    type: 'super-admin',
    name,
    email,
    password: await bcrypt.hash(password, 10),
    isActive: true,
    isDeleted: false,
    isVerified: true,
    lastLogin: null,
  });

  console.log(`Created default admin: ${email}`);
}

async function main() {
  await connectMongo();

  const modules = await seedModules();
  const permissions = await seedPermissions();
  await seedRoles(modules, permissions);
  await seedActivityCategories();
  await seedDefaultAdmin();

  console.log('Bootstrap data ready.');
}

main()
  .catch((error) => {
    console.error('Bootstrap failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.connection.close();
  });
