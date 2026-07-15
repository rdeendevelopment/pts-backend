const { AppError } = require('../../../kernel/errors');
const activityErrorCodes = require('../errors/activityErrorCodes');
const projectsModule = require('../../projects');
const userRepository = require('../../users/repositories/user.repository');
const workCategoryRepository = require('../repositories/workCategory.repository');
const timeEntryRepository = require('../repositories/timeEntry.repository');
const activeTimerRepository = require('../repositories/activeTimer.repository');
const {
  getCapPeriodBounds,
  calculateCapRemainingMinutes,
} = require('../helpers/capPeriod.helper');
const { ensureApprovedCapacityCoversAssignments } = require('../../projects/helpers/assignmentCapacityBudget.helper');

const LOCKED_WEEK_STATUSES = ['submitted', 'approved'];

const BUDGET_ERROR_MESSAGES = {
  [activityErrorCodes.ACTIVITY_BUDGET_REQUIRED]:
    'This project has no approved capacity budget. Ask an admin to add project capacity or re-save team hour allocations.',
  [activityErrorCodes.ACTIVITY_BUDGET_SELECTION_REQUIRED]:
    'Select a phase before logging time.',
  [activityErrorCodes.ACTIVITY_BUDGET_NOT_FOUND]:
    'The selected phase is no longer available. Choose another phase.',
};

async function resolveUserByAccountId(accountId) {
  const user = await resolveUserByAccountIdOptional(accountId);
  if (!user) {
    throw new AppError('User profile not found for account', {
      status: 404,
      code: activityErrorCodes.ACTIVITY_USER_NOT_FOUND,
    });
  }
  return user;
}

async function resolveUserByAccountIdOptional(accountId) {
  return userRepository.findByAccountId(accountId);
}

async function resolveBudget(projectId, budgetId, approvedBudgets) {
  if (approvedBudgets.length === 0) {
    return { budget: null, errorCode: activityErrorCodes.ACTIVITY_BUDGET_REQUIRED };
  }

  if (approvedBudgets.length === 1) {
    return { budget: approvedBudgets[0], errorCode: null };
  }

  if (!budgetId) {
    return { budget: null, errorCode: activityErrorCodes.ACTIVITY_BUDGET_SELECTION_REQUIRED };
  }

  const budget = approvedBudgets.find((row) => String(row._id) === String(budgetId));
  if (!budget) {
    return { budget: null, errorCode: activityErrorCodes.ACTIVITY_BUDGET_NOT_FOUND };
  }

  return { budget, errorCode: null };
}

async function getDraftMinutesForBudget(budgetId, excludeEntryId = null) {
  const totals = await timeEntryRepository.sumMinutes({
    budgetId,
    statuses: ['draft'],
    excludeEntryId,
  });
  return totals.totalMinutes;
}

async function getCapConsumedMinutes(assignment, entryDate, excludeEntryId = null) {
  const capPeriod = assignment.allocation?.capPeriod || 'project';

  if (capPeriod === 'project') {
    return Number(assignment.stats?.consumedMinutes || 0);
  }

  const bounds = getCapPeriodBounds(capPeriod, entryDate);
  if (!bounds) {
    return Number(assignment.stats?.consumedMinutes || 0);
  }

  const entryDateFrom = bounds.dayStart || bounds.weekStartDate || bounds.monthStart;
  const entryDateTo = bounds.dayEnd || bounds.weekEndDate || bounds.monthEnd;

  const periodTotals = await timeEntryRepository.sumMinutesForCap({
    assignmentId: assignment._id,
    userId: assignment.userId,
    projectId: assignment.projectId,
    entryDateFrom,
    entryDateTo,
    statuses: ['submitted', 'approved'],
    excludeEntryId,
  });

  return periodTotals.totalMinutes;
}

async function getPendingDraftMinutes(assignmentId, timeWeekId, excludeEntryId = null) {
  const totals = await timeEntryRepository.sumMinutes({
    assignmentId,
    timeWeekId,
    statuses: ['draft'],
    excludeEntryId,
  });
  return totals.totalMinutes;
}

