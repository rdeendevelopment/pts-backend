const { formatDayKey } = require('../../activity/helpers/week.helper');
const { minutesToHours } = require('./formatting.helper');

function groupEntriesByDay(entries = [], timeZone) {
  const days = new Map();

  for (const entry of entries) {
    const dayKey = formatDayKey(entry.entryDate, timeZone);
    if (!days.has(dayKey)) {
      days.set(dayKey, {
        date: dayKey,
        totalMinutes: 0,
        totalHours: 0,
        totalEntries: 0,
      });
    }

    const day = days.get(dayKey);
    day.totalMinutes += Number(entry.minutes || 0);
    day.totalEntries += 1;
    day.totalHours = minutesToHours(day.totalMinutes);
  }

  return [...days.values()].sort((a, b) => a.date.localeCompare(b.date));
}

function groupEntriesByProject(entries = []) {
  const projects = new Map();

  for (const entry of entries) {
    const projectId = String(entry.projectId);
    if (!projects.has(projectId)) {
      projects.set(projectId, {
        projectId,
        totalMinutes: 0,
        totalHours: 0,
        totalEntries: 0,
      });
    }

    const project = projects.get(projectId);
    project.totalMinutes += Number(entry.minutes || 0);
    project.totalEntries += 1;
    project.totalHours = minutesToHours(project.totalMinutes);
  }

  return [...projects.values()].sort((a, b) => b.totalMinutes - a.totalMinutes);
}

function groupEntriesByUser(entries = [], timeZone) {
  const users = new Map();

  for (const entry of entries) {
    const userId = String(entry.userId);
    if (!users.has(userId)) {
      users.set(userId, {
        userId,
        totalMinutes: 0,
        totalHours: 0,
        totalEntries: 0,
        days: new Map(),
        projects: new Map(),
      });
    }

    const user = users.get(userId);
    user.totalMinutes += Number(entry.minutes || 0);
    user.totalEntries += 1;
    user.totalHours = minutesToHours(user.totalMinutes);

    const dayKey = formatDayKey(entry.entryDate, timeZone);
    if (!user.days.has(dayKey)) {
      user.days.set(dayKey, { date: dayKey, totalMinutes: 0, totalHours: 0, totalEntries: 0 });
    }
    const day = user.days.get(dayKey);
    day.totalMinutes += Number(entry.minutes || 0);
    day.totalEntries += 1;
    day.totalHours = minutesToHours(day.totalMinutes);

    const projectId = String(entry.projectId);
    if (!user.projects.has(projectId)) {
      user.projects.set(projectId, {
        projectId,
        totalMinutes: 0,
        totalHours: 0,
        totalEntries: 0,
      });
    }
    const project = user.projects.get(projectId);
    project.totalMinutes += Number(entry.minutes || 0);
    project.totalEntries += 1;
    project.totalHours = minutesToHours(project.totalMinutes);
  }

  return [...users.values()]
    .map((user) => ({
      userId: user.userId,
      totalMinutes: user.totalMinutes,
      totalHours: user.totalHours,
      totalEntries: user.totalEntries,
      days: [...user.days.values()].sort((a, b) => a.date.localeCompare(b.date)),
      projects: [...user.projects.values()].sort((a, b) => b.totalMinutes - a.totalMinutes),
    }))
    .sort((a, b) => b.totalMinutes - a.totalMinutes);
}

module.exports = {
  groupEntriesByDay,
  groupEntriesByProject,
  groupEntriesByUser,
};
