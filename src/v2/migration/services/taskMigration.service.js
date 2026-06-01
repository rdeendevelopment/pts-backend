const taskRepository = require('../../modules/tasks/repositories/task.repository');
const taskCommentRepository = require('../../modules/tasks/repositories/taskComment.repository');
const taskWorkflowRepository = require('../../modules/tasks/repositories/taskWorkflow.repository');
const taskWorkflowStatusRepository = require('../../modules/tasks/repositories/taskWorkflowStatus.repository');
const taskWorkflowService = require('../../modules/tasks/services/taskWorkflow.service');
const userRepository = require('../../modules/users/repositories/user.repository');
const { getTaskModel } = require('../../modules/tasks/models/task.model');
const { getTaskCommentModel } = require('../../modules/tasks/models/taskComment.model');
const { getTaskActivityModel } = require('../../modules/tasks/models/taskActivity.model');
const {
  loadLegacyTasksV2,
  loadLegacyTaskWorkflowsV2,
  loadLegacyTaskWorkflowStatusesV2,
  loadLegacyTaskCommentsV2,
  loadLegacyTaskActivitiesV2,
  listCollection,
} = require('../repositories/legacyData.repository');
const {
  transformLegacyTask,
  transformLegacyTaskComment,
  transformLegacyTaskActivity,
} = require('../transformers/task.transformer');
const {
  chunkArray,
  prepareMigrationContext,
  finalizeMigrationStep,
  completeMigrationRun,
  findExistingMap,
  saveEntityMap,
  recordMigrationError,
  resolveMappedId,
  buildNormalizedName,
} = require('../helpers/migrationBase.helper');

function createEmptyStats() {
  return {
    sourceTaskCount: 0,
    sourceCommentCount: 0,
    sourceActivityCount: 0,
    targetTaskCount: 0,
    targetCommentCount: 0,
    mappedTaskCount: 0,
    mappedCommentCount: 0,
    mappedActivityCount: 0,
    skippedCount: 0,
    errorCount: 0,
  };
}

async function resolveProjectId(ctx, doc) {
  if (doc.projectId) {
    const mapped = await resolveMappedId(ctx.targetConnection, ctx.mapCache, {
      entityType: 'project',
      oldCollection: 'projects',
      oldObjectId: doc.projectId,
    });
    if (mapped) return mapped;
  }

  if (doc.projectRef?.sourceId != null) {
    return resolveMappedId(ctx.targetConnection, ctx.mapCache, {
      entityType: 'project',
      oldCollection: 'projects',
      oldId: doc.projectRef.sourceId,
    });
  }

  return null;
}

async function resolveAccountIdForLegacyUser(ctx, legacyUserObjectId) {
  if (!legacyUserObjectId) return null;

  const userId = await resolveMappedId(ctx.targetConnection, ctx.mapCache, {
    entityType: 'user',
    oldCollection: 'users',
    oldObjectId: legacyUserObjectId,
  });
  if (userId) {
    const user = await userRepository.findById(userId);
    if (user?.accountId) return user.accountId;
  }

  const adminAccountId = await resolveMappedId(ctx.targetConnection, ctx.mapCache, {
    entityType: 'account',
    oldCollection: 'account_admins',
    oldObjectId: legacyUserObjectId,
  });
  if (adminAccountId) return adminAccountId;

  return null;
}

async function buildAssignees(ctx, assignees = []) {
  const rows = [];
  for (const assignee of assignees) {
    const userId = await resolveMappedId(ctx.targetConnection, ctx.mapCache, {
      entityType: 'user',
      oldCollection: 'users',
      oldObjectId: assignee.userId,
    });
    if (!userId) continue;
    const user = await userRepository.findById(userId);
    rows.push({
      userId,
      assignedAt: assignee.assignedAt || new Date(),
      assignedBy: await resolveAccountIdForLegacyUser(ctx, assignee.assignedBy),
      name: user ? `${user.firstName} ${user.lastName}`.trim() : assignee.name || '',
      email: user?.email || assignee.email || '',
    });
  }
  return rows;
}

