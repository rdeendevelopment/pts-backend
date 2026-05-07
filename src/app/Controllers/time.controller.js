const timeService = require('../Services/time.service');
const { CoreUser, AccountAdmin } = require('../MongoModels');
const { createSystemNotification, createNotificationsForMany } = require('../Services/task-system/notification.service');

function userId(req) {
  return req.user?._id || req.auth?.user?._id;
}

function handleError(res, error) {
  const body = { success: false, message: error.message || 'Internal server error' };
  if (error.data) body.data = error.data;
  return res.status(error.status || 500).json(body);
}

async function accountName(account) {
  if (!account) return '';
  return account.name || [account.firstName, account.lastName].filter(Boolean).join(' ') || account.email || '';
}

async function notifyTimesheetSubmitted(actorId, week) {
  const [actor, admins] = await Promise.all([
    CoreUser.findById(actorId).lean(),
    AccountAdmin.find({ isDeleted: false, isActive: true }, { _id: 1 }).lean(),
  ]);
  const actorLabel = await accountName(actor) || 'A team member';
  await createNotificationsForMany(admins.map((admin) => admin._id), {
    type: 'timesheet_submitted',
    triggeredBy: actor?._id || actorId,
    triggeredByName: actorLabel,
    message: `${actorLabel} submitted a timesheet`,
    link: '/activity/view-timesheet',
    taskTitle: 'Timesheet submitted',
  });
}

async function notifyTimesheetApproved(actorId, week) {
  if (!week?.userObjectId) return;
  const actor = await AccountAdmin.findById(actorId).lean() || await CoreUser.findById(actorId).lean();
  const actorLabel = await accountName(actor) || 'Admin';
  await createSystemNotification({
    userId: week.userObjectId,
    type: week.status === 'rejected' ? 'timesheet_rejected' : 'timesheet_approved',
    triggeredBy: actor?._id || actorId,
    triggeredByName: actorLabel,
    message: week.status === 'rejected' ? 'Your timesheet was rejected' : 'Your timesheet was approved',
    link: '/user/time-tracking',
    taskTitle: week.status === 'rejected' ? 'Timesheet rejected' : 'Timesheet approved',
  });
}

exports.getActivityCategories = async (req, res) => {
  try {
    const data = await timeService.getActivityCategories();
    return res.json({ success: true, data });
  } catch (error) {
    return handleError(res, error);
  }
};

exports.getWeek = async (req, res) => {
  try {
    const data = await timeService.getWeek(userId(req), req.query.date || new Date());
    return res.json({ success: true, data });
  } catch (error) {
    return handleError(res, error);
  }
};

exports.getUserWeeks = async (req, res) => {
  try {
    const data = await timeService.getUserWeeks(userId(req));
    return res.json({ success: true, data });
  } catch (error) {
    return handleError(res, error);
  }
};

exports.createEntry = async (req, res) => {
  try {
    const data = await timeService.createEntry(userId(req), req.body);
    return res.status(201).json({ success: true, data });
  } catch (error) {
    return handleError(res, error);
  }
};

exports.updateEntry = async (req, res) => {
  try {
    const data = await timeService.updateEntry(userId(req), req.params.id, req.body);
    return res.json({ success: true, data });
  } catch (error) {
    return handleError(res, error);
  }
};

exports.deleteEntry = async (req, res) => {
  try {
    const data = await timeService.deleteEntry(userId(req), req.params.id);
    return res.json({ success: true, data });
  } catch (error) {
    return handleError(res, error);
  }
};

exports.submitWeek = async (req, res) => {
  try {
    const data = await timeService.submitWeek(userId(req), req.body.date || new Date());
    notifyTimesheetSubmitted(userId(req), data).catch((error) => console.error('Timesheet notification failed:', error));
    return res.json({ success: true, data });
  } catch (error) {
    return handleError(res, error);
  }
};

exports.unsubmitWeek = async (req, res) => {
  try {
    const data = await timeService.unsubmitWeek(userId(req), req.body.date || new Date());
    return res.json({ success: true, data });
  } catch (error) {
    return handleError(res, error);
  }
};

exports.getActiveTimer = async (req, res) => {
  try {
    const data = await timeService.getActiveTimer(userId(req));
    return res.json({ success: true, data });
  } catch (error) {
    return handleError(res, error);
  }
};

