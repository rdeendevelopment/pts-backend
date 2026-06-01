const { Schema } = require('mongoose');

function getModel(sourceConnection, name, collection) {
  return sourceConnection.models[name]
    || sourceConnection.model(name, new Schema({}, { collection, strict: false }));
}

async function listCollection(sourceConnection, collection, { skip = 0, limit = 100000 } = {}) {
  const Model = getModel(sourceConnection, `Legacy_${collection}`, collection);
  return Model.find({}).sort({ _id: 1 }).skip(skip).limit(limit).lean();
}

async function countCollection(sourceConnection, collection) {
  const Model = getModel(sourceConnection, `Legacy_${collection}`, collection);
  return Model.countDocuments({});
}

async function loadLegacyClients(sourceConnection) {
  return listCollection(sourceConnection, 'clients');
}

async function loadLegacyProjects(sourceConnection) {
  return listCollection(sourceConnection, 'projects');
}

async function loadLegacyBudgets(sourceConnection) {
  return listCollection(sourceConnection, 'project_budgets');
}

async function loadLegacyAssignments(sourceConnection) {
  return listCollection(sourceConnection, 'project_assignments');
}

async function loadLegacyTimeWeeks(sourceConnection) {
  return listCollection(sourceConnection, 'time_weeks');
}

async function loadLegacyTimeEntries(sourceConnection) {
  return listCollection(sourceConnection, 'time_entries');
}

async function loadLegacyWorkingHours(sourceConnection) {
  return listCollection(sourceConnection, 'working_hours');
}

async function loadLegacyActivityCategories(sourceConnection) {
  return listCollection(sourceConnection, 'activity_categories');
}

async function loadLegacyTasksV2(sourceConnection) {
  return listCollection(sourceConnection, 'tasksV2');
}

async function loadLegacyTaskWorkflowsV2(sourceConnection) {
  return listCollection(sourceConnection, 'taskWorkflowsV2');
}

async function loadLegacyTaskWorkflowStatusesV2(sourceConnection) {
  return listCollection(sourceConnection, 'taskWorkflowStatusesV2');
}

async function loadLegacyTaskCommentsV2(sourceConnection) {
  return listCollection(sourceConnection, 'taskCommentsV2');
}

async function loadLegacyTaskActivitiesV2(sourceConnection) {
  return listCollection(sourceConnection, 'taskActivitiesV2');
}

async function loadLegacyAttachments(sourceConnection) {
  return listCollection(sourceConnection, 'attachments');
}

module.exports = {
  countCollection,
  listCollection,
  loadLegacyClients,
  loadLegacyAttachments,
  loadLegacyProjects,
  loadLegacyBudgets,
  loadLegacyAssignments,
  loadLegacyTimeWeeks,
  loadLegacyTimeEntries,
  loadLegacyWorkingHours,
  loadLegacyActivityCategories,
  loadLegacyTasksV2,
  loadLegacyTaskWorkflowsV2,
  loadLegacyTaskWorkflowStatusesV2,
  loadLegacyTaskCommentsV2,
  loadLegacyTaskActivitiesV2,
};
