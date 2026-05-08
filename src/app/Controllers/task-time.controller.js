const taskTimeService = require('../Services/task-time.service');

exports.getTaskTimeSummary = async (req, res) => {
  const startedAt = Date.now();
  const requestId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  try {
    const taskIds = String(req.query.taskIds || '')
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean)
      .slice(0, 250);
    const data = await taskTimeService.getTaskTimeSummary(req.query.projectId, taskIds);
    console.info('[task-perf]', {
      requestId,
      route: 'GET /tasks/time-summary',
      durationMs: Date.now() - startedAt,
      dbDurationMs: Date.now() - startedAt,
      projectId: req.query.projectId || null,
      taskIdCount: taskIds.length,
      resultCount: Array.isArray(data) ? data.length : 0,
    });
    return res.json({ success: true, data });
  } catch (error) {
    console.warn('[task-perf]', {
      requestId,
      route: 'GET /tasks/time-summary',
      durationMs: Date.now() - startedAt,
      dbDurationMs: Date.now() - startedAt,
      error: error.message,
    });
    return res.status(error.status || 500).json({
      success: false,
      message: error.message || 'Internal server error',
    });
  }
};
