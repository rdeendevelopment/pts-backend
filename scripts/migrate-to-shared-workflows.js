#!/usr/bin/env node
// migrate-to-shared-workflows.js
//
// Safe, idempotent migration from per-user task lists to shared project workflows.
//
// What this script does:
//   1. For each project that has tasks in the old system:
//      a. Creates a TaskWorkflow (if not already created)
//      b. Maps each unique list NAME to a TaskWorkflowStatus (reusing existing if matching)
//      c. For each task:
//         - Reads the task's most recent task_placement to find which list it was last in
//         - Sets task.workflowStatusId = matching TaskWorkflowStatus
//         - Sets task.workflowOrder   = calculated order within that status
//         - Sets task.legacyListId    = the old list._id
//         - Sets task.migratedToV2   = true
//   2. Skips tasks already migrated (migratedToV2 === true)
//   3. Does NOT delete any old data (task_placements, lists stay intact)
//   4. Migrates embedded comments → task_comments collection
//   5. Migrates embedded logs     → task_activities collection
//
// Run once on deploy:
//   node scripts/migrate-to-shared-workflows.js
//
// Safe to re-run — already-migrated tasks are skipped.

'use strict';

require('dotenv').config();
const mongoose = require('mongoose');
const { connectMongo } = require('../config/mongo');

// Models — require after Mongo is connected
let Task, TaskPlacement, List, WorkspaceNode, CoreProject, ProjectMember;
let TaskWorkflow, TaskWorkflowStatus, TaskComment, TaskActivity;

// Map old list names to canonical workflow status names and metadata.
// Fuzzy matching allows slight spelling differences in existing data.
const STATUS_MAP = [
  { patterns: ['backlog', 'back log'],                         name: 'Backlog',     color: '#94A3B8', icon: 'ri-inbox-line',                order: 0,    isTerminal: false, category: 'not_started' },
  { patterns: ['inbox', 'to do', 'todo', 'new', 'open'],      name: 'Todo',        color: '#3B82F6', icon: 'ri-checkbox-blank-circle-line', order: 1024, isTerminal: false, category: 'not_started' },
  { patterns: ['in progress', 'inprogress', 'working', 'wip', 'doing', 'active'], name: 'In Progress', color: '#F59E0B', icon: 'ri-loader-4-line', order: 2048, isTerminal: false, category: 'active' },
  { patterns: ['review', 'in review', 'code review', 'pr review'], name: 'Review',  color: '#8B5CF6', icon: 'ri-eye-line',                 order: 3072, isTerminal: false, category: 'active'      },
  { patterns: ['qa', 'testing', 'test', 'verification'],       name: 'QA',          color: '#EC4899', icon: 'ri-bug-line',                  order: 4096, isTerminal: false, category: 'active'      },
  { patterns: ['done', 'complete', 'completed', 'finished', 'closed'], name: 'Done', color: '#10B981', icon: 'ri-checkbox-circle-line',    order: 5120, isTerminal: true,  category: 'done'        },
  { patterns: ['archived', 'archive'],                         name: 'Archived',    color: '#64748B', icon: 'ri-archive-line',              order: 6144, isTerminal: false, category: 'cancelled'   },
];

function matchStatusTemplate(listName) {
  const normalised = String(listName || '').trim().toLowerCase();
  for (const template of STATUS_MAP) {
    if (template.patterns.some((p) => normalised === p || normalised.includes(p))) {
      return template;
    }
  }
  // Default unmapped lists to "In Progress"
  return STATUS_MAP[2];
}

async function getOrCreateWorkflow(project) {
  const existing = await TaskWorkflow.findOne({
    'projectRef.sourceId': project.legacyId,
    isDefault: true,
    isActive: true,
  }).lean();
  if (existing) return existing;

  const wf = await TaskWorkflow.create({
    projectId:               project._id,
    'projectRef.sourceId':   project.legacyId,
    'projectRef.sourceType': 'mongodb',
    name:      'Default Workflow',
    isDefault: true,
    isActive:  true,
  });
  console.log(`  [workflow] created for project ${project.legacyId} (${project.title})`);
  return wf.toObject ? wf.toObject() : wf;
}

