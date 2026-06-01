const timeWeekService = require('../../services/timeWeek.service');
const timeEntryService = require('../../services/timeEntry.service');
const timeWeekRepository = require('../../repositories/timeWeek.repository');
const timeEntryRepository = require('../../repositories/timeEntry.repository');
const activeTimerRepository = require('../../repositories/activeTimer.repository');
const timeValidationService = require('../../services/timeValidation.service');
const counterConsumptionService = require('../../services/counterConsumption.service');
const projectsModule = require('../../../projects');

const ACCOUNT_ID = '507f1f77bcf86cd799439001';
const USER_ID = '507f1f77bcf86cd799439012';
const ASSIGNMENT_ID = '507f1f77bcf86cd799439011';
const PROJECT_ID = '507f1f77bcf86cd799439013';
const BUDGET_ID = '507f1f77bcf86cd799439015';
const CATEGORY_ID = '507f1f77bcf86cd799439016';
const ENTRY_DATE = new Date('2026-05-19T12:00:00.000Z');
const ENTRY_MINUTES = 120;

const originals = {
  timeWeek: { ...timeWeekRepository },
  timeEntry: { ...timeEntryRepository },
  activeTimer: { ...activeTimerRepository },
  timeValidation: {
    validateTimeEntry: timeValidationService.validateTimeEntry,
    validateTimerStart: timeValidationService.validateTimerStart,
  },
  counterConsumption: {
    withOptionalTransaction: counterConsumptionService.withOptionalTransaction,
  },
  projects: {
    getProjectForActivity: projectsModule.getProjectForActivity,
    getAssignmentForUser: projectsModule.getAssignmentForUser,
    getApprovedBudgetsForProject: projectsModule.getApprovedBudgetsForProject,
    incrementAssignmentConsumedMinutes: projectsModule.incrementAssignmentConsumedMinutes,
    reverseAssignmentConsumedMinutes: projectsModule.reverseAssignmentConsumedMinutes,
    incrementBudgetConsumedMinutes: projectsModule.incrementBudgetConsumedMinutes,
    reverseBudgetConsumedMinutes: projectsModule.reverseBudgetConsumedMinutes,
    recalculateProjectStats: projectsModule.recalculateProjectStats,
    emitProjectEvent: projectsModule.emitProjectEvent,
    getProjectStats: projectsModule.getProjectStats,
  },
};

let store;

function createLifecycleStore() {
  let weekCounter = 0;
  let entryCounter = 0;

  const activeStore = {
    weeks: new Map(),
    entries: new Map(),
    assignment: {
      _id: ASSIGNMENT_ID,
      userId: USER_ID,
      projectId: PROJECT_ID,
      allocation: {
        allocatedMinutes: 2400,
        capPeriod: 'project',
        allowExceed: false,
        canLogTime: true,
      },
      stats: {
        consumedMinutes: 0,
        remainingMinutes: 2400,
      },
    },
    budget: {
      _id: BUDGET_ID,
      approvedMinutes: 5000,
      consumedMinutes: 0,
    },
    projectStats: {
      totalConsumedMinutes: 0,
    },
    metrics: {
      assignmentConsumed: 0,
      budgetConsumed: 0,
      statsRecalcCalls: 0,
      projectEvents: 0,
    },
    nextWeekId() {
      weekCounter += 1;
      return `507f1f77bcf86cd7994390${10 + weekCounter}`;
    },
    nextEntryId() {
      entryCounter += 1;
      return `507f1f77bcf86cd7994391${10 + entryCounter}`;
    },
    getWeek(id) {
      return activeStore.weeks.get(String(id)) || null;
    },
    getEntry(id) {
      return activeStore.entries.get(String(id)) || null;
    },
    listEntries(filters = {}) {
      return [...activeStore.entries.values()].filter((entry) => {
        if (entry.isDeleted) return false;
        if (filters.timeWeekId && String(entry.timeWeekId) !== String(filters.timeWeekId)) return false;
        if (filters.status && entry.status !== filters.status) return false;
        if (filters.statuses && !filters.statuses.includes(entry.status)) return false;
        return true;
      });
    },
    recalculateWeekTotals(weekId) {
      const entries = activeStore.listEntries({ timeWeekId: weekId });
      const week = activeStore.getWeek(weekId);
      if (!week) return null;
      week.totalMinutes = entries.reduce((sum, row) => sum + Number(row.minutes || 0), 0);
      week.totalEntries = entries.length;
      return week;
    },
    snapshotCounters() {
      return {
        assignmentConsumed: activeStore.metrics.assignmentConsumed,
        budgetConsumed: activeStore.metrics.budgetConsumed,
        assignmentRemaining: activeStore.assignment.stats.remainingMinutes,
        budgetConsumedStored: activeStore.budget.consumedMinutes,
        statsRecalcCalls: activeStore.metrics.statsRecalcCalls,
        projectStatsConsumed: activeStore.projectStats.totalConsumedMinutes,
      };
    },
  };

  return activeStore;
}

