// Clean MongoDB schema — no legacy FK duplicates, proper types, embedded RBAC.
// Migration note: run scripts/migrate-schema.js once to convert existing documents.
const mongoose = require('mongoose');
const { Schema } = mongoose;

// Stable numeric ID for backward-compatible API responses (exposed as `id`).
const uid = { type: Number, required: true, index: true };
const ObjId = Schema.Types.ObjectId;

// ─── Auth ────────────────────────────────────────────────────────────────────

const AccountAdminSchema = new Schema(
  {
    legacyId:           uid,
    roleId:             { type: ObjId, ref: 'Role', default: null, index: true },
    type:               { type: String, default: 'super-admin', index: true },
    name:               { type: String, default: '' },
    email:              { type: String, default: '', lowercase: true, trim: true, index: true },
    password:           { type: String, default: '' },
    imageUrl:           { type: String, default: '' },
    forgotPasswordCode: { type: String, default: null },
    isDeleted:          { type: Boolean, default: false, index: true },
    isActive:           { type: Boolean, default: false, index: true },
    isVerified:         { type: Boolean, default: true },
    lastLogin:          { type: Date, default: null },
  },
  { collection: 'account_admins', timestamps: true }
);

const CoreUserSchema = new Schema(
  {
    legacyId:  uid,
    role:      { type: String, default: 'user' },
    roleId:    { type: ObjId, ref: 'Role', default: null, index: true },
    firstName: { type: String, default: '' },
    lastName:  { type: String, default: '' },
    userName:  { type: String, default: '', trim: true, index: true },
    email:     { type: String, default: '', lowercase: true, trim: true, index: true },
    contact:   { type: String, default: '' },
    password:  { type: String, default: '' },
    imageUrl:  { type: String, default: '' },
    mustChangePassword: { type: Boolean, default: false, index: true },
    isActive:  { type: Boolean, default: false, index: true },
    isDeleted: { type: Boolean, default: false, index: true },
    isVerified:{ type: Boolean, default: true },
    lastLogin: { type: Date, default: null },
  },
  { collection: 'users', timestamps: true }
);

// Refresh tokens — no legacy user ID; link via MongoDB ObjectId.
const RefreshTokenSchema = new Schema(
  {
    legacyId:  uid,
    userId:    { type: ObjId, default: null, index: true }, // ref CoreUser or AccountAdmin
    userType:  { type: String, enum: ['admin', 'user'], default: 'user', index: true },
    tokenHash: { type: String, required: true, unique: true },
    expiresAt: { type: Date, required: true },
    revokedAt: { type: Date, default: null },
  },
  { collection: 'refresh_tokens', timestamps: true }
);

// ─── RBAC ────────────────────────────────────────────────────────────────────
// Permissions and modules are embedded into Role — no junction collections.

const RoleSchema = new Schema(
  {
    legacyId:      uid,
    name:          { type: String, required: true, unique: true },
    permissionIds: { type: [ObjId], ref: 'Permission', default: [] },
    moduleIds:     { type: [ObjId], ref: 'CoreModule', default: [] },
  },
  { collection: 'roles', timestamps: true }
);

const CoreModuleSchema = new Schema(
  {
    legacyId: uid,
    keyName:  { type: String, required: true, unique: true },
    name:     { type: String, required: true },
    isActive: { type: Boolean, default: true },
  },
  { collection: 'modules', timestamps: true }
);

const PermissionSchema = new Schema(
  {
    legacyId:    uid,
    keyName:     { type: String, required: true, unique: true },
    name:        { type: String, required: true },
    description: { type: String, default: null },
  },
  { collection: 'permissions', timestamps: true }
);

// ─── Clients ─────────────────────────────────────────────────────────────────

const CoreClientSchema = new Schema(
  {
    legacyId:    uid,
    firstName:   { type: String, default: '' },
    lastName:    { type: String, default: '' },
    companyName: { type: String, default: '', trim: true, index: true },
    type:        { type: String, default: '' },
    email:       { type: String, default: '', lowercase: true, trim: true, index: true },
    contact:     { type: String, default: '' },
    isActive:    { type: Boolean, default: true, index: true },
    isDeleted:   { type: Boolean, default: false, index: true },
  },
  { collection: 'clients', timestamps: true }
);

// ─── Projects ────────────────────────────────────────────────────────────────

