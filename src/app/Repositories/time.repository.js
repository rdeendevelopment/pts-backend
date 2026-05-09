const {
  ActivityCategory,
  ActiveTimer,
  CoreProject,
  CoreUser,
  ProjectAssignment,
  ProjectBudget,
  TimeEntry,
  TimeWeek,
  WorkingHours,
} = require('../MongoModels');

function serviceError(message, status = 400, data = null) {
  const error = new Error(message);
  error.status = status;
  if (data) error.data = data;
  return error;
}

function labelMinutes(minutes) {
  const m = Math.max(0, Number(minutes || 0));
  const h = Math.floor(m / 60);
  const rem = m % 60;
  if (h === 0) return `${rem}m`;
  if (rem === 0) return `${h}h`;
  return `${h}h ${rem}m`;
}

function toUTCDate(date = new Date()) {
  const value = new Date(date);
  if (Number.isNaN(value.getTime())) throw serviceError('Invalid date');
  return new Date(`${value.toISOString().slice(0, 10)}T00:00:00.000Z`);
}

function toDateOnly(date = new Date()) {
  const value = new Date(date);
  if (Number.isNaN(value.getTime())) throw serviceError('Invalid date');
  return value.toISOString().slice(0, 10);
}

function weekRange(dateInput = new Date()) {
  const date = toUTCDate(dateInput);
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() - day + 1);
  const startDate = new Date(date);
  const endDate = new Date(date);
  endDate.setUTCDate(endDate.getUTCDate() + 6);
  return { start: startDate, end: endDate, startStr: toDateOnly(startDate), endStr: toDateOnly(endDate) };
}

function legacyWeekId(userLegacyId, weekStartDate) {
  return `legacy-${userLegacyId}-${toDateOnly(weekStartDate)}`;
}

function parseLegacyWeekId(value) {
  const match = String(value || '').match(/^legacy-(\d{1,})-(\d{4}-\d{2}-\d{2})$/);
  if (!match) return null;
  return { userLegacyId: Number(match[1]), weekStart: new Date(`${match[2]}T00:00:00.000Z`) };
}

function statusMatches(status, filter) {
  if (!filter) return true;
  const statuses = String(filter).split(',').map((value) => value.trim()).filter(Boolean);
  return statuses.length === 0 || statuses.includes(status);
}

function minutesBetween(start, end) {
  return Math.max(1, Math.round((new Date(end).getTime() - new Date(start).getTime()) / 60000));
}

function normalizeTimeRange(startTime, endTime) {
  const hasStart = startTime !== null && startTime !== undefined && startTime !== '';
  const hasEnd = endTime !== null && endTime !== undefined && endTime !== '';
  if (!hasStart && !hasEnd) return { startTime: null, endTime: null };
  if (!hasStart || !hasEnd) throw serviceError('Start time and end time are both required for timed entries');
  const start = new Date(startTime);
  const end = new Date(endTime);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) throw serviceError('Invalid start or end time');
  if (end <= start) throw serviceError('End time must be after start time');
  return { startTime: start, endTime: end };
}

async function nextLegacyId(Model) {
  const row = await Model.findOne({}, { legacyId: 1 }).sort({ legacyId: -1 }).lean();
  return Number(row?.legacyId || 0) + 1;
}

async function getActivityCategories() {
  const rows = await ActivityCategory.find({ isActive: true }).sort({ name: 1 }).lean();
  return rows.map((row) => ({ id: row.legacyId, name: row.name, description: row.description, is_active: row.isActive }));
}

async function resolveRefs({ projectId, weekId, budgetId, activityCategoryId }) {
  const [project, week, budget, activityCategory] = await Promise.all([
    projectId ? CoreProject.findOne({ legacyId: Number(projectId) }).lean() : null,
    weekId ? TimeWeek.findOne({ _id: weekId }).lean() : null,
    budgetId ? ProjectBudget.findOne({ legacyId: Number(budgetId) }).lean() : null,
    activityCategoryId ? ActivityCategory.findOne({ legacyId: Number(activityCategoryId) }).lean() : null,
  ]);
  return { project, week, budget, activityCategory };
}

async function getOrCreateWeek(userId, dateInput) {
  const range = weekRange(dateInput);
  let week = await TimeWeek.findOne({ userId, weekStartDate: range.start });
  if (week) return week;
  week = await TimeWeek.create({
    legacyId: await nextLegacyId(TimeWeek),
    userId,
    weekStartDate: range.start,
    weekEndDate: range.end,
    totalMinutes: 0,
    status: 'draft',
  });
  return week;
}

async function getWeekContext(userId, dateInput) {
  const range = weekRange(dateInput);
  const [user, week, legacyRows] = await Promise.all([
    CoreUser.findOne({ _id: userId }, { legacyId: 1 }).lean(),
    TimeWeek.findOne({ userId, weekStartDate: range.start }).lean(),
    WorkingHours.find({
      userId,
      isDeleted: false,
      weekEnding: { $gte: range.start, $lte: new Date(range.end.getTime() + 86400001) },
    })
      .populate('projectId', 'legacyId title')
      .lean(),
  ]);
  return { user, week, legacyRows, range };
}

async function assertWeekEditable(week) {
  if (['submitted', 'approved'].includes(week.status)) {
    throw serviceError(week.status === 'approved' ? 'Approved week is locked' : 'Week already submitted', 409);
  }
}

