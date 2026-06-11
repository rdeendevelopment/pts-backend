const SYSTEM_PROMPT = `You are FlowMate AI, a friendly workplace mentor inside the My Day product.
Tone: supportive, clear, professional, never pressuring.
Rules:
- Keep responses short.
- Never compare the user to other employees.
- Never use negative judgement or shame.
- Never mention salary, rewards, or promotions.
- Never include personal goal details.
- Advise and suggest; the user always decides.
- Do not create or modify tasks.`;

function buildWelcomePrompt(context = {}) {
  const {
    userName,
    role,
    assignedTaskCount = 0,
    highPriorityCount = 0,
    overdueCount = 0,
    topPriorityTaskTitle,
    pendingYesterdayCount = 0,
    dayStatus,
  } = context;

  const userMessage = `Generate a morning welcome message (max 80 words) for ${userName || 'the user'}.
Role: ${role || 'employee'}
Today's assigned tasks: ${assignedTaskCount}
High priority: ${highPriorityCount}
Overdue: ${overdueCount}
Pending from yesterday: ${pendingYesterdayCount}
Day status: ${dayStatus || 'active'}
Top priority task: ${topPriorityTaskTitle || 'none'}

Be warm and supportive. Mention the top priority task if available. Suggest focusing on 2-3 items. No pressure.`;

  return {
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userMessage },
    ],
  };
}

function buildTaskRecommendationPrompt(context = {}) {
  const { tasks = [] } = context;

  const taskLines = tasks.map((task, index) => (
    `${index + 1}. [rank ${task.recommendationRank}] "${task.title}" — project: ${task.projectName || 'Unknown'}, `
    + `priority: ${task.priority}, status: ${task.status}, due: ${task.dueDate || 'none'}, `
    + `rule reason: ${task.ruleReason}`
  )).join('\n');

  const userMessage = `Given these pre-ranked assigned tasks, write a short friendly reason (1 sentence each) for the top recommendations.
Return JSON array: [{ "taskId": "...", "reason": "..." }]
Only include tasks from the list. Do not invent tasks.

Tasks:
${taskLines || 'No tasks available.'}`;

  return {
    messages: [
      { role: 'system', content: `${SYSTEM_PROMPT}\nRespond with valid JSON only.` },
      { role: 'user', content: userMessage },
    ],
    responseFormat: { type: 'json_object' },
  };
}

function buildEndDaySummaryPrompt(context = {}) {
  const {
    completedWorkCount = 0,
    completedLinkedTaskCount = 0,
    pendingWorkCount = 0,
    personalGoalsCompleted = 0,
    personalGoalsTotal = 0,
    catchupsOpen = 0,
    blockers,
    tomorrowPlan,
    totalActivityMinutes = 0,
  } = context;

  const userMessage = `Generate an end-of-day summary (max 120 words).
Completed work items: ${completedWorkCount}
Completed linked tasks: ${completedLinkedTaskCount}
Pending work items: ${pendingWorkCount}
Personal goals completed: ${personalGoalsCompleted} of ${personalGoalsTotal} (do not mention titles)
Open catchups: ${catchupsOpen}
Activity minutes logged: ${totalActivityMinutes}
Blockers: ${blockers || 'none'}
Tomorrow plan: ${tomorrowPlan || 'none'}

Be positive, clear, and professional. Acknowledge progress without shaming pending items.`;

  return {
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userMessage },
    ],
  };
}

function buildLearningTipPrompt() {
  return {
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'user',
        content: 'Write one short practical productivity tip (max 30 words) for starting a focused workday. No pressure.',
      },
    ],
  };
}

