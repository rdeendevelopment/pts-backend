const { Schema } = require('mongoose');
const { getV2Model } = require('../../../database/connection');

const PlanningHistorySchema = new Schema({
  plannedDate: { type: String, required: true },
  addedAt: { type: Date, required: true, default: Date.now },
  source: { type: String, enum: ['created', 'carried_forward', 'added_from_task'], required: true },
  carriedFromDate: { type: String, default: null },
  movedAt: { type: Date, default: null },
  movedBy: { type: Schema.Types.ObjectId, ref: 'PtsAccount', default: null },
  movedToDate: { type: String, default: null },
  statusAtDayEnd: { type: String, enum: ['pending', 'completed', 'moved_forward'], default: 'pending' },
  completedAt: { type: Date, default: null },
}, { _id: false });

const CompletionEventSchema = new Schema({
  completedAt: { type: Date, required: true },
  completedBy: { type: Schema.Types.ObjectId, ref: 'PtsAccount', required: true },
  plannedDate: { type: String, required: true },
  reopenedAt: { type: Date, default: null },
  reopenedBy: { type: Schema.Types.ObjectId, ref: 'PtsAccount', default: null },
}, { _id: false });

const TodoSchema = new Schema({
  title: { type: String, required: true, trim: true, maxlength: 300 },
  notes: { type: String, default: null, trim: true, maxlength: 5000 },
  status: { type: String, enum: ['pending', 'completed'], default: 'pending', index: true },
  priority: { type: String, enum: ['high', 'medium', 'low'], default: 'medium', index: true },
  priorityRank: { type: Number, enum: [1, 2, 3], default: 2 },
  todoDate: { type: String, required: true, index: true },
  firstPlannedDate: { type: String, required: true },
  currentPlannedDate: { type: String, required: true },
  planningHistory: { type: [PlanningHistorySchema], default: [] },
  carryForwardCount: { type: Number, default: 0, min: 0 },
  sourceType: { type: String, enum: ['personal', 'task'], required: true, default: 'personal' },
  completionEvents: { type: [CompletionEventSchema], default: [] },
  deadline: { type: Date, default: null, index: true },
  hasDeadline: { type: Boolean, default: false },
  reminderAt: { type: Date, default: null },
  projectId: { type: Schema.Types.ObjectId, ref: 'PtsProject', default: null, index: true },
  projectName: { type: String, default: '', trim: true },
  linkedTaskId: { type: Schema.Types.ObjectId, ref: 'PtsTask', default: null },
  createdBy: { type: Schema.Types.ObjectId, ref: 'PtsAccount', required: true, index: true },
  completedBy: { type: Schema.Types.ObjectId, ref: 'PtsAccount', default: null },
  completedAt: { type: Date, default: null },
  linkedTaskCompletionRequested: { type: Boolean, default: false },
  linkedTaskCompletionSucceeded: { type: Boolean, default: false },
  linkedTaskCompletedAt: { type: Date, default: null },
  isDeleted: { type: Boolean, default: false, index: true },
  deletedAt: { type: Date, default: null },
}, { collection: 'pts_todos', timestamps: true });

TodoSchema.index({ createdBy: 1, todoDate: 1, status: 1 });
TodoSchema.index({ createdBy: 1, currentPlannedDate: 1, status: 1, isDeleted: 1 });
TodoSchema.index({ createdBy: 1, firstPlannedDate: 1, isDeleted: 1 });
TodoSchema.index({ createdBy: 1, 'planningHistory.plannedDate': 1, isDeleted: 1 });
TodoSchema.index({ createdBy: 1, completedAt: 1, isDeleted: 1 });
TodoSchema.index({ createdBy: 1, sourceType: 1, isDeleted: 1 });
TodoSchema.index({ createdBy: 1, linkedTaskId: 1, isDeleted: 1 });
TodoSchema.index({ projectId: 1, todoDate: 1 });
TodoSchema.index({ isDeleted: 1, createdBy: 1, todoDate: 1 });
TodoSchema.index(
  { createdBy: 1, linkedTaskId: 1, todoDate: 1 },
  { unique: true, partialFilterExpression: { linkedTaskId: { $type: 'objectId' }, isDeleted: false }, name: 'uniq_active_linked_task_per_day' }
);

async function ensureTodoIndexes() {
  const model = getV2Model('PtsTodo', TodoSchema);
  await model.createIndexes();
  return model;
}

module.exports = { TodoSchema, ensureTodoIndexes, getTodoModel: () => getV2Model('PtsTodo', TodoSchema) };