async function recalculateWeek(weekId) {
  const totals = await TimeEntry.aggregate([{ $match: { weekId } }, { $group: { _id: null, total: { $sum: '$durationMinutes' } } }]);
  await TimeWeek.updateOne({ _id: weekId }, { $set: { totalMinutes: Number(totals[0]?.total || 0) } });
}

async function assertNoOverlap(userId, entryDate, startTime, endTime, excludeEntryId = null) {
  const range = normalizeTimeRange(startTime, endTime);
  if (!range.startTime || !range.endTime) return;
  const query = {
    userId,
    entryDate,
    startTime: { $ne: null, $lt: range.endTime },
    endTime: { $ne: null, $gt: range.startTime },
  };
  if (excludeEntryId) query.legacyId = { $ne: Number(excludeEntryId) };
  if (await TimeEntry.exists(query)) throw serviceError('Entry overlaps existing time', 409);
}

async function assertNoActiveTimerInWeek(userId, week) {
  const timer = await ActiveTimer.findOne({
    userId,
    isRunning: true,
    startTime: { $gte: week.weekStartDate, $lte: week.weekEndDate },
  }).lean();
  if (timer) throw serviceError('Stop the active timer before submitting this week', 409);
}

async function assertProjectWritableForUser(userId, projectId, durationMinutes = 0, excludeEntryId = null) {
  const [project, assignment] = await Promise.all([
    CoreProject.findOne({ legacyId: Number(projectId), isDeleted: false, isActive: true, status: 'active' }).lean(),
    ProjectAssignment.findOne({ legacyId: { $exists: true }, projectId: { $exists: true }, userId, isDeleted: false, status: 'assigned' })
      .lean()
      .then(async (a) => {
        if (a) return a;
        const proj = await CoreProject.findOne({ legacyId: Number(projectId) }, { _id: 1 }).lean();
        return proj ? ProjectAssignment.findOne({ projectId: proj._id, userId, isDeleted: false, status: 'assigned' }).lean() : null;
      }),
  ]);
  if (!project || !assignment) throw serviceError('This project is not active or is not assigned to you. Existing history is view-only.', 403);
  const capMinutes = Number(assignment.hoursCapMinutes || 0);
  if (!capMinutes) return project;
  const match = { userId, projectId: project._id, status: { $ne: 'rejected' } };
  if (excludeEntryId) match.legacyId = { $ne: Number(excludeEntryId) };
  const totals = await TimeEntry.aggregate([{ $match: match }, { $group: { _id: null, total: { $sum: '$durationMinutes' } } }]);
  const usedMinutes = Number(totals[0]?.total || 0);
  const remainingCap = capMinutes - usedMinutes;
  if (usedMinutes + Number(durationMinutes || 0) > capMinutes) {
    throw serviceError(`Your hour cap for "${project.title}" has been reached. You have ${labelMinutes(Math.max(0, remainingCap))} remaining out of ${labelMinutes(capMinutes)} allocated.`, 409, {
      errorCode: 'CAP_EXCEEDED',
      projectTitle: project.title,
      capMinutes,
      usedMinutes,
      remainingMinutes: Math.max(0, remainingCap),
      requestedMinutes: Number(durationMinutes || 0),
    });
  }
  return project;
}

function serializeWeek(week) {
  const row = week?.toObject ? week.toObject() : week;
  return {
    id: row.legacyId,
    user_id: row.userId?.legacyId ?? row.userLegacyId ?? null,
    week_start_date: row.weekStartDate ? toDateOnly(row.weekStartDate) : null,
    week_end_date: row.weekEndDate ? toDateOnly(row.weekEndDate) : null,
    total_minutes: row.totalMinutes,
    status: row.status,
    submitted_at: row.submittedAt,
    approved_by: row.approvedBy,
    approved_at: row.approvedAt,
    rejection_reason: row.rejectionReason,
    created_at: row.createdAt,
    updated_at: row.updatedAt,
  };
}

function serializeEntry(entry) {
  const row = entry?.toObject ? entry.toObject() : entry;
  return {
    id: row.legacyId,
    user_id: row.userId?.legacyId ?? row.userId,
    project_id: row.projectId?.legacyId ?? row.projectId,
    task_id: row.taskId,
    activity_category_id: row.activityCategoryId?.legacyId ?? row.activityCategoryId,
    budget_id: row.budgetId?.legacyId ?? row.budgetId,
    is_billable: row.isBillable,
    week_id: row.weekId?.legacyId ?? row.weekId,
    entry_date: row.entryDate ? toDateOnly(row.entryDate) : null,
    start_time: row.startTime,
    end_time: row.endTime,
    duration_minutes: row.durationMinutes,
    description: row.description,
    entry_type: row.entryType,
    status: row.status,
    project_name: row.projectId?.title,
    activity_category_name: row.activityCategoryId?.name,
    budget_name: row.budgetId?.name,
    created_at: row.createdAt,
    updated_at: row.updatedAt,
  };
}

function serializeTimer(timer) {
  const row = timer?.toObject ? timer.toObject() : timer;
  if (!row) return null;
  return {
    id: row.legacyId,
    user_id: row.userId?.legacyId ?? row.userId,
    project_id: row.projectId?.legacyId ?? row.projectId,
    task_id: row.taskId,
    activity_category_id: row.activityCategoryId?.legacyId ?? row.activityCategoryId,
    budget_id: row.budgetId?.legacyId ?? row.budgetId,
    is_billable: row.isBillable,
    start_time: row.startTime,
    is_running: row.isRunning,
    is_paused: row.isPaused,
    paused_at: row.pausedAt,
    project_name: row.projectId?.title,
    activity_category_name: row.activityCategoryId?.name,
    budget_name: row.budgetId?.name,
  };
}

