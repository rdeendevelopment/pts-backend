// private-workspace.service.js
//
// Manages a user's personal/private workspace — completely isolated from projects.
// No admin can read or modify these. No project linkage.

const {
  TaskPrivateFolderV2: TaskPrivateFolder,
  TaskPrivateListV2:   TaskPrivateList,
  TaskPrivateTaskV2:   TaskPrivateTask,
} = require('../models');

function serviceError(message, status = 400) {
  const err = new Error(message);
  err.status = status;
  return err;
}

// ── Folders ───────────────────────────────────────────────────────────────────

async function getFolders(userId) {
  return TaskPrivateFolder.find({ userId, deletedAt: null }).sort({ order: 1 }).lean();
}

async function createFolder(userId, data) {
  const { name, icon, color } = data;
  if (!name || !String(name).trim()) throw serviceError('name is required');

  const count = await TaskPrivateFolder.countDocuments({ userId, deletedAt: null });
  const folder = await TaskPrivateFolder.create({
    userId,
    name:  String(name).trim(),
    icon:  icon || null,
    color: color || null,
    order: count * 1024,
  });
  return folder.toObject();
}

async function renameFolder(userId, folderId, newName) {
  if (!newName || !String(newName).trim()) throw serviceError('name is required');
  const folder = await TaskPrivateFolder.findOne({ _id: folderId, userId, deletedAt: null });
  if (!folder) throw serviceError('Folder not found', 404);
  folder.name = String(newName).trim();
  await folder.save();
  return folder.toObject();
}

async function deleteFolder(userId, folderId) {
  const folder = await TaskPrivateFolder.findOne({ _id: folderId, userId, deletedAt: null });
  if (!folder) throw serviceError('Folder not found', 404);

  const hasLists = await TaskPrivateList.countDocuments({ userId, folderId, deletedAt: null });
  if (hasLists) throw serviceError('Delete all lists in this folder first', 400);

  folder.deletedAt = new Date();
  await folder.save();
  return { deleted: true };
}

async function reorderFolders(userId, updates) {
  if (!Array.isArray(updates)) throw serviceError('updates must be an array');
  for (const { folderId, order } of updates) {
    await TaskPrivateFolder.updateOne({ _id: folderId, userId }, { $set: { order: Number(order) } });
  }
  return getFolders(userId);
}

// ── Lists ─────────────────────────────────────────────────────────────────────

async function getLists(userId, folderId) {
  const folder = await TaskPrivateFolder.findOne({ _id: folderId, userId, deletedAt: null }).lean();
  if (!folder) throw serviceError('Folder not found', 404);
  return TaskPrivateList.find({ userId, folderId, deletedAt: null }).sort({ order: 1 }).lean();
}

async function createList(userId, folderId, data) {
  const folder = await TaskPrivateFolder.findOne({ _id: folderId, userId, deletedAt: null }).lean();
  if (!folder) throw serviceError('Folder not found', 404);

  const { name, icon, color } = data;
  if (!name || !String(name).trim()) throw serviceError('name is required');

  const count = await TaskPrivateList.countDocuments({ userId, folderId, deletedAt: null });
  const list = await TaskPrivateList.create({
    userId,
    folderId,
    name:  String(name).trim(),
    icon:  icon || null,
    color: color || null,
    order: count * 1024,
  });
  return list.toObject();
}

async function renameList(userId, listId, newName) {
  if (!newName || !String(newName).trim()) throw serviceError('name is required');
  const list = await TaskPrivateList.findOne({ _id: listId, userId, deletedAt: null });
  if (!list) throw serviceError('List not found', 404);
  list.name = String(newName).trim();
  await list.save();
  return list.toObject();
}

async function deleteList(userId, listId) {
  const list = await TaskPrivateList.findOne({ _id: listId, userId, deletedAt: null });
  if (!list) throw serviceError('List not found', 404);

  const hasTasks = await TaskPrivateTask.countDocuments({ userId, listId, deletedAt: null });
  if (hasTasks) throw serviceError('Move or delete all tasks in this list first', 400);

  list.deletedAt = new Date();
  await list.save();
  return { deleted: true };
}

// ── Tasks ─────────────────────────────────────────────────────────────────────