// Returns a map of listName.toLowerCase() → TaskWorkflowStatus document
async function ensureWorkflowStatuses(workflow, uniqueListNames) {
  const existing = await TaskWorkflowStatus.find({ workflowId: workflow._id }).lean();
  const statusByName = {};
  existing.forEach((s) => { statusByName[s.name.toLowerCase()] = s; });

  for (const listName of uniqueListNames) {
    const template = matchStatusTemplate(listName);
    const key = template.name.toLowerCase();

    if (!statusByName[key]) {
      const created = await TaskWorkflowStatus.create({
        workflowId:              workflow._id,
        projectId:               workflow.projectId,
        'projectRef.sourceId':   workflow['projectRef.sourceId'] || workflow.projectRef?.sourceId,
        'projectRef.sourceType': 'mongodb',
        name:        template.name,
        color:       template.color,
        icon:        template.icon,
        order:       template.order,
        isTerminal:  template.isTerminal,
        category:    template.category,
      });
      statusByName[key] = created.toObject ? created.toObject() : created;
      console.log(`    [status] created "${template.name}" for workflow ${workflow._id}`);
    }
  }

  return statusByName;
}

async function migrateComments(task) {
  if (!Array.isArray(task.comments) || !task.comments.length) return;

  for (const comment of task.comments) {
    const alreadyMigrated = await TaskComment.findOne({ legacyCommentId: String(comment.id || comment._id) }).lean();
    if (alreadyMigrated) continue;

    await TaskComment.create({
      taskId:          task._id,
      projectId:       task.projectId || null,
      'projectRef.sourceId':   task.projectRef?.sourceId || null,
      'projectRef.sourceType': 'mongodb',
      userId:          comment.userId,
      text:            comment.text || '',
      mentions:        Array.isArray(comment.mentions) ? comment.mentions : [],
      isEdited:        Boolean(comment.isEdited),
      editedAt:        comment.editedAt || null,
      isDeleted:       Boolean(comment.isDeleted),
      deletedAt:       comment.deletedAt || null,
      deletedBy:       comment.deletedBy || null,
      legacyCommentId: String(comment.id || comment._id || ''),
      createdAt:       comment.createdAt || new Date(),
    });
  }
}

async function migrateLogs(task) {
  if (!Array.isArray(task.logs) || !task.logs.length) return;

  for (const log of task.logs) {
    const logId = String(log._id || log.id || '');
    if (logId) {
      const exists = await TaskActivity.findOne({ 'meta.legacyLogId': logId }).lean();
      if (exists) continue;
    }

    await TaskActivity.create({
      taskId:      task._id,
      projectId:   task.projectId || null,
      'projectRef.sourceId':   task.projectRef?.sourceId || null,
      'projectRef.sourceType': 'mongodb',
      action:      log.action || 'updated',
      performedBy: log.performedBy,
      meta:        { ...(log.meta || {}), legacyLogId: logId },
      createdAt:   log.timestamp || new Date(),
    });
  }
}