// Converts legacy WorkingHours rows to TimeEntry-shaped objects for unified display.
function buildLegacyEntries(legacyRows, weekStart) {
  const DAY_OFFSETS = { mon: 0, tue: 1, wed: 2, thu: 3, fri: 4, sat: 5, sun: 6 };
  const entries = [];
  for (const wh of legacyRows) {
    for (const [dayKey, offset] of Object.entries(DAY_OFFSETS)) {
      const hours = Number(wh[dayKey] || 0);
      if (hours <= 0) continue;
      const entryDate = new Date(weekStart);
      entryDate.setUTCDate(entryDate.getUTCDate() + offset);
      const noteForDay = (wh.notes || []).find((n) => n.dayOfWeek === dayKey);
      entries.push({
        id: `legacy-${wh.legacyId}-${dayKey}`,
        user_id: null,
        project_id: wh.projectId?.legacyId || null,
        project_name: wh.projectId?.title || null,
        task_id: wh.taskId || null,
        activity_category_id: null,
        activity_category_name: 'Add Activity',
        budget_id: null,
        is_billable: null,
        entry_date: toDateOnly(entryDate),
        duration_minutes: Math.round(hours * 60),
        description: noteForDay?.note || null,
        entry_type: 'add-activity',
        status: wh.verified ? 'approved' : wh.submit ? 'submitted' : 'draft',
      });
    }
  }
  return entries;
}

async function getWeek(userId, dateInput) {
  const { user, week, legacyRows, range } = await getWeekContext(userId, dateInput);

  const newEntries = week ? await TimeEntry.find({ userId, weekId: week._id })
      .populate('projectId')
      .populate('activityCategoryId')
      .populate('budgetId')
      .sort({ entryDate: 1, startTime: 1, legacyId: 1 })
      .lean() : [];

  const legacyEntries = buildLegacyEntries(legacyRows, range.start);
  const newMinutes = newEntries.reduce((sum, entry) => sum + Number(entry.durationMinutes || 0), 0);
  const legacyMinutes = legacyEntries.reduce((sum, entry) => sum + Number(entry.duration_minutes || 0), 0);
  const legacyStatus = legacyRows.some((row) => row.verified) ? 'approved' : legacyRows.some((row) => row.submit) ? 'submitted' : 'draft';
  const serializedWeek = week
    ? serializeWeek(week)
    : {
        id: legacyEntries.length ? legacyWeekId(user?.legacyId || 0, range.start) : null,
        user_id: user?.legacyId || null,
        week_start_date: range.startStr,
        week_end_date: range.endStr,
        total_minutes: 0,
        status: legacyStatus,
        source: legacyEntries.length ? 'legacy' : 'synthetic',
        submitted_at: null,
        approved_by: null,
        approved_at: null,
        rejection_reason: null,
        created_at: null,
        updated_at: null,
      };
  serializedWeek.total_minutes = newMinutes + legacyMinutes;

  return {
    week: serializedWeek,
    entries: [...newEntries.map(serializeEntry), ...legacyEntries],
  };
}

async function createEntry(userId, data, budgetService) {
  const entryDate = toUTCDate(data.entryDate || data.entry_date || new Date());
  const week = await getOrCreateWeek(userId, entryDate);
  await assertWeekEditable(week);
  const duration = Number(data.durationMinutes || data.duration_minutes || 0);
  const projectId = data.projectId || data.project_id;
  const activityCategoryId = data.activityCategoryId || data.activity_category_id;
  const entryType = data.entryType || data.entry_type || 'manual';
  if (!projectId) throw serviceError('Project is required');
  if (!activityCategoryId && entryType !== 'add-activity') throw serviceError('Activity category is required');
  if (!duration || duration < 1) throw serviceError('Duration is required');
  await assertProjectWritableForUser(userId, projectId, duration);
  const budget = await budgetService.resolveBudgetForTimeEntry(projectId, data.budgetId ?? data.budget_id);
  await budgetService.assertBudgetCanConsume(budget?.id, duration);
  const range = normalizeTimeRange(data.startTime || data.start_time || null, data.endTime || data.end_time || null);
  await assertNoOverlap(userId, entryDate, range.startTime, range.endTime);
  const { project, activityCategory } = await resolveRefs({ projectId, activityCategoryId });
  const budgetDoc = budget?.id ? await ProjectBudget.findOne({ legacyId: Number(budget.id) }).lean() : null;
  await TimeEntry.create({
    legacyId: await nextLegacyId(TimeEntry),
    userId,
    projectId: project?._id || null,
    weekId: week._id,
    budgetId: budgetDoc?._id || null,
    activityCategoryId: activityCategory?._id || null,
    taskId: data.taskId || data.task_id || null,
    entryDate,
    startTime: range.startTime,
    endTime: range.endTime,
    durationMinutes: duration,
    description: data.description || '',
    entryType,
    status: 'draft',
    isBillable: data.isBillable !== undefined ? Boolean(data.isBillable) : data.is_billable !== undefined ? Boolean(data.is_billable) : true,
  });
  await recalculateWeek(week._id);
  await budgetService.recalculateBudget(budget?.id);
  return getWeek(userId, entryDate);
}

