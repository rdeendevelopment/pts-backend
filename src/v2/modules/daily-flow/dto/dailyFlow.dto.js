function toDayDto(doc) {
  if (!doc) return null;
  const row = doc.toObject ? doc.toObject() : doc;

  return {
    id: String(row._id),
    account_id: String(row.accountId),
    user_id: row.userId ? String(row.userId) : null,
    day_key: row.dayKey,
    timezone: row.timezone,
    status: row.status,
    mood_morning: row.moodMorning ?? null,
    mood_evening: row.moodEvening ?? null,
    energy_morning: row.energyMorning ?? null,
    energy_evening: row.energyEvening ?? null,
    mood_morning_note: row.moodMorningNote || null,
    mood_evening_note: row.moodEveningNote || null,
    notes: row.notes || null,
    created_at: row.createdAt || null,
    updated_at: row.updatedAt || null,
  };
}

function toGoalDto(doc) {
  if (!doc) return null;
  const row = doc.toObject ? doc.toObject() : doc;

  return {
    id: String(row._id),
    account_id: String(row.accountId),
    user_id: row.userId ? String(row.userId) : null,
    day_id: row.dayId ? String(row.dayId) : null,
    day_key: row.dayKey,
    due_date: row.dueDate || null,
    goal_type: row.type,
    type: row.type,
    title: row.title,
    description: row.description || null,
    category: row.category || null,
    target_value: row.targetValue ?? null,
    current_value: row.currentValue ?? 0,
    unit: row.unit || null,
    visibility: row.visibility || 'private',
    source_type: row.sourceType || 'manual',
    source_id: row.sourceId ? String(row.sourceId) : null,
    linked_task_id: row.linkedTaskId
      ? String(row.linkedTaskId)
      : (row.sourceType === 'task' && row.sourceId ? String(row.sourceId) : null),
    sync_task_status: Boolean(row.syncTaskStatus),
    status: row.status,
    is_private: Boolean(row.isPrivate),
    sort_order: row.sortOrder ?? 0,
    completed_at: row.completedAt || null,
    created_at: row.createdAt || null,
    updated_at: row.updatedAt || null,
  };
}

function toCatchupDto(doc) {
  if (!doc) return null;
  const row = doc.toObject ? doc.toObject() : doc;

  return {
    id: String(row._id),
    account_id: String(row.accountId),
    user_id: row.userId ? String(row.userId) : null,
    day_id: row.dayId ? String(row.dayId) : null,
    day_key: row.dayKey,
    type: row.type,
    title: row.title,
    description: row.description || null,
    priority: row.priority || 'medium',
    due_date: row.dueDate || null,
    linked_project_id: row.linkedProjectId ? String(row.linkedProjectId) : null,
    linked_task_id: row.linkedTaskId ? String(row.linkedTaskId) : null,
    status: row.status,
    with_account_id: row.withAccountId ? String(row.withAccountId) : null,
    resolved_at: row.resolvedAt || null,
    created_at: row.createdAt || null,
    updated_at: row.updatedAt || null,
  };
}

function toReflectionDto(doc) {
  if (!doc) return null;
  const row = doc.toObject ? doc.toObject() : doc;

  return {
    id: String(row._id),
    account_id: String(row.accountId),
    user_id: row.userId ? String(row.userId) : null,
    day_id: row.dayId ? String(row.dayId) : null,
    day_key: row.dayKey,
    biggest_win: row.biggestWin || null,
    blockers: row.blockers || null,
    learnings: row.learnings || null,
    tomorrow_plan: row.tomorrowPlan || null,
    mood: row.mood ?? null,
    energy: row.energy ?? null,
    created_at: row.createdAt || null,
    updated_at: row.updatedAt || null,
  };
}

function toRewardDto(doc) {
  if (!doc) return null;
  const row = doc.toObject ? doc.toObject() : doc;

  return {
    id: String(row._id),
    account_id: String(row.accountId),
    user_id: row.userId ? String(row.userId) : null,
    day_id: row.dayId ? String(row.dayId) : null,
    day_key: row.dayKey,
    type: row.type,
    rule_key: row.ruleKey,
    label: row.label || null,
    description: row.description || null,
    status: row.status,
    earned_at: row.earnedAt || null,
    created_at: row.createdAt || null,
    updated_at: row.updatedAt || null,
  };
}

