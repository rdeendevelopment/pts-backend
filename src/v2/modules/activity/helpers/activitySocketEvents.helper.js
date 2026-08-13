const socketService = require('../../socket/services/socket.service');
const { emitBestEffort } = require('../../socket/helpers/socketEmit.helper');
const { SERVER_EVENTS } = require('../../socket/constants/socket.constants');
const { toActiveTimerDto } = require('../dto/activity.dto');

function uniqueProjectIds(projectIds = []) {
  return [...new Set(projectIds.filter(Boolean).map(String))];
}

function buildWeekSubmitPayload(week) {
  if (!week) return null;

  return {
    weekId: String(week.id || week._id),
    userId: String(week.userId),
    weekStartDate: week.weekStartDate,
    weekEndDate: week.weekEndDate,
    totalMinutes: week.totalMinutes,
    totalEntries: week.totalEntries,
    status: week.status,
  };
}

function buildWeekApprovePayload(week) {
  if (!week) return null;

  return {
    weekId: String(week.id || week._id),
    userId: String(week.userId),
    status: week.status,
    approvedBy: week.approvedBy ? String(week.approvedBy) : null,
    approvedAt: week.approvedAt,
    lockedAt: week.lockedAt,
  };
}

function buildWeekRejectPayload(week) {
  if (!week) return null;

  return {
    weekId: String(week.id || week._id),
    userId: String(week.userId),
    status: week.status,
    rejectedBy: week.rejectedBy ? String(week.rejectedBy) : null,
    rejectedAt: week.rejectedAt,
    rejectionReason: week.rejectionReason || null,
  };
}

function buildTimerPayload(timer) {
  const dto = timer?.id ? timer : toActiveTimerDto(timer);
  if (!dto) return null;

  return {
    id: dto.id,
    userId: dto.userId,
    projectId: dto.projectId,
    assignmentId: dto.assignmentId,
    workCategoryId: dto.workCategoryId,
    startedAt: dto.startedAt,
    stoppedAt: dto.stoppedAt,
    status: dto.status,
  };
}

function emitToUserAndProjects(userId, projectIds, eventName, payload) {
  if (!userId || !payload) return;

  emitBestEffort(() => {
    socketService.emitToUser(userId, eventName, payload);

    for (const projectId of uniqueProjectIds(projectIds)) {
      socketService.emitToProject(projectId, eventName, {
        ...payload,
        projectId,
      });
    }
  });
}

function emitActivityWeekSubmitted(week, projectIds = []) {
  const payload = buildWeekSubmitPayload(week);
  if (!payload) return;

  emitToUserAndProjects(
    payload.userId,
    projectIds,
    SERVER_EVENTS.ACTIVITY_WEEK_SUBMITTED,
    payload
  );
}

function emitActivityWeekUnsubmitted(week, projectIds = []) {
  const payload = buildWeekSubmitPayload(week);
  if (!payload) return;
  emitToUserAndProjects(
    payload.userId,
    projectIds,
    SERVER_EVENTS.ACTIVITY_WEEK_UNSUBMITTED,
    payload,
  );
}

function emitActivityWeekApproved(week, projectIds = []) {
  const payload = buildWeekApprovePayload(week);
  if (!payload) return;

  emitToUserAndProjects(
    payload.userId,
    projectIds,
    SERVER_EVENTS.ACTIVITY_WEEK_APPROVED,
    payload
  );
}

function emitActivityWeekRejected(week, projectIds = []) {
  const payload = buildWeekRejectPayload(week);
  if (!payload) return;

  emitToUserAndProjects(
    payload.userId,
    projectIds,
    SERVER_EVENTS.ACTIVITY_WEEK_REJECTED,
    payload
  );
}

function emitActivityEntryCreated(projectId, entry) {
  if (!entry) return;

  emitBestEffort(() => {
    socketService.emitToProject(projectId, SERVER_EVENTS.ACTIVITY_ENTRY_CREATED, {
      projectId: String(projectId),
      entry,
    });
  });
}

function emitActivityTimerStarted(userId, timer) {
  const payload = buildTimerPayload(timer);
  if (!payload) return;

  emitToUserAndProjects(
    userId,
    [payload.projectId],
    SERVER_EVENTS.ACTIVITY_TIMER_STARTED,
    payload
  );
}

function emitActivityTimerStopped(userId, timer) {
  const payload = buildTimerPayload(timer);
  if (!payload) return;

  emitToUserAndProjects(
    userId,
    [payload.projectId],
    SERVER_EVENTS.ACTIVITY_TIMER_STOPPED,
    payload
  );
}

function emitActivityWeekReminder(userId, payload) {
  if (!userId || !payload) return;

  emitBestEffort(() => {
    socketService.emitToUser(userId, SERVER_EVENTS.ACTIVITY_WEEK_REMINDER, payload);
  });
}

module.exports = {
  buildWeekSubmitPayload,
  buildWeekApprovePayload,
  buildWeekRejectPayload,
  buildTimerPayload,
  emitActivityWeekSubmitted,
  emitActivityWeekUnsubmitted,
  emitActivityWeekApproved,
  emitActivityWeekRejected,
  emitActivityEntryCreated,
  emitActivityTimerStarted,
  emitActivityTimerStopped,
  emitActivityWeekReminder,
};