function wireLifecycleMocks(activeStore) {
  store = activeStore;

  counterConsumptionService.withOptionalTransaction = async (work) => work(null);
  timeValidationService.validateTimeEntry = async () => ({ canLog: true });
  timeValidationService.validateTimerStart = async () => ({ canLog: true });
  activeTimerRepository.findRunningByUserId = async () => null;

  timeWeekRepository.findById = async (weekId) => store.getWeek(weekId);
  timeWeekRepository.findByUserAndWeekStart = async (userId, weekStartDate) => {
    for (const week of store.weeks.values()) {
      if (
        String(week.userId) === String(userId)
        && new Date(week.weekStartDate).getTime() === new Date(weekStartDate).getTime()
      ) {
        return week;
      }
    }
    return null;
  };
  timeWeekRepository.createWeek = async (payload) => {
    const week = {
      _id: store.nextWeekId(),
      totalMinutes: 0,
      totalEntries: 0,
      lockedAt: null,
      ...payload,
    };
    store.weeks.set(String(week._id), week);
    return week;
  };
  timeWeekRepository.updateWeek = async (weekId, payload, _session, { expectedStatus = null } = {}) => {
    const week = store.getWeek(weekId);
    if (!week) return null;
    if (expectedStatus && week.status !== expectedStatus) return null;
    Object.assign(week, payload);
    return week;
  };
  timeWeekRepository.recalculateWeekTotals = async (weekId) => store.recalculateWeekTotals(weekId);

  timeEntryRepository.findById = async (entryId) => store.getEntry(entryId);
  timeEntryRepository.listEntries = async (filters = {}) => store.listEntries(filters);
  timeEntryRepository.createEntry = async (payload) => {
    const entry = {
      _id: store.nextEntryId(),
      isDeleted: false,
      isLocked: false,
      lockedAt: null,
      status: 'draft',
      ...payload,
    };
    store.entries.set(String(entry._id), entry);
    return entry;
  };
  timeEntryRepository.updateEntry = async (entryId, payload, _session, { expectedStatus = null } = {}) => {
    const entry = store.getEntry(entryId);
    if (!entry || entry.isDeleted) return null;
    if (expectedStatus && entry.status !== expectedStatus) return null;
    Object.assign(entry, payload);
    return entry;
  };
  timeEntryRepository.updateManyByWeek = async (weekId, payload, _session, { statuses = null } = {}) => {
    for (const entry of store.listEntries({ timeWeekId: weekId, statuses })) {
      Object.assign(entry, payload);
    }
    return { modifiedCount: 1 };
  };
  timeEntryRepository.softDeleteEntry = async (entryId) => {
    const entry = store.getEntry(entryId);
    if (!entry || entry.isDeleted || entry.status !== 'draft' || entry.isLocked) return null;
    entry.isDeleted = true;
    entry.deletedAt = new Date();
    return entry;
  };
  timeEntryRepository.sumMinutesByWeek = async (weekId, { statuses = null } = {}) => {
    const entries = store.listEntries({ timeWeekId: weekId, statuses });
    return {
      totalMinutes: entries.reduce((sum, row) => sum + Number(row.minutes || 0), 0),
      totalEntries: entries.length,
    };
  };

  projectsModule.getProjectForActivity = async () => ({
    _id: PROJECT_ID,
    status: 'active',
    isDeleted: false,
    allowBudgetExceed: false,
    settings: { allowManualTimeEntry: true },
  });
  projectsModule.getAssignmentForUser = async () => store.assignment;
  projectsModule.getApprovedBudgetsForProject = async () => [store.budget];
  projectsModule.getProjectStats = async () => ({
    totalRemainingMinutes: 5000 - store.projectStats.totalConsumedMinutes,
    totalConsumedMinutes: store.projectStats.totalConsumedMinutes,
  });
  projectsModule.incrementAssignmentConsumedMinutes = async (_assignmentId, minutes) => {
    const delta = Math.max(0, Number(minutes || 0));
    store.metrics.assignmentConsumed += delta;
    store.assignment.stats.consumedMinutes += delta;
    store.assignment.stats.remainingMinutes = Math.max(
      0,
      store.assignment.allocation.allocatedMinutes - store.assignment.stats.consumedMinutes
    );
    store.projectStats.totalConsumedMinutes += delta;
    return store.assignment;
  };
  projectsModule.reverseAssignmentConsumedMinutes = async (_assignmentId, minutes) => {
    const delta = Math.max(0, Number(minutes || 0));
    store.metrics.assignmentConsumed -= delta;
    store.assignment.stats.consumedMinutes = Math.max(
      0,
      store.assignment.stats.consumedMinutes - delta
    );
    store.assignment.stats.remainingMinutes = Math.max(
      0,
      store.assignment.allocation.allocatedMinutes - store.assignment.stats.consumedMinutes
    );
    store.projectStats.totalConsumedMinutes = Math.max(
      0,
      store.projectStats.totalConsumedMinutes - delta
    );
    return store.assignment;
  };
  projectsModule.incrementBudgetConsumedMinutes = async (_budgetId, minutes) => {
    const delta = Math.max(0, Number(minutes || 0));
    store.metrics.budgetConsumed += delta;
    store.budget.consumedMinutes += delta;
    return store.budget;
  };
  projectsModule.reverseBudgetConsumedMinutes = async (_budgetId, minutes) => {
    const delta = Math.max(0, Number(minutes || 0));
    store.metrics.budgetConsumed -= delta;
    store.budget.consumedMinutes = Math.max(0, store.budget.consumedMinutes - delta);
    return store.budget;
  };
  projectsModule.recalculateProjectStats = async () => {
    store.metrics.statsRecalcCalls += 1;
    return store.projectStats;
  };
  projectsModule.emitProjectEvent = async () => {
    store.metrics.projectEvents += 1;
    return { id: 'event-1' };
  };
}