async function updateEntry(userId, entryId, data, budgetService) {
  const existing = await TimeEntry.findOne({ legacyId: Number(entryId), userId }).populate('weekId');
  if (!existing) throw serviceError('Time entry not found', 404);
  const currentWeek = existing.weekId;
  await assertWeekEditable(currentWeek);
  const entryDate = data.entryDate || data.entry_date ? toUTCDate(data.entryDate || data.entry_date) : existing.entryDate;
  const nextWeek = entryDate.getTime() === existing.entryDate.getTime() ? currentWeek : await getOrCreateWeek(userId, entryDate);
  await assertWeekEditable(nextWeek);
  const projectId = data.projectId || data.project_id || existing.projectId;
  const duration = Number(data.durationMinutes || data.duration_minutes || existing.durationMinutes);
  await assertProjectWritableForUser(userId, projectId?.legacyId ?? projectId, duration, entryId);
  const budget = await budgetService.resolveBudgetForTimeEntry(projectId?.legacyId ?? projectId, data.budgetId ?? data.budget_id ?? existing.budgetId?.legacyId ?? existing.budgetId);
  await budgetService.assertBudgetCanConsume(budget?.id, duration, entryId);
  const range = normalizeTimeRange(
    data.startTime !== undefined ? data.startTime : existing.startTime,
    data.endTime !== undefined ? data.endTime : existing.endTime
  );
  await assertNoOverlap(userId, entryDate, range.startTime, range.endTime, entryId);
  const activityCategoryId = data.activityCategoryId || data.activity_category_id;
  const { project, activityCategory } = await resolveRefs({
    projectId: projectId?.legacyId ?? projectId,
    activityCategoryId: activityCategoryId?.legacyId ?? activityCategoryId,
  });
  const budgetDoc = budget?.id ? await ProjectBudget.findOne({ legacyId: Number(budget.id) }).lean() : null;
  await TimeEntry.updateOne({ legacyId: Number(entryId) }, {
    $set: {
      projectId: project?._id ?? existing.projectId,
      weekId: nextWeek._id,
      budgetId: budgetDoc?._id ?? existing.budgetId,
      activityCategoryId: activityCategory?._id ?? existing.activityCategoryId,
      taskId: data.taskId !== undefined ? data.taskId : existing.taskId,
      entryDate,
      startTime: range.startTime,
      endTime: range.endTime,
      durationMinutes: duration,
      description: data.description !== undefined ? data.description : existing.description,
      isBillable: data.isBillable !== undefined ? Boolean(data.isBillable) : data.is_billable !== undefined ? Boolean(data.is_billable) : existing.isBillable,
    },
  });
  await recalculateWeek(currentWeek._id);
  if (!currentWeek._id.equals(nextWeek._id)) await recalculateWeek(nextWeek._id);
  await budgetService.recalculateBudget(existing.budgetId?.legacyId ?? existing.budgetId);
  if (String(existing.budgetId || '') !== String(budgetDoc?._id || '')) await budgetService.recalculateBudget(budget?.id);
  return getWeek(userId, entryDate);
}

async function deleteEntry(userId, entryId, budgetService) {
  const existing = await TimeEntry.findOne({ legacyId: Number(entryId), userId }).lean();
  if (!existing) throw serviceError('Time entry not found', 404);
  const week = await TimeWeek.findOne({ _id: existing.weekId });
  await assertWeekEditable(week);
  await TimeEntry.deleteOne({ legacyId: Number(entryId), userId });
  await recalculateWeek(existing.weekId);
  await budgetService.recalculateBudget(existing.budgetId);
  return getWeek(userId, existing.entryDate);
}

async function submitWeek(userId, dateInput) {
  const { week, legacyRows, range } = await getWeekContext(userId, dateInput);
  const targetWeek = week || await getOrCreateWeek(userId, dateInput);
  await assertWeekEditable(targetWeek);
  await assertNoActiveTimerInWeek(userId, targetWeek);
  await TimeWeek.updateOne({ _id: targetWeek._id }, { $set: { status: 'submitted', submittedAt: new Date() } });
  await TimeEntry.updateMany({ weekId: targetWeek._id, status: 'draft' }, { $set: { status: 'submitted' } });
  if (legacyRows.length) {
    await WorkingHours.updateMany(
      { _id: { $in: legacyRows.map((row) => row._id) }, isDeleted: false, verified: { $ne: true } },
      { $set: { submit: true } }
    );
  }
  return getWeek(userId, range.start);
}

async function unsubmitWeek(userId, dateInput) {
  const { week, legacyRows, range } = await getWeekContext(userId, dateInput);
  const legacySubmitted = legacyRows.some((row) => row.submit && !row.verified);
  if (!week && !legacySubmitted) throw serviceError('Week not found', 404);
  if (week && week.status !== 'submitted' && !legacySubmitted) {
    throw serviceError('Only submitted weeks can be reverted to draft', 409);
  }
  if (week?.status === 'submitted') {
    await TimeWeek.updateOne({ _id: week._id }, { $set: { status: 'draft', submittedAt: null } });
    await TimeEntry.updateMany({ weekId: week._id, status: 'submitted' }, { $set: { status: 'draft' } });
  }
  if (legacySubmitted) {
    await WorkingHours.updateMany(
      { _id: { $in: legacyRows.filter((row) => row.submit && !row.verified).map((row) => row._id) }, isDeleted: false },
      { $set: { submit: false, verified: false, approvedDate: null } }
    );
  }
  return getWeek(userId, range.start);
}

