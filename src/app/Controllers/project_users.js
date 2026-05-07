const projectService = require('../Services/project.service');

exports.unassignUser = async (req, res) => {
  try {
    const data = await projectService.unassignUser(req.body);
    return res.json({ message: 'User unassigned successfully.', data });
  } catch (error) {
    return res.status(error.status || 500).json({ message: error.message || 'Internal server error', error: error.message });
  }
};

exports.assignOrReassignUser = async (req, res) => {
  try {
    const data = await projectService.assignOrReassignUser(req.body);
    return res.json({ message: 'User assigned successfully.', data });
  } catch (error) {
    console.error('Error assigning project user:', error);
    return res.status(error.status || 500).json({ message: error.message || 'Internal server error', error: error.message });
  }
};

exports.getUserAssignedProjectsWithDetails = async (req, res) => {
  try {
    const result = await projectService.getUserAssignedProjects(req.params.userId, { page: 1, limit: 5000 });
    if (!result.total) return res.status(404).json({ status: false, message: 'No projects found for this user.' });
    return res.json({ status: true, data: result.data });
  } catch (error) {
    return res.status(error.status || 500).json({ status: false, message: error.message || 'Internal server error', error: error.message });
  }
};
