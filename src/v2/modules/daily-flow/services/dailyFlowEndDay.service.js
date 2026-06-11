const { AppError } = require('../../../kernel/errors');
const { info } = require('../../../kernel/logger');
const dailyFlowErrorCodes = require('../errors/dailyFlowErrorCodes');
const dayRepository = require('../repositories/dailyFlowDay.repository');
const goalRepository = require('../repositories/dailyFlowGoal.repository');
const catchupRepository = require('../repositories/dailyFlowCatchup.repository');
const endDayReportRepository = require('../repositories/dailyFlowEndDayReport.repository');
const { toEndDayReportDto } = require('../dto/dailyFlow.dto');
const { assertValidDayKey } = require('../helpers/dayKey.helper');
const { resolveUserIdForAccount } = require('../helpers/account.helper');
const { pickString } = require('../helpers/payload.helper');
const dayService = require('./dailyFlowDay.service');
const settingsService = require('./dailyFlowSettings.service');
const aiService = require('./dailyFlowAi.service');
const { getActivityMinutesForDay } = require('../helpers/activityMinutes.helper');

function summarizeWorkItem(goal) {
  return {
    id: String(goal._id),
    title: goal.title,
    status: goal.status,
    source_type: goal.sourceType || 'manual',
    linked_task_id: goal.linkedTaskId ? String(goal.linkedTaskId) : null,
  };
}

function summarizeLinkedTask(goal) {
  return {
    task_id: String(goal.linkedTaskId || goal.sourceId),
    title: goal.title,
    completed_at: goal.completedAt || null,
  };
}

async function collectDayData(accountId, userId, dayKey) {
  const [goalsResult, catchupsResult] = await Promise.all([
    goalRepository.listGoals({ accountId, dayKey, excludeDeletedStatus: true }, { limit: 200, skip: 0 }),
    catchupRepository.listCatchups({ accountId, dayKey }, { limit: 200, skip: 0 }),
  ]);

  const workGoals = goalsResult.items.filter((g) => g.type === 'work');
  const personalGoals = goalsResult.items.filter((g) => g.type === 'personal');
  const completedWork = workGoals.filter((g) => g.status === 'completed');
  const pendingWork = workGoals.filter((g) => g.status !== 'completed');
  const completedLinkedTasks = completedWork.filter((g) => g.sourceType === 'task' && (g.linkedTaskId || g.sourceId));
  const completedPersonal = personalGoals.filter((g) => g.status === 'completed');
  const openCatchups = catchupsResult.items.filter((c) => c.status === 'open');

  return {
    completedWork,
    pendingWork,
    completedLinkedTasks,
    personalGoals,
    completedPersonal,
    openCatchups,
    catchupsResult,
  };
}

async function endDay(accountId, payload = {}) {
  const dayKey = payload.day_key || payload.dayKey
    ? assertValidDayKey(payload.day_key || payload.dayKey)
    : await dayService.getTodayDayKey(accountId);
  const userId = await resolveUserIdForAccount(accountId);
  const settings = await settingsService.getSettingsRecord(accountId);
  const timezone = settings.timezone || 'UTC';

  const existingReport = await endDayReportRepository.findByAccountAndDayKey(accountId, dayKey);
  if (existingReport) {
    info('Daily Flow endDay idempotent return', { accountId, dayKey });
    return toEndDayReportDto(existingReport);
  }

  const day = await dayService.getOrCreateDay(accountId, dayKey);
  const blockers = pickString(payload, 'blockers');
  const tomorrowPlan = pickString(payload, 'tomorrowPlan', 'tomorrow_plan');
  const notes = pickString(payload, 'notes');

  const data = await collectDayData(accountId, userId, dayKey);
  const totalActivityMinutes = await getActivityMinutesForDay(userId, dayKey, timezone).catch(() => 0);

  const summaryContext = {
    completedWorkCount: data.completedWork.length,
    completedLinkedTaskCount: data.completedLinkedTasks.length,
    pendingWorkCount: data.pendingWork.length,
    personalGoalsCompleted: data.completedPersonal.length,
    personalGoalsTotal: data.personalGoals.length,
    catchupsOpen: data.openCatchups.length,
    blockers,
    tomorrowPlan,
    totalActivityMinutes,
  };

  const aiResult = await aiService.generateEndDaySummary({
    accountId,
    userId,
    dayKey,
    context: summaryContext,
    settings,
  });

  const catchupsSummary = {
    total: data.catchupsResult.total,
    open: data.openCatchups.length,
    resolved: data.catchupsResult.items.filter((c) => c.status === 'done').length,
  };

  const report = await endDayReportRepository.upsertReport(accountId, dayKey, {
    accountId,
    userId,
    dayId: day._id,
    dayKey,
    status: 'submitted',
    submittedAt: new Date(),
    completedWorkItems: data.completedWork.map(summarizeWorkItem),
    completedLinkedTasks: data.completedLinkedTasks.map(summarizeLinkedTask),
    pendingWorkItems: data.pendingWork.map(summarizeWorkItem),
    blockers: blockers || null,
    tomorrowPlan: tomorrowPlan || null,
    notes: notes || null,
    totalActivityMinutes,
    personalGoalsCount: data.personalGoals.length,
    completedPersonalGoalsCount: data.completedPersonal.length,
    catchupsSummary,
    aiSummary: aiResult.text,
    aiFallbackUsed: aiResult.fallback_used,
  });

  await dayRepository.updateDayByAccountAndKey(accountId, dayKey, { status: 'submitted' });

  info('Daily Flow endDay submitted', { accountId, dayKey });
  return toEndDayReportDto(report);
}

module.exports = {
  endDay,
  collectDayData,
};