async function getActiveTimer(userId) {
  const timer = await ActiveTimer.findOne({ userId, $or: [{ isRunning: true }, { isPaused: true }] })
    .populate('projectId')
    .populate('activityCategoryId')
    .populate('budgetId')
    .sort({ legacyId: -1 })
    .lean();
  return serializeTimer(timer);
}

async function startTimer(userId, data, budgetService) {
  if (await ActiveTimer.exists({ userId, $or: [{ isRunning: true }, { isPaused: true }] })) throw serviceError('Timer already running', 409);
  const projectId = data.projectId || data.project_id;
  const activityCategoryId = data.activityCategoryId || data.activity_category_id;
  if (!projectId) throw serviceError('Project is required');
  if (!activityCategoryId) throw serviceError('Activity category is required');
  await assertProjectWritableForUser(userId, projectId, 1);
  const budget = await budgetService.resolveBudgetForTimeEntry(projectId, data.budgetId ?? data.budget_id);
  const week = await getOrCreateWeek(userId, new Date());
  await assertWeekEditable(week);
  const { project, activityCategory } = await resolveRefs({ projectId, activityCategoryId });
  const budgetDoc = budget?.id ? await ProjectBudget.findOne({ legacyId: Number(budget.id) }).lean() : null;
  const timer = await ActiveTimer.create({
    legacyId: await nextLegacyId(ActiveTimer),
    userId,
    projectId: project?._id || null,
    budgetId: budgetDoc?._id || null,
    activityCategoryId: activityCategory?._id || null,
    taskId: data.taskId || data.task_id || null,
    startTime: new Date(),
    isRunning: true,
    isPaused: false,
    pausedAt: null,
    isBillable: data.isBillable !== undefined ? Boolean(data.isBillable) : data.is_billable !== undefined ? Boolean(data.is_billable) : true,
  });
  return serializeTimer(await ActiveTimer.findOne({ _id: timer._id }).populate('projectId').populate('activityCategoryId').populate('budgetId').lean());
}

async function pauseTimer(userId) {
  const timer = await ActiveTimer.findOne({ userId, isRunning: true }).sort({ legacyId: -1 });
  if (!timer) throw serviceError('No active timer', 404);
  timer.isRunning = false;
  timer.isPaused = true;
  timer.pausedAt = new Date();
  await timer.save();
  return serializeTimer(await ActiveTimer.findOne({ _id: timer._id }).populate('projectId').populate('activityCategoryId').populate('budgetId').lean());
}

async function resumeTimer(userId) {
  const timer = await ActiveTimer.findOne({ userId, isPaused: true }).sort({ legacyId: -1 });
  if (!timer) throw serviceError('No paused timer', 404);
  const pausedAt = timer.pausedAt ? new Date(timer.pausedAt).getTime() : Date.now();
  const pausedMs = Math.max(0, Date.now() - pausedAt);
  timer.startTime = new Date(new Date(timer.startTime).getTime() + pausedMs);
  timer.isRunning = true;
  timer.isPaused = false;
  timer.pausedAt = null;
  await timer.save();
  return serializeTimer(await ActiveTimer.findOne({ _id: timer._id }).populate('projectId').populate('activityCategoryId').populate('budgetId').lean());
}

async function stopTimer(userId, data = {}, budgetService) {
  const timer = await ActiveTimer.findOne({ userId, $or: [{ isRunning: true }, { isPaused: true }] }).sort({ legacyId: -1 });
  if (!timer) throw serviceError('No active timer', 404);
  const endTime = timer.isPaused && timer.pausedAt ? new Date(timer.pausedAt) : new Date();
  const rawDuration = minutesBetween(timer.startTime, endTime);
  if (rawDuration > 16 * 60) {
    timer.isRunning = false;
    await timer.save();
    throw serviceError('This timer has been running too long and was automatically discarded. Please log the time manually.', 422);
  }
  const entryDate = toUTCDate(timer.startTime);
  const week = await getOrCreateWeek(userId, entryDate);
  await assertWeekEditable(week);
  await assertNoOverlap(userId, entryDate, timer.startTime, endTime);
  const timerProject = await CoreProject.findOne({ _id: timer.projectId }, { legacyId: 1 }).lean();
  const timerBudget = timer.budgetId ? await ProjectBudget.findOne({ _id: timer.budgetId }, { legacyId: 1 }).lean() : null;
  await assertProjectWritableForUser(userId, timerProject?.legacyId, rawDuration);
  await budgetService.assertBudgetCanConsume(timerBudget?.legacyId, rawDuration);
  await TimeEntry.create({
    legacyId: await nextLegacyId(TimeEntry),
    userId,
    projectId: timer.projectId,
    weekId: week._id,
    budgetId: timer.budgetId || null,
    activityCategoryId: timer.activityCategoryId || null,
    taskId: timer.taskId,
    entryDate,
    startTime: timer.startTime,
    endTime,
    durationMinutes: rawDuration,
    description: data.description || '',
    entryType: 'clock',
    status: 'draft',
    isBillable: timer.isBillable,
  });
  timer.isRunning = false;
  timer.isPaused = false;
  timer.pausedAt = null;
  await timer.save();
  await recalculateWeek(week._id);
  await budgetService.recalculateBudget(timerBudget?.legacyId);
  return getWeek(userId, entryDate);
}

