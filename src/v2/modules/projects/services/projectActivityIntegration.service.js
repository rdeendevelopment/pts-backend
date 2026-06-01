const { AppError } = require('../../../kernel/errors');
const projectErrorCodes = require('../errors/projectErrorCodes');
const { calculateRemainingMinutes } = require('../helpers/assignment.helper');
const { countsTowardApprovedCapacity, shouldIncludeBudgetInTotals } = require('../helpers/budget.helper');
const projectRepository = require('../repositories/project.repository');
const projectAssignmentRepository = require('../repositories/projectAssignment.repository');
const projectBudgetRepository = require('../repositories/projectBudget.repository');
const projectStatsService = require('./projectStats.service');
const projectEventService = require('./projectEvent.service');

async function getProjectForActivity(projectId) {
  const project = await projectRepository.findById(projectId);
  if (!project || project.isDeleted) {
    throw new AppError('Project not found', {
      status: 404,
      code: projectErrorCodes.PROJECT_NOT_FOUND,
    });
  }
  return project;
}

async function getAssignmentForUser(projectId, userId) {
  const assignment = await projectAssignmentRepository.findByProjectAndUser(projectId, userId);
  if (!assignment || assignment.isDeleted || assignment.status !== 'active') {
    return null;
  }
  return assignment;
}

async function getApprovedBudgetsForProject(projectId) {
  const [project, budgets] = await Promise.all([
    projectRepository.findById(projectId),
    projectBudgetRepository.listByProjectId(projectId),
  ]);

  const options = {
    projectType: project?.type || null,
    referenceDate: new Date(),
    renewalDay: project?.retainerRenewalDay || 1,
  };

  return budgets.filter(
    (budget) => !budget.isDeleted
      && countsTowardApprovedCapacity(budget)
      && shouldIncludeBudgetInTotals(budget, options)
  );
}

function buildPipelineUpdateOptions(session = null) {
  const options = { returnDocument: 'after', updatePipeline: true };
  if (session) options.session = session;
  return options;
}

async function incrementAssignmentConsumedMinutes(assignmentId, minutes, session = null) {
  const delta = Math.max(0, Number(minutes || 0));
  if (delta === 0) return null;

  const { getProjectAssignmentModel } = require('../models/projectAssignment.model');
  const ProjectAssignment = getProjectAssignmentModel();

  const options = buildPipelineUpdateOptions(session);

  return ProjectAssignment.findOneAndUpdate(
    { _id: assignmentId, isDeleted: false },
    [
      {
        $set: {
          'stats.consumedMinutes': {
            $add: [{ $ifNull: ['$stats.consumedMinutes', 0] }, delta],
          },
        },
      },
      {
        $set: {
          'stats.remainingMinutes': {
            $max: [
              0,
              {
                $subtract: [
                  { $ifNull: ['$allocation.allocatedMinutes', 0] },
                  '$stats.consumedMinutes',
                ],
              },
            ],
          },
        },
      },
    ],
    options
  ).exec();
}

async function reverseAssignmentConsumedMinutes(assignmentId, minutes, session = null) {
  const delta = Math.max(0, Number(minutes || 0));
  if (delta === 0) return null;

  const { getProjectAssignmentModel } = require('../models/projectAssignment.model');
  const ProjectAssignment = getProjectAssignmentModel();

  const options = buildPipelineUpdateOptions(session);

  return ProjectAssignment.findOneAndUpdate(
    { _id: assignmentId, isDeleted: false },
    [
      {
        $set: {
          'stats.consumedMinutes': {
            $max: [
              0,
              {
                $subtract: [
                  { $ifNull: ['$stats.consumedMinutes', 0] },
                  delta,
                ],
              },
            ],
          },
        },
      },
      {
        $set: {
          'stats.remainingMinutes': {
            $max: [
              0,
              {
                $subtract: [
                  { $ifNull: ['$allocation.allocatedMinutes', 0] },
                  '$stats.consumedMinutes',
                ],
              },
            ],
          },
        },
      },
    ],
    options
  ).exec();
}

async function incrementBudgetConsumedMinutes(budgetId, minutes, session = null) {
  const delta = Math.max(0, Number(minutes || 0));
  if (delta === 0) return null;

  const { getProjectBudgetModel } = require('../models/projectBudget.model');
  const ProjectBudget = getProjectBudgetModel();

  const options = { returnDocument: 'after' };
  if (session) options.session = session;

  return ProjectBudget.findOneAndUpdate(
    { _id: budgetId, isDeleted: false },
    { $inc: { consumedMinutes: delta } },
    options
  ).exec();
}

async function reverseBudgetConsumedMinutes(budgetId, minutes, session = null) {
  const delta = Math.max(0, Number(minutes || 0));
  if (delta === 0) return null;

  const { getProjectBudgetModel } = require('../models/projectBudget.model');
  const ProjectBudget = getProjectBudgetModel();

  const options = buildPipelineUpdateOptions(session);

  return ProjectBudget.findOneAndUpdate(
    { _id: budgetId, isDeleted: false },
    [{ $set: { consumedMinutes: { $max: [0, { $subtract: [{ $ifNull: ['$consumedMinutes', 0] }, delta] }] } } }],
    options
  ).exec();
}

async function recalculateProjectStats(projectId) {
  return projectStatsService.recalculateStats(projectId);
}

async function emitProjectEvent(payload) {
  return projectEventService.recordEvent(payload);
}

function getBudgetRemainingMinutes(budget) {
  const approved = Number(budget.approvedMinutes || 0);
  const consumed = Number(budget.consumedMinutes || 0);
  return Math.max(0, approved - consumed);
}

function getAssignmentRemainingMinutes(assignment) {
  return calculateRemainingMinutes(
    assignment.allocation?.allocatedMinutes,
    assignment.stats?.consumedMinutes
  );
}

async function getProjectStats(projectId) {
  return projectStatsService.getStats(projectId);
}

module.exports = {
  getProjectForActivity,
  getAssignmentForUser,
  getApprovedBudgetsForProject,
  incrementAssignmentConsumedMinutes,
  incrementBudgetConsumedMinutes,
  reverseAssignmentConsumedMinutes,
  reverseBudgetConsumedMinutes,
  recalculateProjectStats,
  emitProjectEvent,
  getBudgetRemainingMinutes,
  getAssignmentRemainingMinutes,
  getProjectStats,
};