const CoreProjectSchema = new Schema(
  {
    legacyId:                 uid,
    title:                    { type: String, default: '', trim: true, index: true },
    clientId:                 { type: ObjId, ref: 'CoreClient', default: null, index: true },
    detail:                   { type: String, default: '' },
    notes:                    { type: String, default: '' },
    isRetain:                 { type: Boolean, default: false },
    projectType:              { type: String, default: 'fixed_hours', index: true },
    retainerHoursPerMonth:    { type: Number, default: null },
    retainerRenewalDay:       { type: Number, default: null },
    autoCreateMonthlyBudget:  { type: Boolean, default: false },
    allowBudgetExceed:        { type: Boolean, default: true },
    budgetAmount:             { type: Number, default: null },
    estimatedHours:           { type: Number, default: null },
    extraHours:               { type: Number, default: null },
    nextSteps:                { type: [Schema.Types.Mixed], default: [] },
    deadline:                 { type: Date, default: null },
    status:                   { type: String, default: 'pending', index: true },
    isActive:                 { type: Boolean, default: true, index: true },
    isDeleted:                { type: Boolean, default: false, index: true },
  },
  { collection: 'projects', timestamps: true }
);

// Members assigned to a project — single source of truth.
const ProjectAssignmentSchema = new Schema(
  {
    legacyId:      uid,
    legacyProjectId:{ type: Number, required: true, index: true },
    legacyUserId:  { type: Number, required: true, index: true },
    projectId:     { type: ObjId, ref: 'CoreProject', required: true, index: true },
    userId:        { type: ObjId, ref: 'CoreUser', required: true, index: true },
    assignDate:    { type: Date, default: null },
    unassignDate:  { type: Date, default: null },
    status:        { type: String, default: 'assigned', index: true },
    isDeleted:     { type: Boolean, default: false, index: true },
    hoursCapMinutes: { type: Number, default: null },
    capPeriod:     { type: String, default: 'none' },
    assignedRole:  { type: String, default: null },
    assignedAt:    { type: Date, default: null },
  },
  { collection: 'project_assignments', timestamps: true }
);

ProjectAssignmentSchema.index({ projectId: 1, userId: 1 });

const ProjectRequestSchema = new Schema(
  {
    legacyId:           uid,
    projectId:          { type: ObjId, ref: 'CoreProject', required: true, index: true },
    userId:             { type: ObjId, ref: 'CoreUser', required: true, index: true },
    type:               { type: String, default: '' },
    detail:             { type: String, default: '' },
    hours:              { type: String, default: '' },
    projectOldDeadline: { type: Date, default: null },
    projectNewDeadline: { type: Date, default: null },
    status:             { type: String, default: '', index: true },
    isAllocateHours:    { type: Boolean, default: false },
    isApproved:         { type: Boolean, default: false },
    isDeleted:          { type: Boolean, default: false, index: true },
  },
  { collection: 'project_requests', timestamps: true }
);

// Polymorphic attachment — linkId now a proper parent ref.
const CoreAttachmentSchema = new Schema(
  {
    legacyId:   uid,
    parentId:   { type: ObjId, default: null, index: true }, // task, project, etc.
    parentType: { type: String, default: '', index: true },   // 'task' | 'project'
    title:      { type: String, default: '' },
    url:        { type: String, default: '' },
    mimeType:   { type: String, default: '' },
    size:       { type: String, default: '' },
    isDeleted:  { type: Boolean, default: false, index: true },
  },
  { collection: 'attachments', timestamps: true }
);

CoreAttachmentSchema.index({ parentId: 1, parentType: 1 });

// ─── Budgets ─────────────────────────────────────────────────────────────────

const ProjectBudgetSchema = new Schema(
  {
    legacyId:               uid,
    projectId:              { type: ObjId, ref: 'CoreProject', required: true, index: true },
    name:                   { type: String, required: true },
    description:            { type: String, default: null },
    budgetType:             { type: String, default: 'fixed', index: true },
    billingType:            { type: String, default: 'billable' },
    allocatedMinutes:       { type: Number, default: null },
    consumedMinutes:        { type: Number, default: 0 },
    startDate:              { type: Date, default: null },
    endDate:                { type: Date, default: null },
    allowExceed:            { type: Boolean, default: true },
    warningThresholdPercent:{ type: Number, default: 80 },
    status:                 { type: String, default: 'active', index: true },
    createdBy:              { type: ObjId, default: null }, // ref CoreUser or AccountAdmin
    approvedBy:             { type: ObjId, default: null },
    approvedAt:             { type: Date, default: null },
  },
  { collection: 'project_budgets', timestamps: true }
);

