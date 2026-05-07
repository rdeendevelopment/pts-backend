const taskTimeService = require('../Services/task-time.service');

exports.getTaskTimeSummary = async (req, res) => {
  try {
    const data = await taskTimeService.getTaskTimeSummary(req.query.projectId);
    return res.json({ success: true, data });
  } catch (error) {
    return res.status(error.status || 500).json({
      success: false,
      message: error.message || 'Internal server error',
    });
  }
};