async function validateTimeEntry({
  projectId,
  userId,
  assignmentId = null,
  budgetId = null,
  workCategoryId,
  entryDate,
  minutes,
  source = 'manual',
  timeWeek = null,
  excludeEntryId = null,
  throwOnError = true,
  req = null,
}) {
  const result = {
    canLog: true,
    blockedReason: null,
    projectRemainingMinutes: null,
    userRemainingMinutes: null,
    budgetRemainingMinutes: null,
    availableBudgets: [],
    project: null,
    assignment: null,
    budget: null,
  };

  try {
    const project = await projectsModule.getProjectForActivity(projectId);
    result.project = project;

    if (project.status !== 'active' || project.isDeleted) {
      throw new AppError('Only active projects can receive time entries', {
        status: 409,
        code: activityErrorCodes.ACTIVITY_PROJECT_NOT_LOGGABLE,
        details: {
          projectId: String(projectId),
          status: project.status,
          hint: 'Completed, archived, on hold, draft, and other non-active projects cannot be used.',
        },
      });
    }

    if (source === 'manual' && project.settings?.allowManualTimeEntry === false) {
      throw new AppError('Manual time entry is disabled for this project', {
        status: 403,
        code: activityErrorCodes.ACTIVITY_MANUAL_ENTRY_DISABLED,
      });
    }

    const assignment = assignmentId
      ? await projectsModule.getAssignmentForUser(projectId, userId)
      : await projectsModule.getAssignmentForUser(projectId, userId);

    if (!assignment || (assignmentId && String(assignment._id) !== String(assignmentId))) {
      throw new AppError('Active project assignment not found', {
        status: 404,
        code: activityErrorCodes.ACTIVITY_ASSIGNMENT_NOT_FOUND,
      });
    }
    result.assignment = assignment;

    if (assignment.allocation?.canLogTime === false) {
      throw new AppError('Time logging is disabled for this assignment', {
        status: 403,
        code: activityErrorCodes.ACTIVITY_TIME_LOGGING_DISABLED,
      });
    }

    if (timeWeek) {
      if (LOCKED_WEEK_STATUSES.includes(timeWeek.status) || timeWeek.lockedAt) {
        throw new AppError('Time week is locked', {
          status: 409,
          code: activityErrorCodes.ACTIVITY_WEEK_LOCKED,
          details: { weekStatus: timeWeek.status },
        });
      }
      if (String(timeWeek.userId) !== String(userId)) {
        throw new AppError('Forbidden activity access', {
          status: 403,
          code: activityErrorCodes.ACTIVITY_FORBIDDEN,
        });
      }
    }

    const category = await workCategoryRepository.findById(workCategoryId);
    if (!category || category.status !== 'active') {
      throw new AppError('Work category not found', {
        status: 404,
        code: activityErrorCodes.ACTIVITY_WORK_CATEGORY_NOT_FOUND,
      });
    }

    let approvedBudgets = await projectsModule.getApprovedBudgetsForProject(projectId);
    if (approvedBudgets.length === 0 && req?.v2Auth?.accountId) {
      await ensureApprovedCapacityCoversAssignments(project, req.v2Auth.accountId, req);
      approvedBudgets = await projectsModule.getApprovedBudgetsForProject(projectId);
      if (approvedBudgets.length === 0 && project.type === 'retainer') {
        const retainerRenewalService = require('../../projects/services/retainerRenewal.service');
        await retainerRenewalService.ensureRetainerBudgetOnAccess(projectId);
        approvedBudgets = await projectsModule.getApprovedBudgetsForProject(projectId);
      }
    }
    result.availableBudgets = approvedBudgets.map((row) => ({
      id: String(row._id),
      title: row.title,
      approvedMinutes: row.approvedMinutes,
      consumedMinutes: row.consumedMinutes,
      remainingMinutes: Math.max(0, Number(row.approvedMinutes || 0) - Number(row.consumedMinutes || 0)),
    }));

    const allowAssignmentExceed = Boolean(assignment.allocation?.allowExceed);
    const { budget, errorCode } = await resolveBudget(projectId, budgetId, approvedBudgets);
    if (errorCode) {
      // An explicit member override is authoritative across every project type.
      // In particular, fixed-budget projects may have money capacity but no
      // hour-capacity budget to attach to the time entry.
      const canLogWithoutBudget = allowAssignmentExceed
        && errorCode === activityErrorCodes.ACTIVITY_BUDGET_REQUIRED;
      if (canLogWithoutBudget) {
        result.budget = null;
      } else {
        throw new AppError(BUDGET_ERROR_MESSAGES[errorCode] || 'Budget selection required', {
          status: 409,
          code: errorCode,
        });
      }
    }
    if (!errorCode) result.budget = budget;

    const requestedMinutes = Math.max(0, Number(minutes || 0));
    const capPeriod = assignment.allocation?.capPeriod || 'project';

    const consumedInPeriod = await getCapConsumedMinutes(assignment, entryDate, excludeEntryId);
    const pendingDraftMinutes = timeWeek
      ? await getPendingDraftMinutes(assignment._id, timeWeek._id, excludeEntryId)
      : 0;

    const capCheck = calculateCapRemainingMinutes({
      allocatedMinutes: assignment.allocation?.allocatedMinutes,
      consumedInPeriod: capPeriod === 'project'
        ? consumedInPeriod + pendingDraftMinutes
        : consumedInPeriod,
      pendingDraftMinutes: capPeriod === 'project' ? 0 : pendingDraftMinutes,
      requestedMinutes,
      allowExceed: allowAssignmentExceed,
    });

    result.userRemainingMinutes = Math.max(
      0,
      Number(assignment.allocation?.allocatedMinutes || 0) - capCheck.consumed - pendingDraftMinutes
    );

    if (!capCheck.allowed) {
      throw new AppError('User assignment cap exceeded', {
        status: 409,
        code: activityErrorCodes.ACTIVITY_USER_CAP_EXCEEDED,
        details: {
          capPeriod,
          allocatedMinutes: capCheck.allocated,
          projectedMinutes: capCheck.projected,
        },
      });
    }

    if (budget) {
      const draftBudgetMinutes = await getDraftMinutesForBudget(budget._id, excludeEntryId);
      const approvedMinutes = Number(budget.approvedMinutes || 0);
      const consumedMinutes = Number(budget.consumedMinutes || 0);
      const projectedBudgetMinutes = consumedMinutes + draftBudgetMinutes + requestedMinutes;
      result.budgetRemainingMinutes = Math.max(
        0,
        approvedMinutes - consumedMinutes - draftBudgetMinutes
      );

      const allowBudgetExceed = Boolean(project.allowBudgetExceed || allowAssignmentExceed);
      if (!allowBudgetExceed && projectedBudgetMinutes > approvedMinutes) {
        throw new AppError('Project budget exceeded', {
          status: 409,
          code: activityErrorCodes.ACTIVITY_PROJECT_BUDGET_EXCEEDED,
          details: {
            budgetId: String(budget._id),
            approvedMinutes: budget.approvedMinutes,
            consumedMinutes: budget.consumedMinutes,
            projectedBudgetMinutes,
          },
        });
      }
    }

    const stats = await projectsModule.getProjectStats(projectId).catch(() => null);
    if (stats) {
      result.projectRemainingMinutes = stats.totalRemainingMinutes;
    }

    return result;
  } catch (err) {
    result.canLog = false;
    result.blockedReason = err.code || err.message;
    if (throwOnError) throw err;
    return result;
  }
}

async function validateTimerStart(params, req = null) {
  const running = await activeTimerRepository.findRunningByUserId(params.userId);
  if (running) {
    throw new AppError('A timer is already running', {
      status: 409,
      code: activityErrorCodes.ACTIVITY_TIMER_ALREADY_RUNNING,
      details: { timerId: String(running._id) },
    });
  }

  return validateTimeEntry({
    ...params,
    source: 'timer',
    minutes: 1,
    throwOnError: true,
    req,
  });
}

module.exports = {
  resolveUserByAccountId,
  resolveUserByAccountIdOptional,
  validateTimeEntry,
  validateTimerStart,
  getCapConsumedMinutes,
  getPendingDraftMinutes,
};