ProjectBudgetSchema.index({ projectId: 1, status: 1 });

const ProjectBudgetRequestSchema = new Schema(
  {
    legacyId:         uid,
    projectId:        { type: ObjId, ref: 'CoreProject', required: true, index: true },
    budgetId:         { type: ObjId, ref: 'ProjectBudget', default: null, index: true },
    requestedBy:      { type: ObjId, required: true }, // ref CoreUser
    requestType:      { type: String, required: true },
    title:            { type: String, required: true },
    description:      { type: String, default: null },
    requestedMinutes: { type: Number, required: true },
    status:           { type: String, default: 'pending', index: true },
    reviewedBy:       { type: ObjId, default: null },
    reviewedAt:       { type: Date, default: null },
  },
  { collection: 'project_budget_requests', timestamps: true }
);

ProjectBudgetRequestSchema.index({ projectId: 1, status: 1 });

// ─── Time tracking ───────────────────────────────────────────────────────────

const ActivityCategorySchema = new Schema(
  {
    legacyId:    uid,
    name:        { type: String, required: true, trim: true, index: true },
    description: { type: String, default: null },
    isActive:    { type: Boolean, default: true, index: true },
  },
  { collection: 'activity_categories', timestamps: true }
);

// One record per user per week — tracks submission/approval lifecycle.
const TimeWeekSchema = new Schema(
  {
    legacyId:        uid,
    userId:          { type: ObjId, ref: 'CoreUser', required: true, index: true },
    weekStartDate:   { type: Date, required: true, index: true },
    weekEndDate:     { type: Date, required: true },
    totalMinutes:    { type: Number, default: 0 },
    status:          { type: String, enum: ['draft', 'submitted', 'approved', 'rejected'], default: 'draft', index: true },
    submittedAt:     { type: Date, default: null },
    approvedBy:      { type: ObjId, default: null }, // ref CoreUser or AccountAdmin
    approvedAt:      { type: Date, default: null },
    rejectionReason: { type: String, default: null },
  },
  { collection: 'time_weeks', timestamps: true }
);

TimeWeekSchema.index({ userId: 1, weekStartDate: 1 }, { unique: true });

// Individual time log — one row per session/manual entry.
const TimeEntrySchema = new Schema(
  {
    legacyId:           uid,
    userId:             { type: ObjId, ref: 'CoreUser', required: true, index: true },
    projectId:          { type: ObjId, ref: 'CoreProject', required: true, index: true },
    weekId:             { type: ObjId, ref: 'TimeWeek', default: null, index: true },
    budgetId:           { type: ObjId, ref: 'ProjectBudget', default: null, index: true },
    taskId:             { type: ObjId, ref: 'Task', default: null, index: true },
    activityCategoryId: { type: ObjId, ref: 'ActivityCategory', default: null, index: true },
    entryDate:          { type: Date, required: true, index: true },
    startTime:          { type: Date, default: null },
    endTime:            { type: Date, default: null },
    durationMinutes:    { type: Number, default: 0 },
    description:        { type: String, default: null },
    entryType:          { type: String, enum: ['manual', 'clock', 'add-activity'], default: 'manual' },
    status:             { type: String, enum: ['draft', 'submitted', 'approved', 'rejected'], default: 'draft', index: true },
    isBillable:         { type: Boolean, default: true },
  },
  { collection: 'time_entries', timestamps: true }
);

TimeEntrySchema.index({ userId: 1, entryDate: 1 });
TimeEntrySchema.index({ userId: 1, weekId: 1 });

// Exactly one running timer per user at a time.
const ActiveTimerSchema = new Schema(
  {
    legacyId:           uid,
    userId:             { type: ObjId, ref: 'CoreUser', required: true, index: true },
    projectId:          { type: ObjId, ref: 'CoreProject', required: true, index: true },
    budgetId:           { type: ObjId, ref: 'ProjectBudget', default: null },
    taskId:             { type: ObjId, ref: 'Task', default: null },
    activityCategoryId: { type: ObjId, ref: 'ActivityCategory', default: null },
    startTime:          { type: Date, required: true },
    isRunning:          { type: Boolean, default: true, index: true },
    isBillable:         { type: Boolean, default: true },
  },
  { collection: 'active_timers', timestamps: true }
);

