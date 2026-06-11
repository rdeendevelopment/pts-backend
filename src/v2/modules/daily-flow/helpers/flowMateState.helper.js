const {
  FLOWMATE_MODES,
  FLOWMATE_CELEBRATION_LEVELS,
  FLOWMATE_NUDGE_TYPES,
} = require('../constants/dailyFlow.constants');
const { timeGreeting } = require('./myDayState.helper');

const HIGH_PRIORITIES = new Set(['high', 'urgent', 'medium']);

function toTaskRef(task) {
  if (!task) return null;
  return {
    taskId: String(task.taskId || task.task_id || task._id),
    title: task.title,
    priority: task.priority || 'none',
    status: task.status || 'active',
    reason: task.reason || task.ruleReason || null,
  };
}

function buildTaskActions(task, { alreadyAdded = false } = {}) {
  if (!task) return [];
  const taskId = String(task.taskId || task.task_id || task._id);
  const actions = [
    { type: 'open_task', label: 'Open Task', taskId },
  ];
  if (!alreadyAdded) {
    actions.unshift({ type: 'add_to_today', label: 'Add to Today', taskId });
  }
  return actions;
}

function truncateLines(text, maxLines = 4) {
  const lines = String(text || '').split(/\n+/).map((l) => l.trim()).filter(Boolean);
  return lines.slice(0, maxLines).join('\n');
}

function resolveSemanticMode(context, event) {
  const {
    dayStatus,
    plannedWork = [],
    entityType,
    entity,
    isPersonalGoal,
    isLinkedTask,
    taskPriority,
  } = context;

  const plannedWorkCount = context.plannedWorkCount ?? plannedWork.length;
  const assignedTaskCount = context.assignedTaskCount ?? 0;

  if (dayStatus === 'submitted' || event === 'day_submitted' || event === 'end_day_started') {
    return 'end_day_reporter';
  }

  if (event === 'personal_goal_completed' || (event === 'goal_completed' && isPersonalGoal)) {
    return 'personal_goal_completed';
  }

  if (event === 'task_completed' || (event === 'goal_completed' && isLinkedTask)) {
    if (taskPriority && HIGH_PRIORITIES.has(taskPriority)) {
      return 'important_task_completed';
    }
    return 'work_companion';
  }

  if (event === 'goal_completed') {
    if (isPersonalGoal) return 'personal_goal_completed';
    if (isLinkedTask || HIGH_PRIORITIES.has(taskPriority)) {
      return 'important_task_completed';
    }
    return 'work_companion';
  }

  if (event === 'task_added_to_today') {
    return 'plan_updated';
  }

  if (event === 'goal_reopened' || event === 'task_reopened') {
    return 'work_companion';
  }

  if (event === 'day_opened' || event === 'manual_refresh') {
    const dayState = context.myDayState?.dayState;
    if (dayState === 'submitted') return 'end_day_reporter';
    if (dayState === 'quiet_day') return 'quiet_day';
    if (dayState === 'not_started') return 'morning_planner';
    if (dayState === 'planned' || dayState === 'in_progress') return 'work_companion';
    if (plannedWorkCount === 0 && assignedTaskCount === 0) return 'quiet_day';
    if (plannedWorkCount === 0) return 'morning_planner';
    return 'work_companion';
  }

  return 'work_companion';
}

function celebrationFor(context, mode) {
  if (mode === 'personal_goal_completed') {
    return { enabled: true, level: 'soft', reason: 'Personal goal completed' };
  }
  if (mode === 'important_task_completed') {
    const level = ['high', 'urgent'].includes(context.taskPriority) ? 'strong' : 'soft';
    return { enabled: true, level, reason: 'Meaningful work completed' };
  }
  return { enabled: false, level: 'none', reason: null };
}

function nudgeFor(mode, context) {
  const nudges = {
    morning_planner: { type: 'planning', text: 'Pick one priority and give it a focused block.' },
    plan_updated: { type: 'focus', text: 'Keep today focused — two or three items is plenty.' },
    work_companion: { type: 'focus', text: 'Start with the first pending item on your list.' },
    important_task_completed: { type: 'focus', text: 'Nice progress — consider the next task when you are ready.' },
    personal_goal_completed: { type: 'privacy', text: 'Personal wins stay private unless you choose to share.' },
    end_day_reporter: { type: 'report', text: 'Your personal details remain private in admin reports.' },
    quiet_day: { type: 'break', text: 'A lighter day is fine — add one small goal if you want momentum.' },
    next_task_suggestion: { type: 'focus', text: 'One task at a time keeps the day manageable.' },
    ai_disabled_fallback: { type: 'focus', text: 'FlowMate is in offline mode — suggestions are rule-based.' },
  };
  return nudges[mode] || nudges.work_companion;
}

