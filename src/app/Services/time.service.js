const timeRepo = require('../Repositories/time.repository');
const budgetService = require('./project-budget.service');

function getActivityCategories() {
  return timeRepo.getActivityCategories();
}

function getWeek(userId, dateInput) {
  return timeRepo.getWeek(userId, dateInput);
}

function createEntry(userId, data) {
  return timeRepo.createEntry(userId, data, budgetService);
}

function updateEntry(userId, entryId, data) {
  return timeRepo.updateEntry(userId, entryId, data, budgetService);
}

function deleteEntry(userId, entryId) {
  return timeRepo.deleteEntry(userId, entryId, budgetService);
}

function submitWeek(userId, dateInput) {
  return timeRepo.submitWeek(userId, dateInput);
}

function unsubmitWeek(userId, dateInput) {
  return timeRepo.unsubmitWeek(userId, dateInput);
}

function getActiveTimer(userId) {
  return timeRepo.getActiveTimer(userId);
}

function startTimer(userId, data) {
  return timeRepo.startTimer(userId, data, budgetService);
}

function stopTimer(userId, data = {}) {
  return timeRepo.stopTimer(userId, data, budgetService);
}

function getTeamTimesheet(filters = {}) {
  return timeRepo.getTeamTimesheet(filters);
}

function approveWeek(actorId, weekId) {
  return timeRepo.approveWeek(actorId, weekId);
}

function rejectWeek(actorId, weekId, reason = '') {
  return timeRepo.rejectWeek(actorId, weekId, reason);
}

function getOrphanedTimers() {
  return timeRepo.getOrphanedTimers();
}

function adminForceStopTimer(timerId) {
  return timeRepo.adminForceStopTimer(timerId);
}

function getUserWeeks(userId) {
  return timeRepo.getUserWeeks(userId);
}

function getProjectTimeSummary(userId, projectId, filters) {
  return timeRepo.getProjectTimeSummary(userId, projectId, filters);
}

function getProjectWeekEntries(userId, projectId, weekEnding) {
  return timeRepo.getProjectWeekEntries(userId, projectId, weekEnding);
}

function getAdminWeeks(filters) {
  return timeRepo.getAdminWeeks(filters);
}

function getAdminWeek(targetUserId, dateInput) {
  return timeRepo.getAdminWeek(targetUserId, dateInput);
}

module.exports = {
  getActivityCategories,
  getWeek,
  createEntry,
  updateEntry,
  deleteEntry,
  submitWeek,
  unsubmitWeek,
  getActiveTimer,
  startTimer,
  stopTimer,
  getTeamTimesheet,
  approveWeek,
  rejectWeek,
  getOrphanedTimers,
  adminForceStopTimer,
  getUserWeeks,
  getProjectTimeSummary,
  getProjectWeekEntries,
  getAdminWeeks,
  getAdminWeek,
};
