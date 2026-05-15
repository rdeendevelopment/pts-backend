#!/usr/bin/env node
// task-v2-copy-from-legacy.js
//
// One-time copy script: reads from the legacy task system and writes into the
// V2 collections (tasksV2, taskWorkflowsV2, etc.).
//
// What this does:
//   1. For each project that has tasks in the legacy system:
//      a. Calls getOrCreateProjectWorkflow (creates default workflow if missing)
//      b. Maps each unique legacy list name to the nearest V2 status by name
//      c. Copies each legacy task → tasksV2, preserving:
//         title, description, priority, dueDate, assignees, createdBy, createdAt
//      d. Copies embedded comments → taskCommentsV2
//   2. Skips tasks already copied (_id already exists in tasksV2)
//   3. Does NOT modify or delete any legacy data — pure read + insert
//
// Usage:
//   node scripts/task-v2-copy-from-legacy.js
//
// Safe to re-run — already-copied tasks are skipped.

'use strict';

require('dotenv').config();
const mongoose = require('mongoose');
const { connectMongo } = require('../config/mongo');

// Legacy models
const LegacyTask      = require('../src/app/MongoModels/task.model');
const LegacyList      = require('../src/app/MongoModels/list.model');
const { CoreProject } = require('../src/app/MongoModels');

// V2 models
const {
  TaskV2,
  TaskWorkflowV2,
  TaskWorkflowStatusV2,
  TaskCommentV2,
} = require('../src/app/Modules/task-v2/models');

const { getOrCreateProjectWorkflow } = require('../src/app/Modules/task-v2/services/workflow.service');

// Status name mapping: legacy list names → V2 status names (best-effort)
const STATUS_MAP = {
  'backlog':      'Backlog',
  'todo':         'Todo',
  'to do':        'Todo',
  'in progress':  'In Progress',
  'review':       'Review',
  'qa':           'QA',
  'done':         'Done',
  'completed':    'Done',
  'archived':     'Archived',
};

function mapListNameToStatus(listName, statuses) {
  const key = (listName || '').toLowerCase().trim();
  const mapped = STATUS_MAP[key];
  if (mapped) {
    const found = statuses.find((s) => s.name === mapped);
    if (found) return found;
  }
  // Fallback: find status whose name contains the list name
  const partial = statuses.find((s) => s.name.toLowerCase().includes(key));
  if (partial) return partial;
  // Default to Backlog
  return statuses.find((s) => s.name === 'Backlog') || statuses[0];
}

async function run() {
  await connectMongo();
  console.log('[task-v2-copy] Connected to MongoDB');

  const projects = await CoreProject.find({ isDeleted: false, isActive: true }).lean();
  console.log(`[task-v2-copy] Found ${projects.length} active projects`);

  let copied = 0;
  let skipped = 0;
  let commentsCopied = 0;

  for (const project of projects) {
    const projectSourceId = project.id || project.legacyId;
    if (!projectSourceId) continue;

    // Ensure workflow exists
    let workflow, statuses;
    try {
      ({ workflow, statuses } = await getOrCreateProjectWorkflow(projectSourceId));
    } catch (e) {
      console.warn(`[task-v2-copy] Could not get workflow for project ${projectSourceId}: ${e.message}`);
      continue;
    }

    // Load legacy tasks for this project (numeric legacy id lives on projectRef; some rows use CoreProject _id on projectId)
    const sid = Number(projectSourceId);
    const taskFilter = { $or: [{ 'projectRef.sourceId': sid }] };
    if (project._id) taskFilter.$or.push({ projectId: project._id });
    const legacyTasks = await LegacyTask.find(taskFilter).lean();
    if (!legacyTasks.length) continue;

    // Load lists (for name-based status mapping)
    const listIds = [...new Set(legacyTasks.map((t) => t.listId).filter(Boolean))];
    const lists = await LegacyList.find({ _id: { $in: listIds } }).lean();
    const listMap = Object.fromEntries(lists.map((l) => [String(l._id), l]));

    let order = 1024;
    for (const legacyTask of legacyTasks) {
      // Skip if already copied
      const exists = await TaskV2.countDocuments({
        'projectRef.sourceId': Number(projectSourceId),
        title: legacyTask.title,
        createdAt: legacyTask.createdAt,
      });
      if (exists) { skipped++; continue; }

      const list = legacyTask.listId ? listMap[String(legacyTask.listId)] : null;
      const targetStatus = mapListNameToStatus(list?.name, statuses);

      const assignees = (legacyTask.assigneeIds || []).map((id) => ({
        userId: String(id),
        assignedBy: String(legacyTask.createdBy || ''),
      }));

      const task = await TaskV2.create({
        projectRef:      { sourceId: Number(projectSourceId), sourceType: 'legacy' },
        workflowStatusId: targetStatus._id,
        workflowOrder:    order,
        title:            legacyTask.title || '(Untitled)',
        description:      legacyTask.description || '',
        priority:         legacyTask.priority || 'none',
        dueDate:          legacyTask.dueDate || null,
        startDate:        null,
        assignees,
        checklist: (legacyTask.checklist || []).map((item, idx) => {
          const text = String(item.text || item.title || '').trim() || '(Checklist item)';
          return {
            text,
            isCompleted: Boolean(item.isCompleted ?? item.isDone),
            order: typeof item.order === 'number' ? item.order : idx,
          };
        }),
        status:     legacyTask.isCompleted ? 'completed' : 'active',
        completedAt: legacyTask.isCompleted ? (legacyTask.updatedAt || new Date()) : null,
        createdBy:   String(legacyTask.createdBy || ''),
        createdAt:   legacyTask.createdAt || new Date(),
      });

      order += 1024;
      copied++;

      // Copy embedded comments
      const comments = legacyTask.comments || [];
      for (const c of comments) {
        if (!c.text && !c.message) continue;
        await TaskCommentV2.create({
          taskId:     task._id,
          projectRef: { sourceId: Number(projectSourceId), sourceType: 'legacy' },
          userId:     String(c.userId || c.user_id || legacyTask.createdBy || ''),
          text:       c.text || c.message || '',
          mentions:   [],
          createdAt:  c.createdAt || new Date(),
        });
        commentsCopied++;
      }
    }

    console.log(`[task-v2-copy] Project ${projectSourceId}: ${legacyTasks.length} tasks processed (${copied} new, ${skipped} skipped)`);
  }

  console.log(`\n[task-v2-copy] Done. Copied: ${copied} tasks, ${commentsCopied} comments. Skipped: ${skipped}`);
  await mongoose.disconnect();
}

run().catch((e) => {
  console.error('[task-v2-copy] Fatal error:', e);
  process.exit(1);
});