function buildRuleBasedFlowMateState(context, event) {
  const {
    userName = 'there',
    dayKey,
    assignedTaskCount = 0,
    plannedWork = [],
    pendingWork = [],
    completedWork = [],
    personalGoalsCount = 0,
    personalGoalsCompleted = 0,
    todayItemsCount = 0,
    suggestions = [],
    primaryCandidate,
    nextCandidate,
    entity,
    entityTitle,
    endDayReport,
    taskSync,
    myDayState = {},
    aiDisabled = false,
  } = context;

  const dayState = myDayState.dayState || 'not_started';
  const timeOfDay = myDayState.timeOfDay || 'morning';
  const greeting = timeGreeting(timeOfDay);
  const semanticMode = resolveSemanticMode(context, event);
  const mode = aiDisabled ? 'ai_disabled_fallback' : semanticMode;

  const primary = toTaskRef(primaryCandidate || suggestions[0]);
  const next = toTaskRef(nextCandidate || suggestions[1]);
  const firstPending = pendingWork[0];
  const addedTitle = entityTitle || entity?.title;

  let headline = 'Start with the task that moves the day forward.';
  let message = '';
  const bullets = [];

  if (semanticMode === 'end_day_reporter') {
    if ((event === 'day_opened' || event === 'manual_refresh') && dayState === 'submitted') {
      headline = 'Your day is already submitted.';
      message = `Your day is already submitted, ${userName}.\nHere's your summary. You can review it or prepare tomorrow's plan later.`;
      if (endDayReport?.aiSummary) message += `\n${endDayReport.aiSummary}`;
      bullets.push('Day closed');
      if (endDayReport?.tomorrowPlan) bullets.push('Tomorrow plan saved');
    } else {
      headline = 'Today is wrapped up.';
      const completed = completedWork.length;
      const minutes = endDayReport?.totalActivityMinutes ?? endDayReport?.total_activity_minutes ?? 0;
      message = `Good work, ${userName}. You completed ${completed} work item${completed === 1 ? '' : 's'}`;
      if (minutes > 0) message += ` and logged ${minutes} activity minutes`;
      message += '.';
      if (endDayReport?.blockers) message += ' Blockers noted for follow-up.';
      if (endDayReport?.tomorrowPlan) message += ' Tomorrow\'s plan is saved.';
      message += ' Personal goal details stay private.';
      bullets.push(`${completed} work items completed`);
      if (personalGoalsCount > 0) {
        bullets.push(`${personalGoalsCompleted} of ${personalGoalsCount} personal goals done`);
      }
      if (endDayReport?.tomorrowPlan) bullets.push('Tomorrow plan captured');
    }
  } else if (semanticMode === 'personal_goal_completed') {
    headline = 'Nice personal win.';
    message = `${userName}, you completed a personal goal. Take a moment to appreciate it — no need to rush back to work tasks.`;
    bullets.push('Personal goal completed');
    if (pendingWork.length) bullets.push(`${pendingWork.length} work item${pendingWork.length === 1 ? '' : 's'} still on your list`);
  } else if (semanticMode === 'important_task_completed') {
    headline = 'Strong progress on your priorities.';
    const doneTitle = addedTitle || entity?.title || 'your task';
    message = `${userName}, you finished "${doneTitle}".`;
    if (taskSync?.synced) message += ' Task Board is updated.';
    if (next) message += ` Next up: "${next.title}".`;
    bullets.push(`Completed: ${doneTitle}`);
    if (next) bullets.push(`Next: ${next.title}`);
  } else if (semanticMode === 'plan_updated') {
    headline = 'Plan updated for today.';
    message = `${userName}, "${addedTitle || 'A task'}" is on your list now.`;
    message += ' Avoid overloading the day — two or three focused items works well.';
    if (firstPending) message += ` First pending: "${firstPending.title}".`;
    bullets.push(addedTitle ? `Added: ${addedTitle}` : 'Item added to today');
    bullets.push(`${pendingWork.length} pending item${pendingWork.length === 1 ? '' : 's'} today`);
    if (firstPending) bullets.push(`Start with: ${firstPending.title}`);
  } else if (event === 'goal_reopened' || event === 'task_reopened') {
    headline = 'Item moved back to in progress.';
    const reopenedTitle = addedTitle || entity?.title || firstPending?.title || 'this item';
    if (event === 'task_reopened') {
      message = `${userName}, I moved "${reopenedTitle}" back to in progress because the linked Task Board task was reopened.`;
    } else {
      message = `${userName}, "${reopenedTitle}" is open again on your plan.`;
      if (taskSync?.synced) message += ' Task Board is updated too.';
    }
    if (firstPending && firstPending.title !== reopenedTitle) {
      message += ` Next step when ready: "${firstPending.title}".`;
    } else if (next) {
      message += ` Next step when ready: "${next.title}".`;
    }
    bullets.push(`Reopened: ${reopenedTitle}`);
    if (firstPending) bullets.push(`Pending: ${firstPending.title}`);
  } else if (semanticMode === 'morning_planner' || (event === 'day_opened' && dayState === 'not_started')) {
    headline = 'Start with the task that moves the day forward.';
    if (timeOfDay === 'afternoon' || timeOfDay === 'evening') {
      headline = 'Let\'s start with a focused afternoon plan.';
      message = `${greeting}, ${userName} 👋\nYour day plan has not started yet.\nLet's keep it light and choose the most important 1–2 tasks.`;
      if (assignedTaskCount > 0) {
        message += `\nI checked your Task Board — ${assignedTaskCount} assigned task${assignedTaskCount === 1 ? '' : 's'} available.`;
      }
      if (primary) message += `\nI suggest "${primary.title}" as a strong starting point.`;
    } else {
      message = `${greeting}, ${userName} 👋\nI checked your Task Board.\nYou have ${assignedTaskCount} assigned task${assignedTaskCount === 1 ? '' : 's'}.`;
      message += '\nLet\'s pick 2–3 items and start focused.';
      if (primary) message += `\nTop suggestion: "${primary.title}".`;
    }
    bullets.push(`${assignedTaskCount} assigned tasks`);
    bullets.push(`${suggestions.filter((s) => !s.alreadyAddedToToday && !s.already_added_to_today).length} candidates not yet in today's plan`);
    if (primary) bullets.push(`Top priority: ${primary.title}`);
  } else if (semanticMode === 'work_companion' && dayState === 'planned') {
    headline = 'Welcome back — your plan is ready.';
    message = `Welcome back, ${userName}.\nYour plan is already set with ${todayItemsCount || plannedWork.length} item${(todayItemsCount || plannedWork.length) === 1 ? '' : 's'}.`;
    if (firstPending) {
      message += `\nI suggest continuing with "${firstPending.title}".`;
    }
    bullets.push(`${plannedWork.length} planned items`);
    bullets.push(`${pendingWork.length} pending`);
    if (firstPending) bullets.push(`Next up: ${firstPending.title}`);
  } else if (semanticMode === 'work_companion' && dayState === 'in_progress') {
    headline = 'Welcome back — keep the momentum.';
    const total = todayItemsCount || plannedWork.length;
    message = `Welcome back, ${userName}.\nYou've completed ${completedWork.length} of ${total} item${total === 1 ? '' : 's'} today.`;
    if (firstPending) {
      message += `\nNext best step: "${firstPending.title}".`;
    } else if (primary && !primaryCandidate?.alreadyAddedToToday) {
      message += `\nConsider "${primary.title}" if you want one more win.`;
    }
    bullets.push(`${completedWork.length} completed`);
    bullets.push(`${pendingWork.length} pending`);
    if (firstPending) bullets.push(`Next: ${firstPending.title}`);
  } else if (semanticMode === 'work_companion') {
    headline = 'Here is your plan for today.';
    message = `${userName}, you have ${plannedWork.length} item${plannedWork.length === 1 ? '' : 's'} planned`;
    if (completedWork.length) message += ` and ${completedWork.length} already done`;
    message += '.';
    if (firstPending) message += `\nStart with "${firstPending.title}" when you are ready.`;
    bullets.push(`${plannedWork.length} planned items`);
    bullets.push(`${pendingWork.length} pending`);
    if (firstPending) bullets.push(`First up: ${firstPending.title}`);
  } else if (semanticMode === 'quiet_day' || dayState === 'quiet_day') {
    headline = 'A lighter afternoon — one useful task is enough.';
    message = `It's already ${timeOfDay === 'afternoon' ? 'afternoon' : 'later in the day'} and your My Day plan is empty.\nNo problem — let's pick one useful task and finish the day with progress.`;
    if (primary) message += `\n"${primary.title}" looks like a good single focus.`;
    bullets.push('No items planned yet');
    if (assignedTaskCount > 0) bullets.push(`${assignedTaskCount} tasks on Task Board`);
  }

  message = truncateLines(message, 4);

  let actions = [];
  if (semanticMode === 'morning_planner' || semanticMode === 'next_task_suggestion') {
    actions = buildTaskActions(primary, {
      alreadyAdded: primaryCandidate?.alreadyAddedToToday || primaryCandidate?.already_added_to_today,
    });
  } else if (semanticMode === 'work_companion' && firstPending?.linkedTaskId) {
    actions = [
      { type: 'open_task', label: 'Open Task', taskId: String(firstPending.linkedTaskId) },
    ];
  } else if (semanticMode === 'important_task_completed' && next) {
    actions = buildTaskActions(next, {
      alreadyAdded: nextCandidate?.alreadyAddedToToday || nextCandidate?.already_added_to_today,
    });
  }

  const celebration = celebrationFor(context, semanticMode);
  const nudge = nudgeFor(aiDisabled ? 'ai_disabled_fallback' : semanticMode, context);

  return {
    mode,
    event,
    dayKey,
    dayState,
    timeOfDay,
    headline,
    message,
    bullets: bullets.slice(0, 5),
    primaryTask: primary,
    nextTask: next,
    actions,
    celebration,
    nudge,
    fallbackUsed: true,
    recommendationMode: 'rule_based',
    hasExistingPlan: Boolean(myDayState.hasExistingPlan),
    shouldResumePlan: Boolean(myDayState.shouldResumePlan),
    shouldShowEndDay: Boolean(myDayState.shouldShowEndDay),
  };
}

