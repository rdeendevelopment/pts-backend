const { CoreProject, CoreUser, WorkingHours, TimeEntry, TimeWeek } = require('../MongoModels');

async function nextLegacyId(Model) {
  const row = await Model.findOne({}, { legacyId: 1 }).sort({ legacyId: -1 }).lean();
  return Number(row?.legacyId || 0) + 1;
}

async function resolveUser(numericId) {
  return CoreUser.findOne({ legacyId: Number(numericId) }, { _id: 1, legacyId: 1 }).lean();
}

function serialize(row) {
  const item = row?.toObject ? row.toObject() : row;
  return {
    id: item.legacyId,
    project_id: item.projectId?.legacyId ?? null,
    user_id: item.userId?.legacyId ?? null,
    task_id: item.taskId,
    week_ending: item.weekEnding,
    mon: item.mon,
    tue: item.tue,
    wed: item.wed,
    thu: item.thu,
    fri: item.fri,
    sat: item.sat,
    sun: item.sun,
    total: item.total,
    verified: item.verified,
    submit: item.submit,
    approved_date: item.approvedDate,
    is_deleted: item.isDeleted,
    notes: (item.notes || []).map((n) => ({ day_of_week: n.dayOfWeek, note: n.note })),
    project: item.projectId ? { id: item.projectId.legacyId, title: item.projectId.title } : undefined,
  };
}

exports.addWeeklyHours = async (req, res) => {
  try {
    const { weekHours = {}, dailyNotes = [] } = req.body;
    const [project, user] = await Promise.all([
      weekHours.project_id ? CoreProject.findOne({ legacyId: Number(weekHours.project_id) }, { _id: 1 }).lean() : null,
      weekHours.user_id ? resolveUser(weekHours.user_id) : null,
    ]);
    if (!user) return res.status(400).json({ message: 'User not found.' });
    const workingHours = await WorkingHours.create({
      legacyId: await nextLegacyId(WorkingHours),
      projectId: project?._id || null,
      userId: user._id,
      taskId: weekHours.task_id || null,
      weekEnding: weekHours.week_ending ? new Date(weekHours.week_ending) : null,
      mon: weekHours.mon ?? null,
      tue: weekHours.tue ?? null,
      wed: weekHours.wed ?? null,
      thu: weekHours.thu ?? null,
      fri: weekHours.fri ?? null,
      sat: weekHours.sat ?? null,
      sun: weekHours.sun ?? null,
      total: weekHours.total ?? null,
      verified: false,
      submit: false,
      approvedDate: weekHours.approved_date ? new Date(weekHours.approved_date) : null,
      isDeleted: false,
      notes: dailyNotes.map((n) => ({ dayOfWeek: n.day_of_week, note: n.note })),
    });
    const populated = await WorkingHours.findOne({ _id: workingHours._id })
      .populate('projectId', 'legacyId title')
      .lean();
    return res.json({ message: 'Weekly hours added successfully!', data: serialize(populated) });
  } catch (error) {
    return res.status(500).json({ message: 'Internal server error', error: error.message });
  }
};

exports.getWeeklyHours = async (req, res) => {
  try {
    const { weekEnding, userId } = req.query;
    const user = await resolveUser(userId);
    if (!user) return res.json({ data: [] });
    const rows = await WorkingHours.find({
      weekEnding: new Date(weekEnding),
      userId: user._id,
      isDeleted: false,
    }).populate('projectId', 'legacyId title').lean();
    return res.json({ data: rows.map(serialize) });
  } catch (error) {
    return res.status(500).json({ message: 'Internal server error', error: error.message });
  }
};

exports.getUserWeeklyHours = async (req, res) => {
  try {
    const { weekEnding, userId } = req.query;
    if (!weekEnding || !userId) return res.status(400).json({ message: 'Missing weekEnding or userId.' });
    const user = await resolveUser(userId);
    if (!user) return res.json({ success: false, message: 'No data found.' });
    const start = new Date(`${weekEnding}T00:00:00.000Z`);
    const end = new Date(`${weekEnding}T23:59:59.999Z`);
    const rows = await WorkingHours.find({
      userId: user._id,
      isDeleted: false,
      weekEnding: { $gte: start, $lte: end },
    }).populate('projectId', 'legacyId title').lean();
    if (!rows.length) return res.json({ success: false, message: 'No data found.' });
    return res.json({ message: 'Weekly hours fetched.', data: rows.map(serialize) });
  } catch (error) {
    return res.status(500).json({ message: 'Internal server error', error: error.message });
  }
};

