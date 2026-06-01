const test = require('node:test');
const assert = require('node:assert/strict');
const { toProjectSettingsDto, toWorkflowStatusDto } = require('../dto/task.dto');

test('toWorkflowStatusDto exposes legacy _id field', () => {
  const dto = toWorkflowStatusDto({
    _id: '507f1f77bcf86cd799439011',
    workflowId: '507f1f77bcf86cd799439012',
    projectId: '507f1f77bcf86cd799439013',
    name: 'In Progress',
    key: 'in_progress',
    order: 2048,
    category: 'active',
    color: '#F59E0B',
    icon: null,
    isTerminal: false,
    status: 'active',
  });

  assert.equal(dto._id, '507f1f77bcf86cd799439011');
  assert.equal(dto.id, '507f1f77bcf86cd799439011');
  assert.equal(dto.name, 'In Progress');
});

test('toProjectSettingsDto maps settings payload for Angular', () => {
  const dto = toProjectSettingsDto({
    project: {
      _id: '507f1f77bcf86cd799439013',
      name: 'PTS Platform',
      description: 'Main project',
      status: 'active',
      createdAt: '2026-05-21T10:00:00.000Z',
    },
    workflow: {
      _id: '507f1f77bcf86cd799439014',
      projectId: '507f1f77bcf86cd799439013',
      name: 'Default Workflow',
      isDefault: true,
      status: 'active',
    },
    statuses: [{
      _id: '507f1f77bcf86cd799439011',
      workflowId: '507f1f77bcf86cd799439014',
      projectId: '507f1f77bcf86cd799439013',
      name: 'Todo',
      key: 'todo',
      order: 1024,
      category: 'not_started',
      color: '#3B82F6',
      isTerminal: false,
      status: 'active',
    }],
    stats: { taskCount: 4, memberCount: 2, overdueCount: 1 },
    canManage: true,
  });

  assert.equal(dto.id, '507f1f77bcf86cd799439013');
  assert.equal(dto.name, 'PTS Platform');
  assert.equal(dto.stats.taskCount, 4);
  assert.equal(dto.statuses[0]._id, '507f1f77bcf86cd799439011');
  assert.equal(dto.canManage, true);
});