ActiveTimerSchema.index({ userId: 1, isRunning: 1 });

// ─── Legacy weekly-aggregate tracking (Add Activity screen) ──────────────────
// DailyNote is embedded as WorkingHours.notes[] — no separate collection.

const WorkingHoursDailyNoteSchema = new Schema(
  {
    dayOfWeek: { type: String, enum: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'], required: true },
    note:      { type: String, default: null },
  },
  { _id: false }
);

const WorkingHoursSchema = new Schema(
  {
    legacyId:    uid,
    projectId:   { type: ObjId, ref: 'CoreProject', default: null, index: true },
    userId:      { type: ObjId, ref: 'CoreUser', required: true, index: true },
    taskId:      { type: ObjId, ref: 'Task', default: null },
    weekEnding:  { type: Date, default: null, index: true },
    mon:         { type: Number, default: null },
    tue:         { type: Number, default: null },
    wed:         { type: Number, default: null },
    thu:         { type: Number, default: null },
    fri:         { type: Number, default: null },
    sat:         { type: Number, default: null },
    sun:         { type: Number, default: null },
    total:       { type: Number, default: null },
    verified:    { type: Boolean, default: false },
    submit:      { type: Boolean, default: false },
    approvedDate:{ type: Date, default: null },
    isDeleted:   { type: Boolean, default: false, index: true },
    notes:       { type: [WorkingHoursDailyNoteSchema], default: [] },
  },
  { collection: 'working_hours', timestamps: true }
);

WorkingHoursSchema.index({ userId: 1, weekEnding: 1 });
WorkingHoursSchema.index({ projectId: 1, userId: 1, weekEnding: 1 });

// ─── Indexes ─────────────────────────────────────────────────────────────────

CoreProjectSchema.index({ status: 1, isDeleted: 1 });

// ─── Models ──────────────────────────────────────────────────────────────────

module.exports = {
  AccountAdmin:          mongoose.models.AccountAdmin          || mongoose.model('AccountAdmin',          AccountAdminSchema),
  CoreUser:              mongoose.models.CoreUser              || mongoose.model('CoreUser',              CoreUserSchema),
  CoreClient:            mongoose.models.CoreClient            || mongoose.model('CoreClient',            CoreClientSchema),
  CoreProject:           mongoose.models.CoreProject           || mongoose.model('CoreProject',           CoreProjectSchema),
  ProjectAssignment:     mongoose.models.ProjectAssignment     || mongoose.model('ProjectAssignment',     ProjectAssignmentSchema),
  CoreAttachment:        mongoose.models.CoreAttachment        || mongoose.model('CoreAttachment',        CoreAttachmentSchema),
  CoreProjectRequest:    mongoose.models.CoreProjectRequest    || mongoose.model('CoreProjectRequest',    ProjectRequestSchema),
  ActivityCategory:      mongoose.models.ActivityCategory      || mongoose.model('ActivityCategory',      ActivityCategorySchema),
  TimeWeek:              mongoose.models.TimeWeek              || mongoose.model('TimeWeek',              TimeWeekSchema),
  TimeEntry:             mongoose.models.TimeEntry             || mongoose.model('TimeEntry',             TimeEntrySchema),
  ActiveTimer:           mongoose.models.ActiveTimer           || mongoose.model('ActiveTimer',           ActiveTimerSchema),
  ProjectBudget:         mongoose.models.ProjectBudget         || mongoose.model('ProjectBudget',         ProjectBudgetSchema),
  ProjectBudgetRequest:  mongoose.models.ProjectBudgetRequest  || mongoose.model('ProjectBudgetRequest',  ProjectBudgetRequestSchema),
  WorkingHours:          mongoose.models.WorkingHours          || mongoose.model('WorkingHours',          WorkingHoursSchema),
  Role:                  mongoose.models.Role                  || mongoose.model('Role',                  RoleSchema),
  CoreModule:            mongoose.models.CoreModule            || mongoose.model('CoreModule',            CoreModuleSchema),
  Permission:            mongoose.models.Permission            || mongoose.model('Permission',            PermissionSchema),
  RefreshToken:          mongoose.models.RefreshToken          || mongoose.model('RefreshToken',          RefreshTokenSchema),
};
