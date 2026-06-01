#!/usr/bin/env node
/**
 * Generates Postman collection + environment for PTS v2 API.
 * Run: node postman/generate-pts-v2-postman.js
 */

const fs = require('fs');
const path = require('path');

const OUT_DIR = __dirname;

const AUTH_SAVE_SCRIPT = `
if (pm.response.code >= 200 && pm.response.code < 300) {
  const json = pm.response.json();
  const data = json && json.data ? json.data : json;
  if (data.access_token) pm.environment.set('accessToken', data.access_token);
  if (data.refresh_token) pm.environment.set('refreshToken', data.refresh_token);
  if (data.account && data.account.id) pm.environment.set('accountId', data.account.id);
  if (data.user && data.user.id) pm.environment.set('userId', data.user.id);
}
`.trim();

const SAVE_ID_SCRIPT = (envKey) => `
if (pm.response.code >= 201 && pm.response.code < 300) {
  const json = pm.response.json();
  const data = json && json.data ? json.data : json;
  const id = data && (data.id || data._id);
  if (id) pm.environment.set('${envKey}', String(id));
}
`.trim();

function request(name, method, urlPath, options = {}) {
  const {
    body,
    query,
    auth = 'inherit',
    description = '',
    testScript,
    header = [],
  } = options;

  const item = {
    name,
    request: {
      method,
      header: [
        { key: 'Accept', value: 'application/json' },
        ...header,
      ],
      url: {
        raw: `{{baseUrl}}${urlPath}`,
        host: ['{{baseUrl}}'],
        path: urlPath.replace(/^\//, '').split('/'),
      },
      description,
    },
  };

  if (query && query.length) {
    item.request.url.query = query.map(([key, value]) => ({
      key,
      value: String(value),
      disabled: value === '',
    }));
  }

  if (body !== undefined) {
    item.request.header.push({ key: 'Content-Type', value: 'application/json' });
    item.request.body = {
      mode: 'raw',
      raw: typeof body === 'string' ? body : JSON.stringify(body, null, 2),
    };
  }

  if (auth === 'none') {
    item.request.auth = { type: 'noauth' };
  }

  if (testScript) {
    item.event = [{
      listen: 'test',
      script: { type: 'text/javascript', exec: testScript.split('\n') },
    }];
  }

  return item;
}

function folder(name, items, description = '') {
  return { name, description, item: items };
}

function buildCollection() {
  const items = [
    folder('Health', [
      request('Health Check', 'GET', '/health', { auth: 'none' }),
    ], 'v2 bootstrap and Mongo status'),

    folder('Auth', [
      request('Register', 'POST', '/auth/register', {
        auth: 'none',
        body: {
          email: '{{registerEmail}}',
          password: '{{registerPassword}}',
          firstName: '{{registerFirstName}}',
          lastName: '{{registerLastName}}',
        },
        testScript: AUTH_SAVE_SCRIPT,
      }),
      request('Login', 'POST', '/auth/login', {
        auth: 'none',
        body: { email: '{{email}}', password: '{{password}}' },
        testScript: AUTH_SAVE_SCRIPT,
      }),
      request('Refresh Token', 'POST', '/auth/refresh', {
        auth: 'none',
        body: { refreshToken: '{{refreshToken}}' },
        testScript: AUTH_SAVE_SCRIPT,
      }),
      request('Logout', 'POST', '/auth/logout', {
        body: { refreshToken: '{{refreshToken}}' },
      }),
      request('Me', 'GET', '/auth/me', {
        testScript: `
if (pm.response.code === 200) {
  const data = pm.response.json().data;
  if (data.account && data.account.id) pm.environment.set('accountId', data.account.id);
  if (data.user && data.user.id) pm.environment.set('userId', data.user.id);
}
`.trim(),
      }),
    ], 'Authentication and session'),

    folder('Modules', [
      request('List Modules', 'GET', '/modules', {
        query: [['include_deleted', 'false']],
      }),
      request('Get Module', 'GET', '/modules/{{moduleId}}'),
      request('Create Module', 'POST', '/modules', {
        body: {
          key: '{{moduleKey}}',
          name: '{{moduleName}}',
          category: 'core',
          description: 'Created from Postman',
        },
        testScript: SAVE_ID_SCRIPT('moduleId'),
      }),
      request('Update Module', 'PATCH', '/modules/{{moduleId}}', {
        body: { description: 'Updated from Postman' },
      }),
      request('Delete Module', 'DELETE', '/modules/{{moduleId}}'),
    ]),

    folder('RBAC', [
      folder('Roles', [
        request('List Roles', 'GET', '/rbac/roles'),
        request('Get Role', 'GET', '/rbac/roles/{{roleId}}'),
        request('Create Role', 'POST', '/rbac/roles', {
          body: {
            key: '{{roleKey}}',
            name: '{{roleName}}',
            description: 'Created from Postman',
            status: 'active',
          },
          testScript: SAVE_ID_SCRIPT('roleId'),
        }),
        request('Update Role', 'PATCH', '/rbac/roles/{{roleId}}', {
          body: { description: 'Updated from Postman' },
        }),
        request('Delete Role', 'DELETE', '/rbac/roles/{{roleId}}'),
      ]),
      folder('Permissions', [
        request('List Permissions', 'GET', '/rbac/permissions'),
      ]),
      folder('Account Roles', [
        request('List Account Roles', 'GET', '/rbac/accounts/{{accountId}}/roles'),
        request('Assign Role to Account', 'POST', '/rbac/accounts/{{accountId}}/roles', {
          body: { roleId: '{{roleId}}' },
        }),
        request('Remove Role from Account', 'DELETE', '/rbac/accounts/{{accountId}}/roles/{{roleId}}'),
      ]),
    ]),

    folder('Users', [
      request('My Profile', 'GET', '/users/me/profile'),
      request('List Users', 'GET', '/users', {
        query: [['limit', '{{listLimit}}'], ['search', ''], ['status', '']],
      }),
      request('Get User', 'GET', '/users/{{userId}}'),
      request('Create User', 'POST', '/users', {
        body: {
          firstName: '{{userFirstName}}',
          lastName: '{{userLastName}}',
          email: '{{userEmail}}',
          password: '{{userPassword}}',
          jobTitle: '{{userJobTitle}}',
          department: '{{userDepartment}}',
          employmentType: 'full_time',
          status: 'active',
        },
        testScript: SAVE_ID_SCRIPT('userId'),
      }),
      request('Update User', 'PATCH', '/users/{{userId}}', {
        body: { jobTitle: 'Updated via Postman' },
      }),
      request('Update User Status', 'PATCH', '/users/{{userId}}/status', {
        body: { status: 'active' },
      }),
      request('Delete User', 'DELETE', '/users/{{userId}}', {
        query: [['force', 'false']],
      }),
    ]),

    folder('Clients', [
      request('List Clients', 'GET', '/clients', {
        query: [['limit', '{{listLimit}}'], ['search', ''], ['status', '']],
      }),
      request('Get Client', 'GET', '/clients/{{clientId}}'),
      request('Create Client', 'POST', '/clients', {
        body: {
          name: '{{clientName}}',
          type: 'company',
          status: 'active',
          email: '{{clientEmail}}',
        },
        testScript: SAVE_ID_SCRIPT('clientId'),
      }),
      request('Update Client', 'PATCH', '/clients/{{clientId}}', {
        body: { website: 'https://example.com' },
      }),
      request('Update Client Status', 'PATCH', '/clients/{{clientId}}/status', {
        body: { status: 'active' },
      }),
      request('Delete Client', 'DELETE', '/clients/{{clientId}}'),
    ]),

    folder('Projects', [
      folder('Core', [
        request('List Projects', 'GET', '/projects', {
          query: [['limit', '{{listLimit}}'], ['client_id', '{{clientId}}']],
        }),
        request('Get Project', 'GET', '/projects/{{projectId}}'),
        request('Create Project', 'POST', '/projects', {
          body: {
            name: '{{projectName}}',
            clientId: '{{clientId}}',
            type: 'fixed',
            status: 'active',
            priority: 'medium',
            billingType: 'fixed',
          },
          testScript: SAVE_ID_SCRIPT('projectId'),
        }),
        request('Update Project', 'PATCH', '/projects/{{projectId}}', {
          body: { priority: 'high' },
        }),
        request('Update Project Status', 'PATCH', '/projects/{{projectId}}/status', {
          body: { status: 'active' },
        }),
        request('Delete Project', 'DELETE', '/projects/{{projectId}}'),
      ]),
      folder('Budgets', [
        request('List Budgets', 'GET', '/projects/{{projectId}}/budgets'),
        request('Create Budget', 'POST', '/projects/{{projectId}}/budgets', {
          body: {
            title: '{{budgetTitle}}',
            sourceType: 'manual',
            budgetType: 'hours',
            requestedMinutes: 480,
            approvedMinutes: 480,
          },
          testScript: SAVE_ID_SCRIPT('budgetId'),
        }),
        request('Update Budget', 'PATCH', '/projects/{{projectId}}/budgets/{{budgetId}}', {
          body: { approvedMinutes: 600 },
        }),
        request('Update Budget Status', 'PATCH', '/projects/{{projectId}}/budgets/{{budgetId}}/status', {
          body: { status: 'approved' },
        }),
        request('Delete Budget', 'DELETE', '/projects/{{projectId}}/budgets/{{budgetId}}'),
      ]),
      folder('Assignments', [
        request('List Assignments', 'GET', '/projects/{{projectId}}/assignments'),
        request('Create Assignment', 'POST', '/projects/{{projectId}}/assignments', {
          body: {
            userId: '{{userId}}',
            role: 'member',
            allocatedMinutes: 240,
            capPeriod: 'week',
          },
          testScript: SAVE_ID_SCRIPT('assignmentId'),
        }),
        request('Update Assignment', 'PATCH', '/projects/{{projectId}}/assignments/{{assignmentId}}', {
          body: { role: 'lead' },
        }),
        request('Remove Assignment', 'DELETE', '/projects/{{projectId}}/assignments/{{assignmentId}}'),
      ]),
      folder('Files', [
        request('List Files', 'GET', '/projects/{{projectId}}/files'),
        request('Create File Record', 'POST', '/projects/{{projectId}}/files', {
          body: {
            title: '{{fileTitle}}',
            url: '/uploads/sample.pdf',
            size: 1024,
          },
          testScript: SAVE_ID_SCRIPT('fileId'),
        }),
        request('Delete File', 'DELETE', '/projects/{{projectId}}/files/{{fileId}}'),
      ]),
      folder('Stats & Events', [
        request('Project Stats', 'GET', '/projects/{{projectId}}/stats'),
        request('Project Events', 'GET', '/projects/{{projectId}}/events'),
      ]),
    ]),

    folder('Activity', [
      folder('Weeks', [
        request('List Weeks', 'GET', '/activity/weeks', {
          query: [['userId', '{{userId}}'], ['status', '']],
        }),
        request('Get Week', 'GET', '/activity/weeks/{{weekId}}'),
        request('Create Week', 'POST', '/activity/weeks', {
          body: { weekStartDate: '{{weekStartDate}}' },
          testScript: SAVE_ID_SCRIPT('weekId'),
        }),
        request('Submit Week', 'POST', '/activity/weeks/{{weekId}}/submit'),
        request('Approve Week', 'POST', '/activity/weeks/{{weekId}}/approve'),
        request('Reject Week', 'POST', '/activity/weeks/{{weekId}}/reject', {
          body: { rejectionReason: 'Needs correction' },
        }),
      ]),
      folder('Time Entries', [
        request('List Time Entries', 'GET', '/activity/time-entries', {
          query: [['projectId', '{{projectId}}'], ['userId', '{{userId}}']],
        }),
        request('Get Time Entry', 'GET', '/activity/time-entries/{{timeEntryId}}'),
        request('Create Time Entry', 'POST', '/activity/time-entries', {
          body: {
            projectId: '{{projectId}}',
            workCategoryId: '{{workCategoryId}}',
            minutes: 60,
            entryDate: '{{entryDate}}',
            budgetId: '{{budgetId}}',
            title: 'Postman time entry',
          },
          testScript: SAVE_ID_SCRIPT('timeEntryId'),
        }),
        request('Update Time Entry', 'PATCH', '/activity/time-entries/{{timeEntryId}}', {
          body: { minutes: 90 },
        }),
        request('Delete Time Entry', 'DELETE', '/activity/time-entries/{{timeEntryId}}'),
        request('Validate Time Entry', 'POST', '/activity/validate-time-entry', {
          body: {
            projectId: '{{projectId}}',
            workCategoryId: '{{workCategoryId}}',
            minutes: 60,
            entryDate: '{{entryDate}}',
            budgetId: '{{budgetId}}',
          },
        }),
      ]),
      folder('Timers', [
        request('Start Timer', 'POST', '/activity/timers/start', {
          body: {
            projectId: '{{projectId}}',
            workCategoryId: '{{workCategoryId}}',
            budgetId: '{{budgetId}}',
            description: 'Postman timer',
          },
          testScript: SAVE_ID_SCRIPT('timerId'),
        }),
        request('Stop Timer', 'POST', '/activity/timers/{{timerId}}/stop'),
        request('Cancel Timer', 'POST', '/activity/timers/{{timerId}}/cancel'),
        request('Get Active Timer (Me)', 'GET', '/activity/timers/active/me'),
      ]),
      folder('Work Categories', [
        request('List Work Categories', 'GET', '/activity/work-categories'),
      ]),
    ]),

    folder('Tasks', [
      folder('Project Board', [
        request('Get Board', 'GET', '/tasks/projects/{{projectId}}/board'),
        request('Get Workflow', 'GET', '/tasks/projects/{{projectId}}/workflow'),
        request('List Members', 'GET', '/tasks/projects/{{projectId}}/members'),
        request('List Archived Tasks', 'GET', '/tasks/projects/{{projectId}}/tasks/archived'),
        request('Create Task', 'POST', '/tasks/projects/{{projectId}}/tasks', {
          body: {
            title: '{{taskTitle}}',
            priority: 'medium',
            assigneeIds: ['{{userId}}'],
            workflowStatusId: '{{workflowStatusId}}',
          },
          testScript: SAVE_ID_SCRIPT('taskId'),
        }),
      ]),
      folder('Task Actions', [
        request('Get Task', 'GET', '/tasks/tasks/{{taskId}}'),
        request('Update Task', 'PATCH', '/tasks/tasks/{{taskId}}', {
          body: { title: 'Updated task title', priority: 'high' },
        }),
        request('Move Task', 'PATCH', '/tasks/tasks/{{taskId}}/move', {
          body: { workflowStatusId: '{{workflowStatusId}}' },
        }),
        request('Complete Task', 'POST', '/tasks/tasks/{{taskId}}/complete'),
        request('Archive Task', 'POST', '/tasks/tasks/{{taskId}}/archive'),
        request('Restore Task', 'POST', '/tasks/tasks/{{taskId}}/restore'),
      ]),
      folder('Comments', [
        request('List Comments', 'GET', '/tasks/tasks/{{taskId}}/comments'),
        request('Create Comment', 'POST', '/tasks/tasks/{{taskId}}/comments', {
          body: { content: 'Comment from Postman', mentions: [] },
        }),
      ]),
    ]),

    folder('Reports', [
      request('User Time Report', 'GET', '/reports/users/{{userId}}/time', {
        query: [['period', 'weekly'], ['status', 'all']],
      }),
      request('Team Time Report', 'GET', '/reports/team/time', {
        query: [['period', 'weekly'], ['status', 'all']],
      }),
      request('Project Time Report', 'GET', '/reports/projects/{{projectId}}/time', {
        query: [['period', 'monthly'], ['status', 'all']],
      }),
      request('Client Time Report', 'GET', '/reports/clients/{{clientId}}/time', {
        query: [['period', 'monthly'], ['status', 'all']],
      }),
      request('Week Approval Report', 'GET', '/reports/approvals/weeks', {
        query: [['status', 'submitted']],
      }),
    ]),

    folder('Socket', [
      request('Socket Health', 'GET', '/socket/health'),
      request('Socket Presence', 'GET', '/socket/presence'),
    ]),
  ];

  return {
    info: {
      _postman_id: 'pts-v2-api-collection',
      name: 'pts_v2_api',
      description: 'Complete PTS API v2 collection. Import pts_v2_api.postman_environment.json and select it before sending requests.\n\n1. Set email/password in environment\n2. Run Auth > Login\n3. Tokens and IDs auto-save to environment variables',
      schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
    },
    auth: {
      type: 'bearer',
      bearer: [{ key: 'token', value: '{{accessToken}}', type: 'string' }],
    },
    item: items,
    variable: [],
  };
}

function buildEnvironment(name, values) {
  return {
    id: `pts-v2-env-${name}`,
    name,
    values: Object.entries(values).map(([key, value]) => ({
      key,
      value: String(value),
      type: key.toLowerCase().includes('password') || key.toLowerCase().includes('token') && key !== 'accessToken' && key !== 'refreshToken'
        ? 'secret'
        : 'default',
      enabled: true,
    })),
    _postman_variable_scope: 'environment',
    _postman_exported_at: new Date().toISOString(),
    _postman_exported_using: 'generate-pts-v2-postman.js',
  };
}

const defaultEnv = {
  baseUrl: 'http://localhost:3001/api/v2',
  email: 'admin@example.com',
  password: 'ChangeMe123',
  accessToken: '',
  refreshToken: '',
  accountId: '',
  userId: '',
  clientId: '',
  projectId: '',
  budgetId: '',
  assignmentId: '',
  fileId: '',
  weekId: '',
  timeEntryId: '',
  timerId: '',
  workCategoryId: '',
  taskId: '',
  workflowStatusId: '',
  roleId: '',
  moduleId: '',
  listLimit: '20',
  registerEmail: 'newuser@example.com',
  registerPassword: 'ChangeMe123',
  registerFirstName: 'New',
  registerLastName: 'User',
  userFirstName: 'Jane',
  userLastName: 'Doe',
  userEmail: 'jane.doe@example.com',
  userPassword: 'ChangeMe123',
  userJobTitle: 'Developer',
  userDepartment: 'Engineering',
  clientName: 'Acme Corp',
  clientEmail: 'contact@acme.example',
  projectName: 'Sample Project',
  budgetTitle: 'Initial Budget',
  fileTitle: 'Sample Document',
  taskTitle: 'Sample Task',
  moduleKey: 'custom_module',
  moduleName: 'Custom Module',
  roleKey: 'custom_role',
  roleName: 'Custom Role',
  weekStartDate: '2026-05-19',
  entryDate: '2026-05-20',
};

const remoteEnv = {
  ...defaultEnv,
  baseUrl: 'https://pts-rdeens.uilyas.com/api/v2',
};

const collection = buildCollection();
const localEnvironment = buildEnvironment('pts_v2_api (local)', defaultEnv);
const remoteEnvironment = buildEnvironment('pts_v2_api (remote)', remoteEnv);

fs.writeFileSync(
  path.join(OUT_DIR, 'pts_v2_api.postman_collection.json'),
  `${JSON.stringify(collection, null, 2)}\n`
);
fs.writeFileSync(
  path.join(OUT_DIR, 'pts_v2_api.postman_environment.json'),
  `${JSON.stringify(localEnvironment, null, 2)}\n`
);
fs.writeFileSync(
  path.join(OUT_DIR, 'pts_v2_api.remote.postman_environment.json'),
  `${JSON.stringify(remoteEnvironment, null, 2)}\n`
);

console.log('Generated:');
console.log('  postman/pts_v2_api.postman_collection.json');
console.log('  postman/pts_v2_api.postman_environment.json');
console.log('  postman/pts_v2_api.remote.postman_environment.json');