async function getTasks(userId, listId, options = {}) {
  const list = await TaskPrivateList.findOne({ _id: listId, userId, deletedAt: null }).lean();
  if (!list) throw serviceError('List not found', 404);

  const filter = { userId, listId, deletedAt: null };
  if (options.isDone !== undefined) filter.isDone = Boolean(options.isDone);
  if (!options.includeArchived) filter.isArchived = false;

  return TaskPrivateTask.find(filter).sort({ order: 1 }).lean();
}

async function createTask(userId, listId, data) {
  const list = await TaskPrivateList.findOne({ _id: listId, userId, deletedAt: null }).lean();
  if (!list) throw serviceError('List not found', 404);

  const { title, description, notes, priority, dueDate, startDate, tags, checklist } = data;
  if (!title || !String(title).trim()) throw serviceError('title is required');

  const last = await TaskPrivateTask.findOne({ userId, listId, deletedAt: null }).sort({ order: -1 }).lean();
  const order = last ? Number(last.order || 0) + 1024 : 1024;

  const task = await TaskPrivateTask.create({
    userId,
    listId,
    folderId:    list.folderId,
    title:       String(title).trim(),
    description: description || '',
    notes:       notes || '',
    priority:    priority || 'none',
    dueDate:     dueDate || null,
    startDate:   startDate || null,
    tags:        Array.isArray(tags) ? tags : [],
    checklist:   Array.isArray(checklist) ? checklist : [],
    order,
  });

  return task.toObject();
}

async function updateTask(userId, taskId, data) {
  const task = await TaskPrivateTask.findOne({ _id: taskId, userId, deletedAt: null });
  if (!task) throw serviceError('Task not found', 404);

  if (data.title !== undefined)       task.title       = String(data.title).trim();
  if (data.description !== undefined) task.description = data.description;
  if (data.notes !== undefined)       task.notes       = data.notes;
  if (data.priority !== undefined)    task.priority    = data.priority;
  if (data.dueDate !== undefined)     task.dueDate     = data.dueDate ? new Date(data.dueDate) : null;
  if (data.startDate !== undefined)   task.startDate   = data.startDate ? new Date(data.startDate) : null;
  if (data.tags !== undefined)        task.tags        = Array.isArray(data.tags) ? data.tags : [];
  if (data.checklist !== undefined)   task.checklist   = Array.isArray(data.checklist) ? data.checklist : [];
  if (data.listId !== undefined)      task.listId      = data.listId;

  await task.save();
  return task.toObject();
}

async function toggleDone(userId, taskId) {
  const task = await TaskPrivateTask.findOne({ _id: taskId, userId, deletedAt: null });
  if (!task) throw serviceError('Task not found', 404);

  task.isDone = !task.isDone;
  task.completedAt = task.isDone ? new Date() : null;
  await task.save();
  return task.toObject();
}

async function deleteTask(userId, taskId) {
  const task = await TaskPrivateTask.findOne({ _id: taskId, userId, deletedAt: null });
  if (!task) throw serviceError('Task not found', 404);
  task.deletedAt = new Date();
  await task.save();
  return { deleted: true };
}

async function reorderTasks(userId, listId, updates) {
  if (!Array.isArray(updates)) throw serviceError('updates must be an array');
  for (const { taskId, order } of updates) {
    await TaskPrivateTask.updateOne({ _id: taskId, userId, listId }, { $set: { order: Number(order) } });
  }
  return getTasks(userId, listId);
}

// Seed default folders/lists for a new user's private workspace
async function seedDefaultWorkspace(userId) {
  const existing = await TaskPrivateFolder.countDocuments({ userId, deletedAt: null });
  if (existing > 0) return;

  const defaultFolders = [
    { name: 'Notes',       icon: 'ri-sticky-note-line',  color: '#F59E0B', order: 0    },
    { name: 'Draft Tasks', icon: 'ri-draft-line',         color: '#3B82F6', order: 1024 },
    { name: 'Ideas',       icon: 'ri-lightbulb-line',     color: '#8B5CF6', order: 2048 },
  ];

  for (const fd of defaultFolders) {
    const folder = await TaskPrivateFolder.create({ userId, ...fd });
    await TaskPrivateList.create({
      userId,
      folderId: folder._id,
      name:     fd.name,
      icon:     fd.icon,
      color:    fd.color,
      order:    0,
    });
  }
}

module.exports = {
  getFolders, createFolder, renameFolder, deleteFolder, reorderFolders,
  getLists, createList, renameList, deleteList,
  getTasks, createTask, updateTask, toggleDone, deleteTask, reorderTasks,
  seedDefaultWorkspace,
};