async function ensureProjectWorkflow(ctx, projectId, legacyWorkflows, legacyStatuses) {
  const cacheKey = `workflow:${String(projectId)}`;
  if (ctx.workflowCache.has(cacheKey)) return ctx.workflowCache.get(cacheKey);

  let legacyWorkflow = null;
  for (const row of legacyWorkflows) {
    const mappedProjectId = row.projectId
      ? await resolveMappedId(ctx.targetConnection, ctx.mapCache, {
        entityType: 'project',
        oldCollection: 'projects',
        oldObjectId: row.projectId,
        oldId: row.projectRef?.sourceId,
      })
      : null;
    if (mappedProjectId && String(mappedProjectId) === String(projectId)) {
      legacyWorkflow = row;
      break;
    }
  }

  if (!ctx.dryRun) {
    if (legacyWorkflow) {
      let workflow = await taskWorkflowRepository.findDefaultByProjectId(projectId);
      if (!workflow) {
        workflow = await taskWorkflowRepository.createWorkflow({
          projectId,
          name: legacyWorkflow.name || 'Migrated Workflow',
          isDefault: true,
          status: 'active',
        });
      }

      const statuses = legacyStatuses.filter((row) => String(row.workflowId) === String(legacyWorkflow._id));
      let v2Statuses = await taskWorkflowStatusRepository.listByWorkflowId(workflow._id);
      if (!v2Statuses.length && statuses.length) {
        v2Statuses = await taskWorkflowStatusRepository.createMany(
          statuses.map((row, index) => ({
            workflowId: workflow._id,
            projectId,
            name: row.name || row.key || `Status ${index + 1}`,
            key: buildNormalizedName(row.key || row.name || `status_${index + 1}`).replace(/\s+/g, '_'),
            order: row.order ?? index * 1024,
            category: row.category || 'active',
            status: 'active',
            isTerminal: Boolean(row.isTerminal),
          }))
        );
      }

      const statusMap = new Map();
      for (const legacyStatus of statuses) {
        const matched = v2Statuses.find((row) => row.key === buildNormalizedName(legacyStatus.key || legacyStatus.name || '').replace(/\s+/g, '_'));
        if (matched) statusMap.set(String(legacyStatus._id), matched._id);
      }

      const result = { workflow, statuses: v2Statuses, statusMap };
      ctx.workflowCache.set(cacheKey, result);
      return result;
    }

    const result = await taskWorkflowService.getOrCreateProjectWorkflow(projectId);
    ctx.workflowCache.set(cacheKey, result);
    return result;
  }

  const placeholder = { workflow: { _id: projectId }, statuses: [{ _id: projectId }], statusMap: new Map() };
  ctx.workflowCache.set(cacheKey, placeholder);
  return placeholder;
}

async function resolveCommentTaskId(ctx, legacyTaskObjectId) {
  if (!legacyTaskObjectId) return null;

  let taskId = await resolveMappedId(ctx.targetConnection, ctx.mapCache, {
    entityType: 'task',
    oldCollection: 'tasksV2',
    oldObjectId: legacyTaskObjectId,
  });
  if (taskId) return taskId;

  const { tasksV2Source, tasksV1Source } = ctx.taskLinkCache;
  const directV2 = tasksV2Source.find((row) => String(row._id) === String(legacyTaskObjectId));
  if (directV2) {
    taskId = await resolveMappedId(ctx.targetConnection, ctx.mapCache, {
      entityType: 'task',
      oldCollection: 'tasksV2',
      oldObjectId: directV2._id,
    });
    if (taskId) return taskId;
  }

  const v1Task = tasksV1Source.find((row) => String(row._id) === String(legacyTaskObjectId));
  if (!v1Task) return null;

  const matchedV2 = tasksV2Source.find((row) => {
    if (v1Task.projectId && row.projectId && String(row.projectId) === String(v1Task.projectId)) {
      return String(row.title || '').trim() === String(v1Task.title || '').trim();
    }
    if (v1Task.projectRef?.sourceId && row.projectRef?.sourceId) {
      return row.projectRef.sourceId === v1Task.projectRef.sourceId
        && String(row.title || '').trim() === String(v1Task.title || '').trim();
    }
    return false;
  });

  if (!matchedV2) return null;

  return resolveMappedId(ctx.targetConnection, ctx.mapCache, {
    entityType: 'task',
    oldCollection: 'tasksV2',
    oldObjectId: matchedV2._id,
  });
}

async function resolveCommentProjectId(ctx, doc, taskId) {
  if (doc.projectId) {
    const mapped = await resolveMappedId(ctx.targetConnection, ctx.mapCache, {
      entityType: 'project',
      oldCollection: 'projects',
      oldObjectId: doc.projectId,
    });
    if (mapped) return mapped;
  }

  if (!taskId) return null;
  const Task = require('../../modules/tasks/models/task.model').getTaskModel();
  const task = await Task.findById(taskId).select('projectId').lean();
  return task?.projectId || null;
}

