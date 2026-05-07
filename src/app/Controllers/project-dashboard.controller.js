const projectDashboardService = require('../Services/project-dashboard.service');

function handleError(res, error) {
  return res.status(error.status || 500).json({
    success: false,
    message: error.message || 'Internal server error',
  });
}

exports.getProjectDashboard = async (req, res) => {
  try {
    const data = await projectDashboardService.getProjectDashboard(req.params.id);
    return res.json({ success: true, data });
  } catch (error) {
    return handleError(res, error);
  }
};

exports.getProjectTimeEntries = async (req, res) => {
  try {
    const data = await projectDashboardService.getProjectTimeEntries(req.params.id, req.query);
    return res.json({ success: true, data });
  } catch (error) {
    return handleError(res, error);
  }
};
