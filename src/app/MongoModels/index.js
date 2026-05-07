const WorkspaceNode = require('./workspace_node.model');
const List = require('./list.model');
const Task = require('./task.model');
const TaskPlacement = require('./task_placement.model');
const Notification = require('./notification.model');
const ProjectMember = require('./project_member.model');
const AppModule = require('./app_module.model');
const coreModels = require('./core.model');

module.exports = {
  WorkspaceNode,
  List,
  Task,
  TaskPlacement,
  Notification,
  ProjectMember,
  AppModule,
  ...coreModels,
};