async function migrateTasks(options = {}) {
  const ctx = await prepareMigrationContext({
    mode: options.mode || 'dry-run',
    batchSize: options.batchSize || 500,
    startedBy: options.startedBy || 'migrateTasks',
    notes: options.notes || 'Tasks migration',
    runId: options.runId || null,
  });
  ctx.workflowCache = new Map();
  const stats = createEmptyStats();
  const [tasks, workflows, statuses, comments, activities] = await Promise.all([
    loadLegacyTasksV2(ctx.sourceConnection),
    loadLegacyTaskWorkflowsV2(ctx.sourceConnection),
    loadLegacyTaskWorkflowStatusesV2(ctx.sourceConnection),
    loadLegacyTaskCommentsV2(ctx.sourceConnection),
    loadLegacyTaskActivitiesV2(ctx.sourceConnection),
  ]);
  ctx.taskLinkCache = {
    tasksV2Source: tasks,
    tasksV1Source: await listCollection(ctx.sourceConnection, 'tasks'),
  };

  stats.sourceTaskCount = tasks.length;
  stats.sourceCommentCount = comments.length;
  stats.sourceActivityCount = activities.length;

  for (const batch of chunkArray(tasks, ctx.batchSize)) {
    for (const doc of batch) {
      const existing = await findExistingMap(ctx.targetConnection, {
        entityType: 'task',
        oldCollection: 'tasksV2',
        oldObjectId: doc._id,
        oldId: doc.taskNumber,
      });
      if (existing) {
        stats.skippedCount += 1;
        continue;
      }

      const projectId = doc.projectId
        ? await resolveMappedId(ctx.targetConnection, ctx.mapCache, {
          entityType: 'project',
          oldCollection: 'projects',
          oldObjectId: doc.projectId,
        })
        : await resolveProjectId(ctx, doc);
      if (!projectId) {
        stats.errorCount += 1;
        await recordMigrationError(ctx.targetConnection, {
          runId: ctx.run._id,
          entityType: 'task',
          oldCollection: 'tasksV2',
          oldObjectId: doc._id,
          oldId: doc.taskNumber,
          code: 'TASK_PROJECT_MISSING',
          message: 'Task project could not be resolved.',
          dryRun: ctx.dryRun,
        });
        continue;
      }

      const workflowBundle = await ensureProjectWorkflow(ctx, projectId, workflows, statuses);
      let workflowStatusId = workflowBundle.statusMap.get(String(doc.workflowStatusId || ''))
        || workflowBundle.statuses[0]?._id;

      if (doc.workflowStatusId && !workflowBundle.statusMap.has(String(doc.workflowStatusId))) {
        workflowStatusId = workflowBundle.statuses[0]?._id;
      }

      const refs = {
        projectId,
        workflowId: workflowBundle.workflow._id,
        workflowStatusId,
        assignees: await buildAssignees(ctx, doc.assignees || []),
        reviewerId: doc.reviewerId
          ? await resolveMappedId(ctx.targetConnection, ctx.mapCache, {
            entityType: 'user',
            oldCollection: 'users',
            oldObjectId: doc.reviewerId,
          })
          : null,
        createdBy: await resolveAccountIdForLegacyUser(ctx, doc.createdBy),
        completedBy: doc.completedBy
          ? await resolveAccountIdForLegacyUser(ctx, doc.completedBy)
          : null,
      };

      const transformed = transformLegacyTask(doc, refs);
      if (transformed.error) {
        stats.errorCount += 1;
        await recordMigrationError(ctx.targetConnection, {
          runId: ctx.run._id,
          entityType: 'task',
          oldCollection: 'tasksV2',
          oldObjectId: doc._id,
          oldId: doc.taskNumber,
          code: transformed.error.code,
          message: transformed.error.message,
          dryRun: ctx.dryRun,
        });
        continue;
      }

      if (!ctx.dryRun) {
        const task = await taskRepository.createTask(transformed.payload);
        await saveEntityMap(ctx.targetConnection, {
          runId: ctx.run._id,
          entityType: 'task',
          oldCollection: 'tasksV2',
          oldObjectId: doc._id,
          oldId: doc.taskNumber,
          newObjectId: task._id,
          metadata: { sourceHash: transformed.sourceHash },
        });
      }

      stats.mappedTaskCount += 1;
    }
  }

  for (const batch of chunkArray(comments, ctx.batchSize)) {
    for (const doc of batch) {
      const existing = await findExistingMap(ctx.targetConnection, {
        entityType: 'task_comment',
        oldCollection: 'taskCommentsV2',
        oldObjectId: doc._id,
        oldId: doc.legacyCommentId,
      });
      if (existing) {
        stats.skippedCount += 1;
        continue;
      }

      const taskId = await resolveCommentTaskId(ctx, doc.taskId);
      const projectId = await resolveCommentProjectId(ctx, doc, taskId);
      const authorId = await resolveAccountIdForLegacyUser(ctx, doc.userId);

      const transformed = transformLegacyTaskComment(doc, { taskId, projectId, authorId });
      if (transformed.error) {
        stats.errorCount += 1;
        await recordMigrationError(ctx.targetConnection, {
          runId: ctx.run._id,
          entityType: 'task_comment',
          oldCollection: 'taskCommentsV2',
          oldObjectId: doc._id,
          oldId: doc.legacyCommentId,
          code: transformed.error.code,
          message: transformed.error.message,
          dryRun: ctx.dryRun,
        });
        continue;
      }

      if (!ctx.dryRun) {
        const comment = await taskCommentRepository.createComment(transformed.payload);
        await saveEntityMap(ctx.targetConnection, {
          runId: ctx.run._id,
          entityType: 'task_comment',
          oldCollection: 'taskCommentsV2',
          oldObjectId: doc._id,
          oldId: doc.legacyCommentId,
          newObjectId: comment._id,
          metadata: { sourceHash: transformed.sourceHash },
        });
      }

      stats.mappedCommentCount += 1;
    }
  }

  for (const batch of chunkArray(activities, ctx.batchSize)) {
    for (const doc of batch) {
      const existing = await findExistingMap(ctx.targetConnection, {
        entityType: 'task_activity',
        oldCollection: 'taskActivitiesV2',
        oldObjectId: doc._id,
      });
      if (existing) {
        stats.skippedCount += 1;
        continue;
      }

      const taskId = await resolveMappedId(ctx.targetConnection, ctx.mapCache, {
        entityType: 'task',
        oldCollection: 'tasksV2',
        oldObjectId: doc.taskId,
      });
      const projectId = doc.projectId
        ? await resolveMappedId(ctx.targetConnection, ctx.mapCache, {
          entityType: 'project',
          oldCollection: 'projects',
          oldObjectId: doc.projectId,
        })
        : await resolveProjectId(ctx, doc);
      const performedBy = doc.performedBy
        ? await resolveAccountIdForLegacyUser(ctx, doc.performedBy)
        : null;

      const transformed = transformLegacyTaskActivity(doc, { taskId, projectId, performedBy });
      if (transformed.error) {
        stats.errorCount += 1;
        continue;
      }

      if (!ctx.dryRun) {
        const TaskActivity = getTaskActivityModel();
        const activity = await TaskActivity.create(transformed.payload);
        await saveEntityMap(ctx.targetConnection, {
          runId: ctx.run._id,
          entityType: 'task_activity',
          oldCollection: 'taskActivitiesV2',
          oldObjectId: doc._id,
          newObjectId: activity._id,
          metadata: { sourceHash: transformed.sourceHash },
        });
      }

      stats.mappedActivityCount += 1;
    }
  }

  stats.targetTaskCount = await getTaskModel().countDocuments({ isDeleted: false });
  stats.targetCommentCount = await getTaskCommentModel().countDocuments({ isDeleted: false });

  const { report, reportPath } = await finalizeMigrationStep(
    ctx.targetConnection,
    ctx.run,
    'tasks',
    stats,
    ctx
  );

  if (!ctx.dryRun && !options.skipRunComplete) {
    await completeMigrationRun(ctx.targetConnection, ctx.run._id, {
      status: stats.errorCount ? 'completed_with_errors' : 'completed',
      steps: [{
        entityType: 'tasks',
        status: stats.errorCount ? 'completed_with_errors' : 'completed',
        finishedAt: new Date(),
        sourceCount: stats.sourceTaskCount + stats.sourceCommentCount + stats.sourceActivityCount,
        insertedCount: stats.mappedTaskCount + stats.mappedCommentCount + stats.mappedActivityCount,
        skippedCount: stats.skippedCount,
        errorCount: stats.errorCount,
      }],
    });
  }

  return { ok: true, mode: ctx.mode, runId: String(ctx.run._id), reportPath, stats, report };
}

module.exports = { migrateTasks, createEmptyStats };