function parseFlowMateStateJson(content, context, event) {
  try {
    const parsed = JSON.parse(content);
    const base = buildRuleBasedFlowMateState(context, event);

    const mode = FLOWMATE_MODES.includes(parsed.mode) ? parsed.mode : base.mode;
    const celebrationLevel = FLOWMATE_CELEBRATION_LEVELS.includes(parsed.celebration?.level)
      ? parsed.celebration.level
      : base.celebration.level;
    const nudgeType = FLOWMATE_NUDGE_TYPES.includes(parsed.nudge?.type)
      ? parsed.nudge.type
      : base.nudge.type;

    return {
      mode,
      event: parsed.event || event,
      dayKey: context.dayKey,
      dayState: context.myDayState?.dayState || base.dayState,
      timeOfDay: context.myDayState?.timeOfDay || base.timeOfDay,
      headline: String(parsed.headline || base.headline).slice(0, 200),
      message: truncateLines(parsed.message || base.message, 4),
      bullets: Array.isArray(parsed.bullets) ? parsed.bullets.slice(0, 5).map(String) : base.bullets,
      primaryTask: parsed.primaryTask ? toTaskRef(parsed.primaryTask) : base.primaryTask,
      nextTask: parsed.nextTask ? toTaskRef(parsed.nextTask) : base.nextTask,
      actions: Array.isArray(parsed.actions)
        ? parsed.actions.slice(0, 4).map((a) => ({
          type: a.type,
          label: String(a.label || ''),
          taskId: a.taskId ? String(a.taskId) : undefined,
          goalId: a.goalId ? String(a.goalId) : undefined,
        })).filter((a) => a.type)
        : base.actions,
      celebration: {
        enabled: Boolean(parsed.celebration?.enabled ?? base.celebration.enabled),
        level: celebrationLevel,
        reason: parsed.celebration?.reason ?? base.celebration.reason,
      },
      nudge: {
        type: nudgeType,
        text: String(parsed.nudge?.text || base.nudge.text).slice(0, 200),
      },
      fallbackUsed: false,
      recommendationMode: 'openai',
      hasExistingPlan: Boolean(context.myDayState?.hasExistingPlan),
      shouldResumePlan: Boolean(context.myDayState?.shouldResumePlan),
      shouldShowEndDay: Boolean(context.myDayState?.shouldShowEndDay),
    };
  } catch (_err) {
    return null;
  }
}

module.exports = {
  toTaskRef,
  buildTaskActions,
  resolveSemanticMode,
  buildRuleBasedFlowMateState,
  parseFlowMateStateJson,
  truncateLines,
};
