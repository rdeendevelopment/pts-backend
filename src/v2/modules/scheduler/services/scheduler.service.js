const { AGENDA_COLLECTION } = require('../../../scheduler/agenda.client');
const { getV2Connection } = require('../../../database/connection');
const { JOB_NAME } = require('../../../scheduler/jobs/retainerRenewal.job');
const { JOB_NAME: TIMER_RECOVERY_JOB_NAME } = require('../../../scheduler/jobs/timerRecovery.job');
const scheduledJobRunRepository = require('../repositories/scheduledJobRun.repository');

function toJobRunDto(doc) {
  if (!doc) return null;
  return {
    id: String(doc._id),
    jobName: doc.jobName,
    trigger: doc.trigger,
    status: doc.status,
    startedAt: doc.startedAt,
    finishedAt: doc.finishedAt,
    durationMs: doc.durationMs,
    result: doc.result || null,
    error: doc.error || null,
    agendaJobId: doc.agendaJobId ? String(doc.agendaJobId) : null,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

function toAgendaJobDto(attrs) {
  if (!attrs) return null;
  return {
    id: attrs._id ? String(attrs._id) : null,
    name: attrs.name,
    type: attrs.type,
    priority: attrs.priority,
    nextRunAt: attrs.nextRunAt || null,
    lastRunAt: attrs.lastRunAt || null,
    lastFinishedAt: attrs.lastFinishedAt || null,
    failedAt: attrs.failedAt || null,
    failReason: attrs.failReason || null,
    failCount: attrs.failCount || 0,
    lockedAt: attrs.lockedAt || null,
    repeatInterval: attrs.repeatInterval || null,
    repeatTimezone: attrs.repeatTimezone || null,
    disabled: attrs.disabled || false,
  };
}

async function listAgendaJobsFromDb() {
  try {
    const connection = getV2Connection();
    const rows = await connection.db.collection(AGENDA_COLLECTION)
      .find({})
      .sort({ nextRunAt: 1, lastRunAt: -1 })
      .limit(100)
      .toArray();
    return rows;
  } catch (_err) {
    return [];
  }
}

async function listJobDefinitions() {
  const agendaJobs = await listAgendaJobsFromDb();

  const knownJobs = [
    {
      key: JOB_NAME,
      label: 'Retainer auto-renewal',
      description: 'Creates monthly retainer cycle budgets for active projects.',
      agendaCollection: AGENDA_COLLECTION,
    },
    {
      key: TIMER_RECOVERY_JOB_NAME,
      label: 'Overdue timer recovery',
      description: 'Freezes timers that exceed the maximum duration so users can correct them.',
      agendaCollection: AGENDA_COLLECTION,
    },
  ];

  return knownJobs.map((definition) => {
    const matches = agendaJobs.filter((job) => job.name === definition.key);
    const primary = matches[0] || null;
    return {
      ...definition,
      scheduled: matches.length > 0,
      scheduleCount: matches.length,
      agenda: primary ? toAgendaJobDto(primary) : null,
      agendaJobs: matches.map(toAgendaJobDto),
    };
  });
}

async function listJobRuns(query = {}) {
  const limit = Number(query.limit || 50);
  const jobName = query.job_name || query.jobName || null;
  const rows = await scheduledJobRunRepository.listRuns({ jobName, limit });
  return rows.map(toJobRunDto);
}

async function getJobRunById(runId) {
  const row = await scheduledJobRunRepository.findRunById(runId);
  return toJobRunDto(row);
}

module.exports = {
  listJobDefinitions,
  listJobRuns,
  getJobRunById,
};