exports.updateWeeklyHours = async (req, res) => {
  try {
    const { id } = req.params;
    const { weekHours = {}, dailyNotes = [] } = req.body;
    const workingHours = await WorkingHours.findOne({ legacyId: Number(id), isDeleted: false });
    if (!workingHours) return res.status(404).json({ message: 'Working hours not found.' });
    Object.assign(workingHours, {
      mon: weekHours.mon ?? workingHours.mon,
      tue: weekHours.tue ?? workingHours.tue,
      wed: weekHours.wed ?? workingHours.wed,
      thu: weekHours.thu ?? workingHours.thu,
      fri: weekHours.fri ?? workingHours.fri,
      sat: weekHours.sat ?? workingHours.sat,
      sun: weekHours.sun ?? workingHours.sun,
      total: weekHours.total ?? workingHours.total,
      verified: weekHours.verified ?? workingHours.verified,
      submit: weekHours.submit ?? workingHours.submit,
    });
    for (const n of dailyNotes) {
      const existing = workingHours.notes.find((note) => note.dayOfWeek === n.day_of_week);
      if (existing) { existing.note = n.note; } else { workingHours.notes.push({ dayOfWeek: n.day_of_week, note: n.note }); }
    }
    await workingHours.save();
    return res.json({ message: 'Weekly hours updated successfully!' });
  } catch (error) {
    return res.status(500).json({ message: 'Internal server error', error: error.message });
  }
};

exports.deleteWeeklyHours = async (req, res) => {
  try {
    const result = await WorkingHours.updateOne(
      { legacyId: Number(req.params.id), isDeleted: false },
      { $set: { isDeleted: true } }
    );
    if (!result.modifiedCount) return res.status(404).json({ message: 'Working hours not found.' });
    return res.json({ message: 'Weekly hours deleted successfully!' });
  } catch (error) {
    return res.status(500).json({ message: 'Internal server error', error: error.message });
  }
};

exports.updateWeekSubmissionStatus = async (req, res) => {
  try {
    const { weekEnding, userId, status } = req.body;
    if (typeof status !== 'boolean') return res.status(400).json({ message: 'Status must be true or false.' });
    const user = userId ? await resolveUser(userId) : null;
    const match = { weekEnding: new Date(weekEnding), isDeleted: false };
    if (user) match.userId = user._id;
    const result = await WorkingHours.updateMany(match, { $set: { submit: status } });
    return res.json({ message: `Submission status updated for ${result.modifiedCount} entries.` });
  } catch (error) {
    return res.status(500).json({ message: 'Internal server error', error: error.message });
  }
};

exports.getWeeklyTotalSummary = async (req, res) => {
  try {
    const user = await resolveUser(req.params.userId);
    if (!user) return res.status(404).json({ message: 'User not found.' });

    const byWeekEnd = {};

    // Primary: weeks from TimeWeek (all time/entry data — clock, manual, add-activity)
    const timeWeeks = await TimeWeek.find({ userId: user._id }).sort({ weekStartDate: 1 }).lean();
    for (const tw of timeWeeks) {
      const raw = tw.weekEndDate instanceof Date ? tw.weekEndDate : new Date(tw.weekEndDate);
      const key = raw.toISOString().slice(0, 10);
      byWeekEnd[key] = {
        week_ending: tw.weekEndDate,
        approved_date: tw.approvedAt || null,
        verified: tw.status === 'approved',
        submit: tw.status === 'submitted' || tw.status === 'approved',
        total_hours: +(tw.totalMinutes / 60).toFixed(2),
      };
    }

    // Legacy: WorkingHours rows (kept for backward compat with old data)
    const whRows = await WorkingHours.aggregate([
      { $match: { userId: user._id, isDeleted: false } },
      {
        $group: {
          _id: { weekEnding: '$weekEnding', verified: '$verified', submit: '$submit', approvedDate: '$approvedDate' },
          total_hours: { $sum: '$total' },
        },
      },
      { $sort: { '_id.weekEnding': 1 } },
    ]);
    for (const row of whRows) {
      const key = new Date(row._id.weekEnding).toISOString().slice(0, 10);
      if (!byWeekEnd[key]) {
        byWeekEnd[key] = {
          week_ending: row._id.weekEnding,
          approved_date: row._id.approvedDate,
          verified: row._id.verified,
          submit: row._id.submit,
          total_hours: row.total_hours,
        };
      }
    }

    const data = Object.values(byWeekEnd).sort((a, b) => new Date(a.week_ending) - new Date(b.week_ending));
    return res.json({ data });
  } catch (error) {
    return res.status(500).json({ message: 'Internal server error', error: error.message });
  }
};

