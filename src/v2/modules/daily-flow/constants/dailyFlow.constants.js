const DAILY_FLOW_MODULE_KEY = 'daily_flow';

const DAY_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const DAY_STATUSES = ['draft', 'active', 'completed', 'submitted'];

const AI_MEMORY_TYPES = [
  'welcome',
  'task_recommendation',
  'end_summary',
  'learning_tip',
  'flowmate_state',
  'task_sync',
];

const FLOWMATE_EVENTS = [
  'day_opened',
  'task_added_to_today',
  'goal_completed',
  'goal_reopened',
  'task_completed',
  'task_reopened',
  'personal_goal_completed',
  'end_day_started',
  'day_submitted',
  'manual_refresh',
];

const FLOWMATE_ENTITY_TYPES = ['task', 'goal', 'personal_goal', 'catchup', 'report', 'none'];

const FLOWMATE_MODES = [
  'morning_planner',
  'plan_updated',
  'work_companion',
  'important_task_completed',
  'personal_goal_completed',
  'next_task_suggestion',
  'end_day_reporter',
  'quiet_day',
  'ai_disabled_fallback',
];

const FLOWMATE_ACTION_TYPES = ['add_to_today', 'open_task', 'complete_goal', 'end_day'];

const FLOWMATE_NUDGE_TYPES = ['focus', 'break', 'planning', 'privacy', 'report'];

const FLOWMATE_CELEBRATION_LEVELS = ['none', 'soft', 'strong'];

const QUICK_ADD_TYPES = ['work_goal', 'personal_goal', 'catchup', 'reminder'];

const TASK_PRIORITY_WEIGHTS = {
  urgent: 5,
  high: 4,
  medium: 3,
  low: 2,
  none: 1,
};

const DEFAULT_ENABLE_AI_COMPANION = true;
const DEFAULT_ALLOW_AI_TASK_RECOMMENDATIONS = true;
const DEFAULT_ALLOW_AI_END_DAY_SUMMARY = true;

const GOAL_TYPES = ['work', 'personal'];

const GOAL_STATUSES = ['pending', 'in_progress', 'completed', 'skipped', 'deferred', 'deleted'];

const GOAL_SOURCE_TYPES = ['manual', 'task', 'activity'];

const GOAL_VISIBILITY = ['private', 'admin'];

const CATCHUP_TYPES = [
  'need_to_discuss',
  'need_help',
  'waiting_for',
  'idea',
  'reminder',
];

const CATCHUP_STATUSES = ['open', 'done', 'archived'];

const CATCHUP_PRIORITIES = ['low', 'medium', 'high'];

const MOOD_PERIODS = ['morning', 'evening'];

const REWARD_TYPES = [
  'consistency',
  'goal_completion',
  'team_support',
  'healthy_habit',
  'custom',
];

const REWARD_RULES = [
  '3_day_consistency',
  '5_day_consistency',
  'completed_all_planned_goals',
  'weekend_effort',
  'healthy_habit_completed',
];

const REWARD_STATUSES = ['earned', 'revoked'];

const MOOD_ENERGY_MIN = 1;
const MOOD_ENERGY_MAX = 5;

const DEFAULT_LIST_LIMIT = 20;
const MAX_LIST_LIMIT = 100;

const DEFAULT_DASHBOARD_GOALS_LIMIT = 100;
const DEFAULT_DASHBOARD_CATCHUPS_LIMIT = 100;
const MAX_DASHBOARD_LIMIT = 200;

const DEFAULT_TIMEZONE = 'UTC';

const DEFAULT_ENABLE_DAILY_FLOW = true;
const DEFAULT_WEEKEND_PLANNING_ENABLED = true;
const DEFAULT_SHARE_WORK_GOALS_WITH_ADMIN = false;
const DEFAULT_SHARE_PERSONAL_GOALS_WITH_ADMIN = false;
const DEFAULT_PERSONAL_GOALS_PRIVATE = true;
const DEFAULT_ALLOW_REWARD_ELIGIBILITY = true;

const HEALTHY_HABIT_CATEGORIES = ['healthy_habit', 'health', 'wellness', 'habit'];

module.exports = {
  DAILY_FLOW_MODULE_KEY,
  DAY_KEY_PATTERN,
  DAY_STATUSES,
  AI_MEMORY_TYPES,
  FLOWMATE_EVENTS,
  FLOWMATE_ENTITY_TYPES,
  FLOWMATE_MODES,
  FLOWMATE_ACTION_TYPES,
  FLOWMATE_NUDGE_TYPES,
  FLOWMATE_CELEBRATION_LEVELS,
  QUICK_ADD_TYPES,
  TASK_PRIORITY_WEIGHTS,
  DEFAULT_ENABLE_AI_COMPANION,
  DEFAULT_ALLOW_AI_TASK_RECOMMENDATIONS,
  DEFAULT_ALLOW_AI_END_DAY_SUMMARY,
  GOAL_TYPES,
  GOAL_STATUSES,
  GOAL_SOURCE_TYPES,
  GOAL_VISIBILITY,
  CATCHUP_TYPES,
  CATCHUP_STATUSES,
  CATCHUP_PRIORITIES,
  MOOD_PERIODS,
  REWARD_TYPES,
  REWARD_RULES,
  REWARD_STATUSES,
  MOOD_ENERGY_MIN,
  MOOD_ENERGY_MAX,
  DEFAULT_LIST_LIMIT,
  MAX_LIST_LIMIT,
  DEFAULT_DASHBOARD_GOALS_LIMIT,
  DEFAULT_DASHBOARD_CATCHUPS_LIMIT,
  MAX_DASHBOARD_LIMIT,
  DEFAULT_TIMEZONE,
  DEFAULT_ENABLE_DAILY_FLOW,
  DEFAULT_WEEKEND_PLANNING_ENABLED,
  DEFAULT_SHARE_WORK_GOALS_WITH_ADMIN,
  DEFAULT_SHARE_PERSONAL_GOALS_WITH_ADMIN,
  DEFAULT_PERSONAL_GOALS_PRIVATE,
  DEFAULT_ALLOW_REWARD_ELIGIBILITY,
  HEALTHY_HABIT_CATEGORIES,
};
