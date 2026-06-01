const { TASK_MEMBER_ROLES } = require('../constants/tasks.constants');
const { ASSIGNMENT_ROLES } = require('../../projects/constants/project.constants');

function mapTaskRoleToAssignmentRole(taskRole) {
  if (taskRole === 'admin') return 'lead';
  if (ASSIGNMENT_ROLES.includes(taskRole)) return taskRole;
  return 'member';
}

function mapAssignmentRoleToTaskRole(assignmentRole) {
  if (assignmentRole === 'lead') return 'admin';
  if (TASK_MEMBER_ROLES.includes(assignmentRole)) return assignmentRole;
  return 'member';
}

function normalizeTaskMemberRole(role) {
  if (TASK_MEMBER_ROLES.includes(role)) return role;
  return 'member';
}

module.exports = {
  mapTaskRoleToAssignmentRole,
  mapAssignmentRoleToTaskRole,
  normalizeTaskMemberRole,
};