function toSettingsDto(doc, defaults = {}) {
  if (!doc) {
    return {
      account_id: defaults.account_id || null,
      timezone: defaults.timezone || 'UTC',
      enable_daily_flow: defaults.enable_daily_flow ?? true,
      weekend_planning_enabled: defaults.weekend_planning_enabled ?? true,
      share_work_goals_with_admin: defaults.share_work_goals_with_admin ?? false,
      share_personal_goals_with_admin: defaults.share_personal_goals_with_admin ?? false,
      personal_goals_private: defaults.personal_goals_private ?? true,
      allow_reward_eligibility: defaults.allow_reward_eligibility ?? true,
      enable_ai_companion: defaults.enable_ai_companion ?? true,
      allow_ai_task_recommendations: defaults.allow_ai_task_recommendations ?? true,
      allow_ai_end_day_summary: defaults.allow_ai_end_day_summary ?? true,
    };
  }

  const row = doc.toObject ? doc.toObject() : doc;

  return {
    id: String(row._id),
    account_id: String(row.accountId),
    timezone: row.timezone,
    enable_daily_flow: Boolean(row.enableDailyFlow),
    weekend_planning_enabled: Boolean(row.weekendPlanningEnabled),
    share_work_goals_with_admin: Boolean(row.shareWorkGoalsWithAdmin),
    share_personal_goals_with_admin: Boolean(row.sharePersonalGoalsWithAdmin),
    personal_goals_private: Boolean(row.personalGoalsPrivate),
    allow_reward_eligibility: Boolean(row.allowRewardEligibility),
    enable_ai_companion: row.enableAiCompanion !== undefined ? Boolean(row.enableAiCompanion) : true,
    allow_ai_task_recommendations: row.allowAiTaskRecommendations !== undefined
      ? Boolean(row.allowAiTaskRecommendations)
      : true,
    allow_ai_end_day_summary: row.allowAiEndDaySummary !== undefined
      ? Boolean(row.allowAiEndDaySummary)
      : true,
    created_at: row.createdAt || null,
    updated_at: row.updatedAt || null,
  };
}

function toEndDayReportDto(doc) {
  if (!doc) return null;
  const row = doc.toObject ? doc.toObject() : doc;

  return {
    id: String(row._id),
    account_id: String(row.accountId),
    user_id: row.userId ? String(row.userId) : null,
    day_key: row.dayKey,
    status: row.status,
    submitted_at: row.submittedAt || null,
    completed_work_items: row.completedWorkItems || [],
    completed_linked_tasks: row.completedLinkedTasks || [],
    pending_work_items: row.pendingWorkItems || [],
    blockers: row.blockers || null,
    tomorrow_plan: row.tomorrowPlan || null,
    notes: row.notes || null,
    total_activity_minutes: row.totalActivityMinutes ?? 0,
    personal_goals_count: row.personalGoalsCount ?? 0,
    completed_personal_goals_count: row.completedPersonalGoalsCount ?? 0,
    catchups_summary: row.catchupsSummary || null,
    ai_summary: row.aiSummary || null,
    ai_fallback_used: Boolean(row.aiFallbackUsed),
    has_changes_after_submission: Boolean(row.hasChangesAfterSubmission),
    changed_items_count: row.changedItemsCount ?? 0,
    created_at: row.createdAt || null,
    updated_at: row.updatedAt || null,
  };
}

function toAdminDailyReportDto(doc, user = null, { includeDetails = false } = {}) {
  if (!doc) return null;
  const row = doc.toObject ? doc.toObject() : doc;

  const base = {
    user: user || (row.userId ? { id: String(row.userId) } : null),
    account_id: row.accountId ? String(row.accountId) : null,
    day_key: row.dayKey,
    submitted_at: row.submittedAt || null,
    status: row.status,
    completed_work_items_count: (row.completedWorkItems || []).length,
    completed_linked_tasks_count: (row.completedLinkedTasks || []).length,
    pending_work_items_count: (row.pendingWorkItems || []).length,
    blockers: row.blockers || null,
    tomorrow_plan: row.tomorrowPlan || null,
    total_activity_minutes: row.totalActivityMinutes ?? 0,
    personal_goals_count: row.personalGoalsCount ?? 0,
    completed_personal_goals_count: row.completedPersonalGoalsCount ?? 0,
    catchups_summary: row.catchupsSummary || null,
    ai_summary: row.aiSummary || null,
    personal_goal_titles_included: false,
    has_changes_after_submission: Boolean(row.hasChangesAfterSubmission),
    changed_items_count: row.changedItemsCount ?? 0,
  };

  if (!includeDetails) return base;

  return {
    ...base,
    completed_work_items: row.completedWorkItems || [],
    completed_linked_tasks: row.completedLinkedTasks || [],
    pending_work_items: row.pendingWorkItems || [],
    notes: row.notes || null,
  };
}

function toAiMemorySummaryDto(doc) {
  if (!doc) return null;
  const row = doc.toObject ? doc.toObject() : doc;
  return {
    type: row.type,
    output_text: row.outputText,
    fallback_used: row.fallbackUsed,
    created_at: row.createdAt,
  };
}

module.exports = {
  toDayDto,
  toGoalDto,
  toCatchupDto,
  toReflectionDto,
  toRewardDto,
  toSettingsDto,
  toEndDayReportDto,
  toAdminDailyReportDto,
  toAiMemorySummaryDto,
};