function buildFlowMateStatePrompt(context = {}) {
  const {
    userName,
    role,
    event,
    dayKey,
    dayStatus,
    plannedWorkTitles = [],
    personalGoalsCount = 0,
    personalGoalsCompleted = 0,
    completedWorkTitles = [],
    pendingWorkTitles = [],
    assignedTaskCount = 0,
    suggestions = [],
    entityTitle,
    entityType,
    endDaySummary,
    taskSync,
    dayState,
    timeOfDay,
    myDayState = {},
  } = context;

  const suggestionLines = suggestions.slice(0, 5).map((t, i) => (
    `${i + 1}. id=${t.taskId || t.task_id} title="${t.title}" priority=${t.priority} `
    + `status=${t.status} reason="${t.reason || t.ruleReason || ''}"`
  )).join('\n');

  const userMessage = `Generate a FlowMate assistant state as strict JSON only.
Event: ${event}
User: ${userName || 'user'}
Role: ${role || 'employee'}
Day: ${dayKey} (status: ${dayStatus || 'active'})
Day state: ${dayState || myDayState.dayState || 'not_started'}
Time of day: ${timeOfDay || myDayState.timeOfDay || 'morning'}
Has existing plan: ${myDayState.hasExistingPlan ? 'yes' : 'no'}
Should resume plan: ${myDayState.shouldResumePlan ? 'yes' : 'no'}
Assigned tasks on Task Board: ${assignedTaskCount}
Planned work today: ${plannedWorkTitles.length ? plannedWorkTitles.join('; ') : 'none'}
Completed work: ${completedWorkTitles.length ? completedWorkTitles.join('; ') : 'none'}
Pending work: ${pendingWorkTitles.length ? pendingWorkTitles.join('; ') : 'none'}
Personal goals: ${personalGoalsCompleted}/${personalGoalsCount} completed (never mention personal goal titles)
Latest entity: ${entityType || 'none'}${entityTitle ? ` "${entityTitle}"` : ''}
Task sync: ${taskSync?.synced ? 'success' : 'n/a'}
End-day summary: ${endDaySummary || 'none'}

Task suggestions:
${suggestionLines || 'none'}

Return JSON with this exact shape:
{
  "mode": "morning_planner|plan_updated|work_companion|important_task_completed|personal_goal_completed|next_task_suggestion|end_day_reporter|quiet_day",
  "event": "${event}",
  "headline": "short headline",
  "message": "max 3-4 lines, task-aware, mention real task titles from context",
  "bullets": ["...", "..."],
  "primaryTask": { "taskId": "...", "title": "...", "priority": "...", "status": "...", "reason": "..." } or null,
  "nextTask": { ... } or null,
  "actions": [{ "type": "add_to_today|open_task", "label": "...", "taskId": "..." }],
  "celebration": { "enabled": false, "level": "none|soft|strong", "reason": null },
  "nudge": { "type": "focus|break|planning|privacy|report", "text": "..." }
}

Rules:
- Use day state and time of day. Never say "Good morning" in afternoon/evening.
- not_started + morning: greet and suggest picking 2-3 tasks from Task Board.
- not_started + afternoon: day not started yet; keep plan light with 1-2 tasks.
- quiet_day: afternoon, empty plan; suggest one useful task gently.
- planned: welcome back; plan already set; suggest next pending item. Do NOT recreate the plan.
- in_progress: welcome back; mention completed vs total; suggest next pending item.
- submitted: day already submitted; show summary tone. Never suggest creating a new plan.
- Do not recommend tasks already in today's plan as "add this".
- no generic quotes, no shame, no employee comparisons, no salary/reward promises, no personal goal titles. Message max 3-4 lines.`;

  return {
    messages: [
      { role: 'system', content: `${SYSTEM_PROMPT}\nRespond with valid JSON only. No markdown.` },
      { role: 'user', content: userMessage },
    ],
    responseFormat: { type: 'json_object' },
  };
}

module.exports = {
  SYSTEM_PROMPT,
  buildWelcomePrompt,
  buildTaskRecommendationPrompt,
  buildEndDaySummaryPrompt,
  buildLearningTipPrompt,
  buildFlowMateStatePrompt,
};
