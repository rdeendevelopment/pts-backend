const workspaceRepo = require('../../Repositories/workspace.repository');

function syncUserProjects(userId, auth = {}) {
  return workspaceRepo.syncUserProjects(userId, auth);
}

function getUserTree(userId, auth = {}) {
  return workspaceRepo.getUserTree(userId, auth);
}

function createFolder(userId, data, auth = {}) {
  return workspaceRepo.createFolder(userId, data, auth);
}

function renameNode(userId, nodeId, newName, auth = {}) {
  return workspaceRepo.renameNode(userId, nodeId, newName, auth);
}

function deleteFolder(userId, nodeId, auth = {}) {
  return workspaceRepo.deleteFolder(userId, nodeId, auth);
}

function reorderNodes(userId, updates, auth = {}) {
  return workspaceRepo.reorderNodes(userId, updates, auth);
}

module.exports = {
  syncUserProjects,
  getUserTree,
  createFolder,
  renameNode,
  deleteFolder,
  reorderNodes,
};
