const definitions = [
  ['tasks','assigned','Task assigned',true,'normal'], ['tasks','responsibility_transferred','Responsibility transferred',true,'normal'],
  ['tasks','assignment_removed','Assignment removed',true,'normal'], ['tasks','collaborator_added','Collaborator added',true,'normal'],
  ['tasks','collaborator_changed','Collaborator access changed',true,'normal'], ['tasks','collaborator_removed','Collaborator removed',true,'normal'],
  ['tasks','mentioned','Mentioned',true,'normal'], ['tasks','comment_replied','Comment reply',true,'normal'],
  ['tasks','status_changed','Status changed',true,'normal'], ['tasks','review','Ready for review',true,'high'],
  ['tasks','qa','Ready for QA',true,'high'], ['tasks','blocked','Blocked',true,'high'], ['tasks','unblocked','Unblocked',true,'high'],
  ['tasks','priority_escalated','Priority escalated',true,'high'], ['tasks','due_date_changed','Due date changed',true,'normal'],
  ['tasks','due_today','Due today',false,'high',true], ['tasks','overdue','Overdue',false,'high',true],
  ['tasks','completed','Completed',true,'normal'], ['tasks','reopened','Reopened',true,'normal'],
  ['tasks','archived','Archived',false,'low'], ['tasks','restored','Restored',false,'low'], ['tasks','deleted','Deleted',true,'normal'],
  ['timesheets','submission_reminder','Timesheet submission reminder',true,'normal'],
  ['timesheets','clock_auto_stopped','Clock automatically stopped',true,'high'],
  ['timesheets','submitted','Timesheet submitted',true,'normal'], ['timesheets','approved','Timesheet approved',true,'normal'],
  ['timesheets','rejected','Timesheet rejected',true,'high'], ['timesheets','withdrawn','Timesheet withdrawn',false,'normal'],
  ['projects','user_assigned','User assigned to project',true,'normal'], ['projects','user_removed','User removed from project',true,'normal'],
  ['projects','role_changed','Project role changed',true,'normal'], ['projects','status_changed','Project status changed',true,'normal'],
  ['projects','completed','Project completed',true,'normal'],
  ['converse','direct_message','Direct message',true,'normal'],
  ['converse','mentioned','Converse mention',true,'normal'],
  ['converse','replied','Converse reply',true,'normal'],
];
const EVENTS = definitions.map(([module,event,label,defaultEnabled,priority,scheduled=false]) => ({
  key: `${module}.${event}`, module, event, label,
  description: module === 'timesheets' && event === 'submission_reminder'
    ? 'Notify an employee when they are reminded to submit their timesheet.' : label,
  defaultEnabled, priority, scheduled, configurable: true,
}));
const byKey = new Map(EVENTS.map((event) => [event.key, event]));
const TYPE_TO_KEY = {
  task_primary_assigned:'tasks.assigned', task_responsibility_transferred:'tasks.responsibility_transferred', task_primary_assignment_removed:'tasks.assignment_removed',
  task_collaborator_added:'tasks.collaborator_added', task_collaborator_access_changed:'tasks.collaborator_changed', task_collaborator_removed:'tasks.collaborator_removed',
  task_mentioned:'tasks.mentioned', task_comment_replied:'tasks.comment_replied', task_status_changed:'tasks.status_changed', task_moved_to_review:'tasks.review',
  task_moved_to_qa:'tasks.qa', task_blocked:'tasks.blocked', task_unblocked:'tasks.unblocked', task_priority_escalated:'tasks.priority_escalated',
  task_due_date_changed:'tasks.due_date_changed', task_due_today:'tasks.due_today', task_overdue:'tasks.overdue', task_completed:'tasks.completed',
  task_reopened:'tasks.reopened', task_archived:'tasks.archived', task_restored:'tasks.restored', task_deleted:'tasks.deleted',
  activity_week_submission_reminder:'timesheets.submission_reminder', activity_clock_auto_stopped:'timesheets.clock_auto_stopped', activity_week_submitted:'timesheets.submitted', activity_week_approved:'timesheets.approved', activity_week_rejected:'timesheets.rejected', activity_week_unsubmitted:'timesheets.withdrawn',
  project_user_assigned:'projects.user_assigned', project_user_removed:'projects.user_removed', project_role_changed:'projects.role_changed',
  project_status_changed:'projects.status_changed', project_completed:'projects.completed',
  converse_direct_message:'converse.direct_message', converse_mentioned:'converse.mentioned',
  converse_replied:'converse.replied',
};
function resolveEvent(type, moduleKey = null, eventKey = null) {
  const key = moduleKey && eventKey ? `${moduleKey}.${eventKey}` : TYPE_TO_KEY[type];
  return key ? byKey.get(key) || null : null;
}
module.exports = { EVENTS, byKey, resolveEvent };