async function getTeamTimesheet(filters = {}) {
  const match = {};
  if (filters.userId) {
    const user = await CoreUser.findOne({ legacyId: Number(filters.userId) }, { _id: 1 }).lean();
    if (user) match.userId = user._id;
  }
  if (filters.projectId) {
    const project = await CoreProject.findOne({ legacyId: Number(filters.projectId) }, { _id: 1 }).lean();
    if (project) match.projectId = project._id;
  }
  if (filters.weekStart) {
    const weekStart = new Date(`${filters.weekStart}T00:00:00.000Z`);
    const week = await TimeWeek.findOne({ weekStartDate: weekStart }, { _id: 1 }).lean();
    if (!week) return [];
    match.weekId = week._id;
  }
  if (filters.status) {
    const weeks = await TimeWeek.find({ status: filters.status }, { _id: 1 }).lean();
    match.weekId = { $in: weeks.map((w) => w._id) };
  }
  const rows = await TimeEntry.find(match)
    .populate('weekId')
    .populate('userId')
    .populate('projectId')
    .populate('activityCategoryId')
    .populate('budgetId')
    .sort({ entryDate: 1 })
    .lean();
  return rows.map((row) => ({
    ...serializeEntry(row),
    week_start_date: row.weekId?.weekStartDate ? toDateOnly(row.weekId.weekStartDate) : null,
    week_end_date: row.weekId?.weekEndDate ? toDateOnly(row.weekId.weekEndDate) : null,
    week_status: row.weekId?.status,
    first_name: row.userId?.firstName,
    last_name: row.userId?.lastName,
    email: row.userId?.email,
  }));
}

async function approveWeek(actorId, weekId) {
  const legacy = parseLegacyWeekId(weekId);
  if (legacy) {
    const user = await CoreUser.findOne({ legacyId: legacy.userLegacyId }, { _id: 1 }).lean();
    if (!user) throw serviceError('User not found', 404);
    const weekEnd = new Date(legacy.weekStart);
    weekEnd.setUTCDate(weekEnd.getUTCDate() + 6);
    const result = await WorkingHours.updateMany(
      { userId: user._id, isDeleted: false, submit: true, weekEnding: { $gte: legacy.weekStart, $lte: new Date(weekEnd.getTime() + 86400000) } },
      { $set: { verified: true, approvedDate: new Date() } }
    );
    if (!result.modifiedCount) throw serviceError('Only submitted weeks can be approved', 409);
    return { id: weekId, status: 'approved', approved_by: actorId, userObjectId: user._id };
  }
  const result = await TimeWeek.updateOne({ legacyId: Number(weekId), status: 'submitted' }, { $set: { status: 'approved', approvedBy: actorId, approvedAt: new Date(), rejectionReason: null } });
  if (!result.modifiedCount) throw serviceError('Only submitted weeks can be approved', 409);
  const week = await TimeWeek.findOne({ legacyId: Number(weekId) }, { _id: 1, userId: 1 }).lean();
  if (week) await TimeEntry.updateMany({ weekId: week._id }, { $set: { status: 'approved' } });
  return { id: Number(weekId), status: 'approved', userObjectId: week?.userId || null };
}

async function rejectWeek(actorId, weekId, reason = '') {
  const legacy = parseLegacyWeekId(weekId);
  if (legacy) {
    const user = await CoreUser.findOne({ legacyId: legacy.userLegacyId }, { _id: 1 }).lean();
    if (!user) throw serviceError('User not found', 404);
    const weekEnd = new Date(legacy.weekStart);
    weekEnd.setUTCDate(weekEnd.getUTCDate() + 6);
    const result = await WorkingHours.updateMany(
      { userId: user._id, isDeleted: false, submit: true, weekEnding: { $gte: legacy.weekStart, $lte: new Date(weekEnd.getTime() + 86400000) } },
      { $set: { verified: false, submit: false, approvedDate: null } }
    );
    if (!result.modifiedCount) throw serviceError('Only submitted weeks can be rejected', 409);
    return { id: weekId, status: 'rejected', rejection_reason: reason, rejected_by: actorId, userObjectId: user._id };
  }
  const result = await TimeWeek.updateOne({ legacyId: Number(weekId), status: 'submitted' }, { $set: { status: 'rejected', submittedAt: null, approvedBy: actorId, approvedAt: new Date(), rejectionReason: reason } });
  if (!result.modifiedCount) throw serviceError('Only submitted weeks can be rejected', 409);
  const week = await TimeWeek.findOne({ legacyId: Number(weekId) }, { _id: 1, userId: 1 }).lean();
  if (week) await TimeEntry.updateMany({ weekId: week._id }, { $set: { status: 'draft' } });
  return { id: Number(weekId), status: 'rejected', rejection_reason: reason, userObjectId: week?.userId || null };
}

async function getOrphanedTimers() {
  const cutoff = new Date(Date.now() - 16 * 60 * 60000);
  const rows = await ActiveTimer.find({ isRunning: true, startTime: { $lt: cutoff } }).populate('userId').populate('projectId').sort({ startTime: 1 }).lean();
  return rows.map((row) => ({
    id: row.legacyId,
    user_id: row.userId?.legacyId,
    project_id: row.projectId?.legacyId,
    start_time: row.startTime,
    is_running: row.isRunning,
    running_minutes: minutesBetween(row.startTime, new Date()),
    user_email: row.userId?.email,
    project_name: row.projectId?.title,
  }));
}

async function adminForceStopTimer(timerId) {
  const result = await ActiveTimer.updateOne({ legacyId: Number(timerId), isRunning: true }, { $set: { isRunning: false } });
  if (!result.modifiedCount) throw serviceError('Timer not found or already stopped', 404);
  return { id: Number(timerId), stopped: true };
}