exports.startTimer = async (req, res) => {
  try {
    const data = await timeService.startTimer(userId(req), req.body);
    return res.status(201).json({ success: true, data });
  } catch (error) {
    return handleError(res, error);
  }
};

exports.stopTimer = async (req, res) => {
  try {
    const data = await timeService.stopTimer(userId(req), req.body);
    return res.json({ success: true, data });
  } catch (error) {
    return handleError(res, error);
  }
};

exports.getTeam = async (req, res) => {
  try {
    const includeAll = req.auth?.permissions?.includes('time.view_all');
    const data = await timeService.getTeamTimesheet({
      ...req.query,
      includeAll,
      managerId: includeAll ? null : userId(req),
    });
    return res.json({ success: true, data });
  } catch (error) {
    return handleError(res, error);
  }
};

exports.approveWeek = async (req, res) => {
  try {
    const data = await timeService.approveWeek(userId(req), req.params.id);
    notifyTimesheetApproved(userId(req), data).catch((error) => console.error('Timesheet notification failed:', error));
    return res.json({ success: true, data });
  } catch (error) {
    return handleError(res, error);
  }
};

exports.rejectWeek = async (req, res) => {
  try {
    const data = await timeService.rejectWeek(userId(req), req.params.id, req.body.reason || '');
    notifyTimesheetApproved(userId(req), data).catch((error) => console.error('Timesheet notification failed:', error));
    return res.json({ success: true, data });
  } catch (error) {
    return handleError(res, error);
  }
};

exports.getProjectTimeSummary = async (req, res) => {
  try {
    const data = await timeService.getProjectTimeSummary(userId(req), req.params.projectId, req.query);
    return res.json({ success: true, ...data });
  } catch (error) {
    return handleError(res, error);
  }
};

exports.getProjectWeekEntries = async (req, res) => {
  try {
    const data = await timeService.getProjectWeekEntries(userId(req), req.params.projectId, req.query.weekEnding || new Date());
    return res.json({ success: true, data });
  } catch (error) {
    return handleError(res, error);
  }
};

exports.getAdminWeeks = async (req, res) => {
  try {
    const data = await timeService.getAdminWeeks({ userId: req.query.userId, status: req.query.status });
    return res.json({ success: true, data });
  } catch (error) {
    return handleError(res, error);
  }
};

exports.getAdminWeek = async (req, res) => {
  try {
    const data = await timeService.getAdminWeek(req.query.userId, req.query.date || new Date());
    return res.json({ success: true, data });
  } catch (error) {
    return handleError(res, error);
  }
};

exports.getOrphanedTimers = async (req, res) => {
  try {
    const data = await timeService.getOrphanedTimers();
    return res.json({ success: true, data });
  } catch (error) {
    return handleError(res, error);
  }
};

exports.adminForceStopTimer = async (req, res) => {
  try {
    const data = await timeService.adminForceStopTimer(req.params.id);
    return res.json({ success: true, data });
  } catch (error) {
    return handleError(res, error);
  }
};

exports.notifyMissingWeek = async (req, res) => {
  try {
    const { userId: targetUserId, weekStartDate } = req.body;
    if (!targetUserId || !weekStartDate) {
      return res.status(400).json({ success: false, message: 'userId and weekStartDate are required' });
    }
    const targetUser = await CoreUser.findOne({ legacyId: Number(targetUserId) }).lean()
      || await CoreUser.findById(String(targetUserId)).lean().catch(() => null);
    if (!targetUser) return res.status(404).json({ success: false, message: 'User not found' });
    const actorId = userId(req);
    const actor = await AccountAdmin.findById(actorId).lean() || await CoreUser.findById(actorId).lean();
    const actorLabel = await accountName(actor) || 'Admin';
    const weekDate = new Date(weekStartDate);
    const weekLabel = weekDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
    await createSystemNotification({
      userId: targetUser._id,
      type: 'timesheet_reminder',
      triggeredBy: actorId,
      triggeredByName: actorLabel,
      message: `Reminder: Your timesheet for the week of ${weekLabel} has not been submitted. Please log and submit your time.`,
      link: '/user/time-tracking',
      taskTitle: 'Timesheet reminder',
    });
    return res.json({ success: true, message: 'Reminder sent' });
  } catch (error) {
    return handleError(res, error);
  }
};
