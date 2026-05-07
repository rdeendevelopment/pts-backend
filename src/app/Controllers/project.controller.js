const projectService = require('../Services/project.service');

exports.save = async (req, res) => {
  try {
    const project = await projectService.saveProject(req.body, req);
    return res.json({ message: 'Project Created!', data: project });
  } catch (error) {
    console.error('Error creating project:', error);
    return res.status(error.status || 500).json({ message: error.message || 'Internal server error' });
  }
};

exports.getAllProjects = async (req, res) => {
  try {
    const { page = 1, limit = 5000 } = req.query;
    const result = await projectService.listProjects({ page, limit });
    return res.json({ ...result, source: 'mongodb' });
  } catch (error) {
    console.error('Error fetching projects:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

exports.deleteProject = async (req, res) => {
  try {
    const { projectId } = req.params;
    await projectService.deleteProject(projectId);
    return res.json({ message: 'Project deleted successfully' });
  } catch (error) {
    console.error('Error deleting project:', error);
    return res.status(error.status || 500).json({ message: error.message || 'Internal server error' });
  }
};

exports.getProjectById = async (req, res) => {
  try {
    const project = await projectService.getProjectById(req.params.projectId);
    if (!project) return res.status(404).json({ message: 'Project not found' });
    return res.json({ data: project, source: 'mongodb' });
  } catch (error) {
    console.error('Error fetching project detail:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

exports.updateProjectField = async (req, res) => {
  try {
    const { projectId } = req.params;
    const { field, value } = req.body;
    if (!field || value === undefined) return res.status(400).json({ message: 'Field and value are required' });
    const project = await projectService.updateProjectField(projectId, field, value);
    return res.json({ message: `Project ${field} updated successfully!`, data: project });
  } catch (error) {
    console.error('Error updating project field:', error);
    return res.status(error.status || 500).json({ message: error.message || 'Internal server error' });
  }
};

exports.getUserAssignedProjects = async (req, res) => {
  try {
    const result = await projectService.getUserAssignedProjects(req.params.userId, req.query);
    if (!result.total) return res.status(404).json({ status: false, message: 'No projects found for this user.' });
    return res.json({ status: true, ...result });
  } catch (error) {
    console.error('Error fetching assigned projects:', error);
    return res.status(500).json({ status: false, message: 'Internal server error' });
  }
};

exports.getUserProjectDetail = async (req, res) => {
  try {
    const project = await projectService.getUserProjectDetail(req.body.projectId);
    if (!project) return res.status(404).json({ message: 'Project not found' });
    return res.json({ data: project });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};