async function getUserWeeks(userId) {
  const [user, timeWeeks, legacyGroups] = await Promise.all([
    CoreUser.findOne({ _id: userId }, { legacyId: 1 }).lean(),
    TimeWeek.find({ userId }).sort({ weekStartDate: -1 }).lean(),
    WorkingHours.aggregate([
      { $match: { userId, isDeleted: false } },
      {
        $group: {
          _id: '$weekEnding',
          total_hours: { $sum: '$total' },
          submit: { $max: { $cond: [{ $eq: ['$submit', true] }, 1, 0] } },
          verified: { $max: { $cond: [{ $eq: ['$verified', true] }, 1, 0] } },
        },
      },
      { $sort: { _id: -1 } },
    ]),
  ]);

  // Avoid returning a legacy week that already has a TimeWeek record for the same range
  const knownStarts = new Set(timeWeeks.map((w) => toDateOnly(w.weekStartDate)));

  const legacyWeeks = legacyGroups
    .filter((row) => row._id)
    .map((row) => {
      const weekEnd = new Date(row._id);
      const weekStart = new Date(weekEnd);
      weekStart.setUTCDate(weekStart.getUTCDate() - 6);
      return {
        id: legacyWeekId(user?.legacyId || 0, weekStart),
        user_id: user?.legacyId || null,
        week_start_date: toDateOnly(weekStart),
        week_end_date: toDateOnly(weekEnd),
        total_minutes: Math.round((row.total_hours || 0) * 60),
        status: row.verified ? 'approved' : row.submit ? 'submitted' : 'draft',
        source: 'legacy',
      };
    })
    .filter((w) => !knownStarts.has(w.week_start_date));

  return [
    ...timeWeeks.map(serializeWeek),
    ...legacyWeeks,
  ].sort((a, b) => (b.week_start_date || '').localeCompare(a.week_start_date || ''));
}

async function getProjectTimeSummary(userId, projectId, { startDate, endDate } = {}) {
  const project = await CoreProject.findOne({ legacyId: Number(projectId) }, { _id: 1 }).lean();
  if (!project) return { totalHours: 0, totalMinutes: 0, weeks: [] };
  const query = { userId, projectId: project._id };
  if (startDate || endDate) {
    query.entryDate = {};
    if (startDate) query.entryDate.$gte = toUTCDate(startDate);
    if (endDate) query.entryDate.$lte = toUTCDate(endDate);
  }
  const entries = await TimeEntry.find(query).populate('weekId', 'weekStartDate weekEndDate status').lean();
  const weekMap = {};
  for (const entry of entries) {
    const key = String(entry.weekId?._id || 'no-week');
    if (!weekMap[key]) weekMap[key] = { week: entry.weekId, totalMinutes: 0 };
    weekMap[key].totalMinutes += Number(entry.durationMinutes || 0);
  }
  const weeks = Object.values(weekMap).map((w) => ({
    week_start_date: w.week?.weekStartDate ? toDateOnly(w.week.weekStartDate) : null,
    week_end_date: w.week?.weekEndDate ? toDateOnly(w.week.weekEndDate) : null,
    week_ending: w.week?.weekEndDate ? toDateOnly(w.week.weekEndDate) : null,
    total_minutes: w.totalMinutes,
    total_hours: w.totalMinutes / 60,
    status: w.week?.status || 'draft',
    submit: ['submitted', 'approved'].includes(w.week?.status),
    verified: w.week?.status === 'approved',
    approved: w.week?.status === 'approved',
  }));
  const totalMinutes = entries.reduce((s, e) => s + Number(e.durationMinutes || 0), 0);
  return { totalHours: totalMinutes / 60, totalMinutes, weeks };
}

async function getProjectWeekEntries(userId, projectId, weekEnding) {
  const project = await CoreProject.findOne({ legacyId: Number(projectId) }, { _id: 1 }).lean();
  if (!project) return [];
  const range = weekRange(weekEnding);
  const week = await TimeWeek.findOne({ userId, weekStartDate: range.start }).lean();
  if (!week) return [];
  const entries = await TimeEntry.find({ userId, projectId: project._id, weekId: week._id })
    .populate('activityCategoryId', 'name legacyId')
    .populate('budgetId', 'name legacyId')
    .sort({ entryDate: 1 })
    .lean();
  return entries.map(serializeEntry);
}