function setupActivityLifecycleHarness() {
  wireLifecycleMocks(createLifecycleStore());
}

function teardownActivityLifecycleHarness() {
  Object.assign(timeWeekRepository, originals.timeWeek);
  Object.assign(timeEntryRepository, originals.timeEntry);
  Object.assign(activeTimerRepository, originals.activeTimer);
  timeValidationService.validateTimeEntry = originals.timeValidation.validateTimeEntry;
  timeValidationService.validateTimerStart = originals.timeValidation.validateTimerStart;
  counterConsumptionService.withOptionalTransaction = originals.counterConsumption.withOptionalTransaction;
  Object.assign(projectsModule, originals.projects);
  store = null;
}

function getLifecycleStore() {
  return store;
}

async function createDraftWeekWithEntry(req) {
  const week = await timeWeekService.getOrCreateWeek(USER_ID, ENTRY_DATE, ACCOUNT_ID);
  const entry = await timeEntryService.createEntry({
    projectId: PROJECT_ID,
    budgetId: BUDGET_ID,
    workCategoryId: CATEGORY_ID,
    entryDate: ENTRY_DATE,
    minutes: ENTRY_MINUTES,
    timeWeekId: week._id,
  }, ACCOUNT_ID, req);

  return { week, entry };
}

module.exports = {
  ACCOUNT_ID,
  USER_ID,
  PROJECT_ID,
  BUDGET_ID,
  CATEGORY_ID,
  ENTRY_DATE,
  ENTRY_MINUTES,
  setupActivityLifecycleHarness,
  teardownActivityLifecycleHarness,
  getLifecycleStore,
  createDraftWeekWithEntry,
};
