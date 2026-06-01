const { getProjectModel } = require('../models/project.model');
const { getProjectBudgetModel } = require('../models/projectBudget.model');
const { getProjectAssignmentModel } = require('../models/projectAssignment.model');
const { getProjectFileModel } = require('../models/projectFile.model');
const { getProjectStatsModel } = require('../models/projectStats.model');
const { getProjectEventModel } = require('../models/projectEvent.model');
const { getTaskModel } = require('../../tasks/models/task.model');
const { getTaskCommentModel } = require('../../tasks/models/taskComment.model');
const { getTaskActivityModel } = require('../../tasks/models/taskActivity.model');
const { getTaskNotificationModel } = require('../../tasks/models/taskNotification.model');
const { getTaskCollaboratorModel } = require('../../tasks/models/taskCollaborator.model');
const { getTaskMemberModel } = require('../../tasks/models/taskMember.model');
const { getTaskWorkflowModel } = require('../../tasks/models/taskWorkflow.model');
const { getTaskWorkflowStatusModel } = require('../../tasks/models/taskWorkflowStatus.model');
const { getTimeEntryModel } = require('../../activity/models/timeEntry.model');
const { getActiveTimerModel } = require('../../activity/models/activeTimer.model');
const {
  collectTaskFileUrls,
  deleteTaskFilesBestEffort,
} = require('../../tasks/helpers/taskPermanentDelete.helper');
const projectRepository = require('../repositories/project.repository');

function collectProjectFileUrls(files = []) {
  return [...new Set(
    files
      .map((file) => file?.fileUrl)
      .filter(Boolean)
  )];
}


async function permanentDeleteProjectData(projectId) {
  const Task = getTaskModel();
  const TaskComment = getTaskCommentModel();
  const ProjectFile = getProjectFileModel();

  const [tasks, comments, projectFiles] = await Promise.all([
    Task.find({ projectId }).select('attachments').lean(),
    TaskComment.find({ projectId }).select('attachments').lean(),
    ProjectFile.find({ projectId }).select('fileUrl').lean(),
  ]);

  const fileUrls = new Set(collectProjectFileUrls(projectFiles));
  const commentsByTask = new Map();
  for (const comment of comments) {
    const key = String(comment.taskId);
    if (!commentsByTask.has(key)) commentsByTask.set(key, []);
    commentsByTask.get(key).push(comment);
  }
  for (const task of tasks) {
    for (const url of collectTaskFileUrls(task, commentsByTask.get(String(task._id)) || [])) {
      fileUrls.add(url);
    }
  }

  const TaskNotification = getTaskNotificationModel();
  const TaskCollaborator = getTaskCollaboratorModel();
  const TaskActivity = getTaskActivityModel();
  const TaskMember = getTaskMemberModel();
  const TaskWorkflowStatus = getTaskWorkflowStatusModel();
  const TaskWorkflow = getTaskWorkflowModel();
  const TimeEntry = getTimeEntryModel();
  const ActiveTimer = getActiveTimerModel();
  const ProjectBudget = getProjectBudgetModel();
  const ProjectAssignment = getProjectAssignmentModel();
  const ProjectStats = getProjectStatsModel();
  const ProjectEvent = getProjectEventModel();
  const Project = getProjectModel();

  await Promise.all([
    TaskComment.deleteMany({ projectId }),
    TaskNotification.deleteMany({ projectId }),
    TaskCollaborator.deleteMany({ projectId }),
    TaskActivity.deleteMany({ projectId }),
    TaskMember.deleteMany({ projectId }),
    TaskWorkflowStatus.deleteMany({ projectId }),
    TaskWorkflow.deleteMany({ projectId }),
    Task.deleteMany({ projectId }),
    TimeEntry.deleteMany({ projectId }),
    ActiveTimer.deleteMany({ projectId }),
    ProjectBudget.deleteMany({ projectId }),
    ProjectAssignment.deleteMany({ projectId }),
    ProjectFile.deleteMany({ projectId }),
    ProjectStats.deleteMany({ projectId }),
    ProjectEvent.deleteMany({ projectId }),
  ]);

  await Project.deleteOne({ _id: projectId });

  await Promise.all([
    deleteTaskFilesBestEffort([...fileUrls]),
  ]);

  return {
    deleted: true,
    projectId: String(projectId),
    removed: {
      tasks: tasks.length,
      timeEntries: true,
      budgets: true,
      assignments: true,
      files: projectFiles.length,
    },
  };
}

async function permanentDeleteProject(projectId) {
  const project = await projectRepository.findById(projectId, { includeDeleted: true });
  if (!project) {
    return null;
  }

  return permanentDeleteProjectData(project._id);
}

module.exports = {
  permanentDeleteProject,
  permanentDeleteProjectData,
};