async function getAdminWeeks({ userId, status } = {}) {
  const query = {};
  let selectedUser = null;
  if (userId) {
    const user = await CoreUser.findOne({ legacyId: Number(userId) }, { _id: 1 }).lean();
    if (!user) return [];
    selectedUser = user;
    query.userId = user._id;
  }
  if (status) {
    const statuses = String(status)
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean);
    if (statuses.length === 1) query.status = statuses[0];
    if (statuses.length > 1) query.status = { $in: statuses };
  }
  const [weeks, legacyGroups] = await Promise.all([
    TimeWeek.find(query)
    .populate('userId', 'legacyId firstName lastName email')
    .sort({ weekStartDate: -1 })
    .lean(),
    WorkingHours.aggregate([
      {
        $match: {
          isDeleted: false,
          ...(selectedUser ? { userId: selectedUser._id } : {}),
        },
      },
      {
        $group: {
          _id: { userId: '$userId', weekEnding: '$weekEnding' },
          totalHours: { $sum: '$total' },
          submit: { $max: { $cond: [{ $eq: ['$submit', true] }, 1, 0] } },
          verified: { $max: { $cond: [{ $eq: ['$verified', true] }, 1, 0] } },
        },
      },
      { $sort: { '_id.weekEnding': -1 } },
    ]),
  ]);

  const knownWeeks = new Set(weeks.map((w) => `${String(w.userId?._id || w.userId)}:${toDateOnly(w.weekStartDate)}`));
  const legacyUserIds = [...new Set(legacyGroups.map((row) => String(row._id.userId)).filter(Boolean))];
  const legacyUsers = legacyUserIds.length
    ? await CoreUser.find({ _id: { $in: legacyUserIds } }, { legacyId: 1, firstName: 1, lastName: 1, email: 1 }).lean()
    : [];
  const legacyUserById = new Map(legacyUsers.map((user) => [String(user._id), user]));

  const timeWeeks = weeks.map((w) => ({
    ...serializeWeek(w),
    user_legacy_id: w.userId?.legacyId,
    first_name: w.userId?.firstName,
    last_name: w.userId?.lastName,
    email: w.userId?.email,
  }));

  const legacyWeeks = legacyGroups
    .map((row) => {
      const weekEnding = row._id.weekEnding ? new Date(row._id.weekEnding) : null;
      const user = legacyUserById.get(String(row._id.userId));
      if (!weekEnding || !user) return null;
      const weekStart = new Date(weekEnding);
      weekStart.setUTCDate(weekStart.getUTCDate() - 6);
      const statusValue = row.verified ? 'approved' : row.submit ? 'submitted' : 'draft';
      if (!statusMatches(statusValue, status)) return null;
      if (knownWeeks.has(`${String(row._id.userId)}:${toDateOnly(weekStart)}`)) return null;
      return {
        id: legacyWeekId(user.legacyId, weekStart),
        user_id: user.legacyId,
        user_legacy_id: user.legacyId,
        week_start_date: toDateOnly(weekStart),
        week_end_date: toDateOnly(weekEnding),
        total_minutes: Math.round(Number(row.totalHours || 0) * 60),
        status: statusValue,
        first_name: user.firstName,
        last_name: user.lastName,
        email: user.email,
        source: 'legacy',
      };
    })
    .filter(Boolean);

  return [...timeWeeks, ...legacyWeeks].sort((a, b) => (b.week_start_date || '').localeCompare(a.week_start_date || ''));
}

async function getAdminWeek(targetLegacyUserId, dateInput) {
  const user = await CoreUser.findOne({ legacyId: Number(targetLegacyUserId) }, { _id: 1, legacyId: 1, firstName: 1, lastName: 1, email: 1 }).lean();
  if (!user) throw serviceError('User not found', 404);
  const range = weekRange(dateInput);
  const [week, legacyRows] = await Promise.all([
    TimeWeek.findOne({ userId: user._id, weekStartDate: range.start }).lean(),
    WorkingHours.find({
      userId: user._id,
      isDeleted: false,
      weekEnding: { $gte: range.start, $lte: new Date(range.end.getTime() + 86400001) },
    })
      .populate('projectId', 'legacyId title')
      .lean(),
  ]);
  if (!week && !legacyRows.length) return { week: null, entries: [] };
  const entries = week ? await TimeEntry.find({ userId: user._id, weekId: week._id })
    .populate('projectId').populate('activityCategoryId').populate('budgetId')
    .sort({ entryDate: 1, legacyId: 1 })
    .lean() : [];
  const legacyEntries = buildLegacyEntries(legacyRows, range.start);
  const newMinutes = entries.reduce((sum, entry) => sum + Number(entry.durationMinutes || 0), 0);
  const legacyMinutes = legacyEntries.reduce((sum, entry) => sum + Number(entry.duration_minutes || 0), 0);
  const legacyStatus = legacyRows.some((row) => row.verified) ? 'approved' : legacyRows.some((row) => row.submit) ? 'submitted' : 'draft';
  return {
    week: {
      ...(week ? serializeWeek({ ...week, userId: user }) : {
        id: legacyWeekId(user.legacyId, range.start),
        user_id: user.legacyId,
        week_start_date: range.startStr,
        week_end_date: range.endStr,
        total_minutes: legacyMinutes,
        status: legacyStatus,
        source: 'legacy',
      }),
      user_legacy_id: user.legacyId,
      first_name: user.firstName,
      last_name: user.lastName,
      email: user.email,
      total_minutes: newMinutes + legacyMinutes,
    },
    entries: [...entries.map(serializeEntry), ...legacyEntries],
  };
}

module.exports = {
  getActivityCategories,
  getWeek,
  createEntry,
  updateEntry,
  deleteEntry,
  submitWeek,
  unsubmitWeek,
  getActiveTimer,
  startTimer,
  pauseTimer,
  resumeTimer,
  stopTimer,
  getTeamTimesheet,
  approveWeek,
  rejectWeek,
  getOrphanedTimers,
  adminForceStopTimer,
  getUserWeeks,
  getProjectTimeSummary,
  getProjectWeekEntries,
  getAdminWeeks,
  getAdminWeek,
  resolveRefs,
  getOrCreateWeek,
  assertWeekEditable,
  recalculateWeek,
  assertNoOverlap,
  assertNoActiveTimerInWeek,
  assertProjectWritableForUser,
  serializeWeek,
  serializeEntry,
  serializeTimer,
  weekRange,
  toUTCDate,
  toDateOnly,
  minutesBetween,
  normalizeTimeRange,
  labelMinutes,
  nextLegacyId,
};
