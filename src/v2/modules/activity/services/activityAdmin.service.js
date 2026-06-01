const { AppError } = require('../../../kernel/errors');
const { info } = require('../../../kernel/logger');
const { getUserModel } = require('../../users/models/user.model');
const userRepository = require('../../users/repositories/user.repository');
const timeWeekRepository = require('../repositories/timeWeek.repository');
const activityErrorCodes = require('../errors/activityErrorCodes');
const activitySocketEvents = require('../helpers/activitySocketEvents.helper');
const { canViewAllProjectTimeEntries } = require('../helpers/access.helper');
const userSummaryHelper = require('../helpers/userSummary.helper');
const { toTimeWeekDto } = require('../dto/activity.dto');

function parseEndDate(value) {
  const end = new Date(value);
  end.setUTCHours(23, 59, 59, 999);
  return end;
}

function buildWeekFilters(query = {}) {
  const filters = {};
  if (query.userId || query.user_id) filters.userId = query.userId || query.user_id;
  if (query.status && query.status !== 'all') filters.status = query.status;
  if (query.startDate || query.start_date) {
    filters.weekStartDateFrom = new Date(query.startDate || query.start_date);
  }
  if (query.endDate || query.end_date) {
    filters.weekStartDateTo = parseEndDate(query.endDate || query.end_date);
  }
  return filters;
}

function toWorkforceUserRow(userDoc, weekStats = null) {
  const doc = userDoc?.toObject ? userDoc.toObject() : userDoc;
  const firstName = doc?.firstName || '';
  const lastName = doc?.lastName || '';
  const displayName = doc?.displayName
    || [firstName, lastName].filter(Boolean).join(' ').trim()
    || doc?.email
    || null;

  return {
    id: String(doc._id),
    accountId: doc.accountId ? String(doc.accountId) : null,
    displayName,
    firstName,
    lastName,
    email: doc.email || null,
    status: doc.status || 'active',
    jobTitle: doc.jobTitle || null,
    submittedWeeks: weekStats?.submittedWeeks || 0,
    approvedWeeks: weekStats?.approvedWeeks || 0,
    pendingWeeks: weekStats?.pendingWeeks || 0,
    draftWeeks: weekStats?.draftWeeks || 0,
    rejectedWeeks: weekStats?.rejectedWeeks || 0,
    missingWeeks: weekStats?.missingWeeks || 0,
    totalMinutes: weekStats?.totalMinutes || 0,
  };
}

async function getWorkforceSummary(query, req) {
  if (!canViewAllProjectTimeEntries(req)) {
    throw new AppError('Forbidden workforce access', {
      status: 403,
      code: activityErrorCodes.ACTIVITY_FORBIDDEN,
    });
  }

  const weekFilters = buildWeekFilters(query);
  const [weeks, activeUsers] = await Promise.all([
    timeWeekRepository.listWeeks(weekFilters),
    getUserModel().find({ isDeleted: false, status: 'active' })
      .sort({ firstName: 1, lastName: 1 })
      .limit(500)
      .lean(),
  ]);

  const statsByUser = new Map();
  for (const week of weeks) {
    const uid = String(week.userId);
    const row = statsByUser.get(uid) || {
      submittedWeeks: 0,
      approvedWeeks: 0,
      pendingWeeks: 0,
      draftWeeks: 0,
      rejectedWeeks: 0,
      missingWeeks: 0,
      totalMinutes: 0,
    };
    row.totalMinutes += Number(week.totalMinutes || 0);
    if (week.status === 'submitted') {
      row.pendingWeeks += 1;
      row.submittedWeeks += 1;
    } else if (week.status === 'approved') {
      row.approvedWeeks += 1;
      row.submittedWeeks += 1;
    } else if (week.status === 'draft') {
      row.draftWeeks += 1;
    } else if (week.status === 'rejected') {
      row.rejectedWeeks += 1;
    }
    statsByUser.set(uid, row);
  }

  const usersById = new Map(activeUsers.map((user) => [String(user._id), user]));
  for (const uid of statsByUser.keys()) {
    if (!usersById.has(uid)) {
      const user = await userRepository.findById(uid);
      if (user && !user.isDeleted) usersById.set(uid, user);
    }
  }

  const users = [...usersById.values()]
    .map((user) => toWorkforceUserRow(user, statsByUser.get(String(user._id))))
    .sort((a, b) => b.pendingWeeks - a.pendingWeeks
      || b.totalMinutes - a.totalMinutes
      || String(a.displayName || '').localeCompare(String(b.displayName || '')));

  const summary = {
    totalMinutes: weeks.reduce((sum, week) => sum + Number(week.totalMinutes || 0), 0),
    pendingApprovalCount: weeks.filter((week) => week.status === 'submitted').length,
    approvedCount: weeks.filter((week) => week.status === 'approved').length,
    rejectedCount: weeks.filter((week) => week.status === 'rejected').length,
    draftCount: weeks.filter((week) => week.status === 'draft').length,
    weekCount: weeks.length,
    userCount: users.length,
    usersWithActivityCount: users.filter((user) => user.totalMinutes > 0).length,
  };

  const userMap = await userSummaryHelper.resolveUsersByIds(weeks.map((week) => week.userId));
  const weekItems = weeks.map((dto) => {
    const mapped = toTimeWeekDto(dto);
    return {
      ...mapped,
      user: userMap.get(String(mapped.userId)) || null,
    };
  });

  return { users, weeks: weekItems, summary };
}

async function notifyMissingWeek(payload, accountId) {
  const userId = payload.userId || payload.user_id;
  const weekStartDate = payload.weekStartDate || payload.week_start_date;

  if (!userId || !weekStartDate) {
    throw new AppError('userId and weekStartDate are required', {
      status: 400,
      code: activityErrorCodes.ACTIVITY_WEEK_INVALID_STATUS,
    });
  }

  const user = await userRepository.findById(userId);
  if (!user) {
    throw new AppError('User not found', {
      status: 404,
      code: activityErrorCodes.ACTIVITY_USER_NOT_FOUND,
    });
  }

  const week = await timeWeekRepository.findByUserAndWeekStart(userId, weekStartDate);
  if (week && ['submitted', 'approved'].includes(week.status)) {
    throw new AppError('Week is already submitted or approved', {
      status: 409,
      code: activityErrorCodes.ACTIVITY_WEEK_INVALID_STATUS,
      details: { status: week.status },
    });
  }

  const message = payload.message
    || `Reminder: submit your timesheet for the week starting ${String(weekStartDate).slice(0, 10)}.`;

  info('Activity missing week reminder sent', {
    userId: String(user._id),
    weekStartDate: String(weekStartDate).slice(0, 10),
    sentBy: String(accountId),
  });

  activitySocketEvents.emitActivityWeekReminder(String(user._id), {
    userId: String(user._id),
    weekStartDate: String(weekStartDate).slice(0, 10),
    message,
    sentBy: String(accountId),
  });

  return {
    success: true,
    userId: String(user._id),
    weekStartDate: String(weekStartDate).slice(0, 10),
    message,
    delivered: true,
    channel: 'activity.socket',
  };
}

module.exports = {
  getWorkforceSummary,
  notifyMissingWeek,
};
