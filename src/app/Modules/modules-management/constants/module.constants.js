const MODULE_KEYS = {
  TASK_BOARD: 'task_board',
  CONVERSE:   'converse',
  ACTIVITY:   'activity',
  CLOCK:      'clock',
};

const DEFAULT_MODULES = [
  {
    key:              MODULE_KEYS.TASK_BOARD,
    name:             'Task Board',
    description:      'Kanban and list-based task management',
    enabled:          true,
    order:            1,
    icon:             'layout',
    isCore:           true,
    controlledByRole: 'super_admin',
  },
  {
    key:              MODULE_KEYS.CONVERSE,
    name:             'Converse',
    description:      'Team messaging and direct conversations',
    enabled:          true,
    order:            2,
    icon:             'message-circle',
    isCore:           false,
    controlledByRole: 'super_admin',
  },
  {
    key:              MODULE_KEYS.ACTIVITY,
    name:             'Activity',
    description:      'Project and team activity feed',
    enabled:          true,
    order:            3,
    icon:             'activity',
    isCore:           false,
    controlledByRole: 'super_admin',
  },
  {
    key:              MODULE_KEYS.CLOCK,
    name:             'Clock',
    description:      'Time tracking and work hour logging',
    enabled:          true,
    order:            4,
    icon:             'clock',
    isCore:           true,
    controlledByRole: 'super_admin',
  },
];

module.exports = { MODULE_KEYS, DEFAULT_MODULES };