async function migrateProject(project) {
  console.log(`\n[project] Migrating: ${project.title} (legacyId: ${project.legacyId})`);

  // Find all tasks for this project that are NOT yet migrated
  const tasks = await Task.find({
    'projectRef.sourceId': project.legacyId,
    migratedToV2:          { $ne: true },
    status:                { $ne: 'archived' },
  }).lean();

  if (!tasks.length) {
    console.log('  No unmigrated tasks found, skipping.');
    return { migrated: 0, skipped: 0 };
  }

  console.log(`  Found ${tasks.length} tasks to migrate`);

  // Collect all list IDs used by placements for these tasks
  const taskIds = tasks.map((t) => t._id);
  const placements = await TaskPlacement.find({ taskId: { $in: taskIds } }).lean();
  const latestPlacement = {};
  for (const p of placements) {
    const tid = String(p.taskId);
    if (!latestPlacement[tid] || p.placedAt > latestPlacement[tid].placedAt) {
      latestPlacement[tid] = p;
    }
  }

  // Collect unique list IDs
  const listIds = [...new Set(Object.values(latestPlacement).map((p) => String(p.listId)))];
  const lists = await List.find({ _id: { $in: listIds } }).lean();
  const listById = {};
  lists.forEach((l) => { listById[String(l._id)] = l; });

  const uniqueListNames = [...new Set(lists.map((l) => l.name))];

  // Create/find workflow and statuses
  const workflow = await getOrCreateWorkflow(project);
  const statusByName = await ensureWorkflowStatuses(workflow, uniqueListNames);

  // orderCounters tracks next order within each status
  const orderCounters = {};

  let migrated = 0;
  let skipped  = 0;

  for (const task of tasks) {
    try {
      const placement = latestPlacement[String(task._id)];
      const list = placement ? listById[String(placement.listId)] : null;

      let targetStatus;
      if (list) {
        const template = matchStatusTemplate(list.name);
        targetStatus = statusByName[template.name.toLowerCase()];
      } else {
        // No placement found — put in Todo
        targetStatus = statusByName['todo'] || Object.values(statusByName)[1];
      }

      if (!targetStatus) {
        console.warn(`  [warn] No status found for task ${task._id}, skipping`);
        skipped++;
        continue;
      }

      const statusKey = String(targetStatus._id);
      if (!orderCounters[statusKey]) orderCounters[statusKey] = 1024;
      const order = orderCounters[statusKey];
      orderCounters[statusKey] += 1024;

      await Task.updateOne(
        { _id: task._id },
        {
          $set: {
            workflowStatusId: targetStatus._id,
            workflowOrder:    order,
            legacyListId:     placement?.listId || null,
            migratedToV2:     true,
          },
        }
      );

      await migrateComments(task);
      await migrateLogs(task);

      migrated++;
    } catch (err) {
      console.error(`  [error] Task ${task._id}: ${err.message}`);
      skipped++;
    }
  }

  console.log(`  Done: ${migrated} migrated, ${skipped} skipped`);
  return { migrated, skipped };
}

async function run() {
  console.log('=== migrate-to-shared-workflows ===\n');

  await connectMongo();
  console.log('Connected to MongoDB\n');

  // Require models after connection is established
  Task              = require('../src/app/MongoModels/task.model');
  TaskPlacement     = require('../src/app/MongoModels/task_placement.model');
  List              = require('../src/app/MongoModels/list.model');
  WorkspaceNode     = require('../src/app/MongoModels/workspace_node.model');
  ({ CoreProject, ProjectMember } = require('../src/app/MongoModels'));

  const models      = require('../src/app/Modules/task-v2/models');
  TaskWorkflow      = models.TaskWorkflow;
  TaskWorkflowStatus= models.TaskWorkflowStatus;
  TaskComment       = models.TaskComment;
  TaskActivity      = models.TaskActivity;

  // Get all active projects that have tasks
  const projectsWithTasks = await Task.distinct('projectRef.sourceId', {
    migratedToV2:           { $ne: true },
    'projectRef.sourceId':  { $ne: null },
    status:                 { $ne: 'archived' },
  });

  console.log(`Found ${projectsWithTasks.length} projects with un-migrated tasks\n`);

  const projects = await CoreProject.find({
    legacyId:  { $in: projectsWithTasks.map(Number) },
    isDeleted: false,
  }).lean();

  let totalMigrated = 0;
  let totalSkipped  = 0;

  for (const project of projects) {
    const { migrated, skipped } = await migrateProject(project);
    totalMigrated += migrated;
    totalSkipped  += skipped;
  }

  console.log(`\n=== Migration complete ===`);
  console.log(`Total migrated: ${totalMigrated}`);
  console.log(`Total skipped:  ${totalSkipped}`);
  console.log(`\nNext steps:`);
  console.log(`  1. Verify task data in MongoDB Compass or via API`);
  console.log(`  2. Enable the 'shared_workflows' module in /api/modules-management`);
  console.log(`  3. Test the board for a migrated project`);
  console.log(`  4. Old task_placements and lists collections remain untouched as backup`);

  await mongoose.disconnect();
  process.exit(0);
}

run().catch((err) => {
  console.error('\nMigration FAILED:', err);
  process.exit(1);
});