const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

exports.getAdminWeekDetail = async (req, res) => {
  try {
    const { userId, weekEnding } = req.query;
    if (!userId || !weekEnding) return res.status(400).json({ message: 'userId and weekEnding are required.' });
    const user = await resolveUser(userId);
    if (!user) return res.status(404).json({ message: 'User not found.' });

    const weekEndDate = new Date(`${weekEnding}T23:59:59.999Z`);
    const weekStartDate = new Date(`${weekEnding}T00:00:00.000Z`);
    weekStartDate.setUTCDate(weekStartDate.getUTCDate() - 6);

    const [entries, week] = await Promise.all([
      TimeEntry.find({
        userId: user._id,
        entryDate: { $gte: weekStartDate, $lte: weekEndDate },
      }).populate('projectId', 'legacyId title').lean(),
      TimeWeek.findOne({
        userId: user._id,
        weekStartDate: { $gte: new Date(weekStartDate.getTime() - 86400000), $lte: weekEndDate },
      }).lean(),
    ]);

    const byProject = {};
    for (const entry of entries) {
      const pid = String(entry.projectId?._id || 'none');
      if (!byProject[pid]) {
        byProject[pid] = {
          project_id: entry.projectId?.legacyId ?? null,
          project: entry.projectId ? { id: entry.projectId.legacyId, title: entry.projectId.title } : null,
          mon: 0, tue: 0, wed: 0, thu: 0, fri: 0, sat: 0, sun: 0,
        };
      }
      const d = entry.entryDate instanceof Date ? entry.entryDate : new Date(entry.entryDate);
      byProject[pid][DAY_KEYS[d.getUTCDay()]] += entry.durationMinutes / 60;
    }

    const isApproved = week?.status === 'approved';
    const isSubmitted = ['submitted', 'approved'].includes(week?.status);
    const data = Object.values(byProject).map((row) => {
      const total = row.mon + row.tue + row.wed + row.thu + row.fri + row.sat + row.sun;
      return {
        id: null,
        project_id: row.project_id,
        user_id: Number(userId),
        week_ending: weekEnding,
        mon: +row.mon.toFixed(2), tue: +row.tue.toFixed(2), wed: +row.wed.toFixed(2),
        thu: +row.thu.toFixed(2), fri: +row.fri.toFixed(2), sat: +row.sat.toFixed(2), sun: +row.sun.toFixed(2),
        total: +total.toFixed(2),
        verified: isApproved,
        submit: isSubmitted,
        notes: [],
        project: row.project,
      };
    });

    return res.json({ success: true, data });
  } catch (error) {
    return res.status(500).json({ message: 'Internal server error', error: error.message });
  }
};

exports.approveAdminTimesheet = async (req, res) => {
  try {
    const { userId, weekEnding, approved } = req.body;
    if (!userId || !weekEnding) return res.status(400).json({ message: 'userId and weekEnding are required.' });
    const user = await resolveUser(userId);
    if (!user) return res.status(404).json({ message: 'User not found.' });

    const weekEndDate = new Date(`${weekEnding}T23:59:59.999Z`);
    const weekStartDate = new Date(`${weekEnding}T00:00:00.000Z`);
    weekStartDate.setUTCDate(weekStartDate.getUTCDate() - 6);

    await Promise.all([
      TimeWeek.updateOne(
        { userId: user._id, weekStartDate: { $gte: new Date(weekStartDate.getTime() - 86400000), $lte: weekEndDate } },
        { $set: { status: approved ? 'approved' : 'submitted', approvedAt: approved ? new Date() : null } }
      ),
      WorkingHours.updateMany(
        { userId: user._id, isDeleted: false, weekEnding: { $gte: weekStartDate, $lte: weekEndDate } },
        { $set: { verified: Boolean(approved), approvedDate: approved ? new Date() : null } }
      ),
    ]);

    return res.json({ success: true, message: approved ? 'Timesheet approved.' : 'Approval reverted.' });
  } catch (error) {
    return res.status(500).json({ message: 'Internal server error', error: error.message });
  }
};
