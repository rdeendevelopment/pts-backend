const { getProjectAssignmentModel } = require('../models/projectAssignment.model');

async function listByProjectId(projectId, { includeDeleted = false, status = null } = {}) {
  const ProjectAssignment = getProjectAssignmentModel();
  const query = { projectId };
  if (!includeDeleted) query.isDeleted = false;
  if (status) query.status = status;
  return ProjectAssignment.find(query).sort({ createdAt: -1 }).exec();
}

async function findById(assignmentId, { projectId = null, includeDeleted = false } = {}) {
  const ProjectAssignment = getProjectAssignmentModel();
  const query = { _id: assignmentId };
  if (projectId) query.projectId = projectId;
  if (!includeDeleted) query.isDeleted = false;
  return ProjectAssignment.findOne(query).exec();
}

async function findByProjectAndUser(projectId, userId, { includeDeleted = false } = {}) {
  const ProjectAssignment = getProjectAssignmentModel();
  const query = { projectId, userId };
  if (!includeDeleted) query.isDeleted = false;
  return ProjectAssignment.findOne(query).exec();
}

async function createAssignment(payload) {
  const ProjectAssignment = getProjectAssignmentModel();
  return ProjectAssignment.create(payload);
}

async function updateAssignment(assignmentId, projectId, payload) {
  const ProjectAssignment = getProjectAssignmentModel();
  return ProjectAssignment.findOneAndUpdate(
    { _id: assignmentId, projectId, isDeleted: false },
    { $set: payload },
    { returnDocument: 'after', runValidators: true }
  ).exec();
}

async function softRemoveAssignment(assignmentId, projectId, { removedBy, updatedBy }) {
  const ProjectAssignment = getProjectAssignmentModel();
  return ProjectAssignment.findOneAndUpdate(
    { _id: assignmentId, projectId, isDeleted: false },
    {
      $set: {
        status: 'removed',
        isDeleted: true,
        deletedAt: new Date(),
        removedBy,
        removedAt: new Date(),
        updatedBy,
      },
    },
    { returnDocument: 'after' }
  ).exec();
}

async function countActiveMembers(projectId) {
  const ProjectAssignment = getProjectAssignmentModel();
  return ProjectAssignment.countDocuments({
    projectId,
    isDeleted: false,
    status: 'active',
  }).exec();
}

async function listActiveProjectIdsByUserId(userId) {
  const ProjectAssignment = getProjectAssignmentModel();
  const rows = await ProjectAssignment.find({
    userId,
    isDeleted: false,
    status: 'active',
  })
    .select('projectId')
    .lean();

  return [...new Set(rows.map((row) => row.projectId))];
}

async function listActiveMemberSummariesByProjectIds(projectIds = [], { sampleSize = 4 } = {}) {
  if (!projectIds.length) return new Map();

  const ProjectAssignment = getProjectAssignmentModel();
  const rows = await ProjectAssignment.aggregate([
    {
      $match: {
        projectId: { $in: projectIds },
        isDeleted: false,
        status: 'active',
      },
    },
    { $sort: { assignedAt: 1, createdAt: 1, _id: 1 } },
    {
      $lookup: {
        from: 'pts_users',
        localField: 'userId',
        foreignField: '_id',
        as: 'user',
      },
    },
    { $unwind: { path: '$user', preserveNullAndEmptyArrays: true } },
    {
      $group: {
        _id: '$projectId',
        totalMembers: { $sum: 1 },
        members: {
          $push: {
            id: '$user._id',
            userId: '$userId',
            firstName: '$user.firstName',
            lastName: '$user.lastName',
            displayName: '$user.displayName',
            email: '$user.email',
            avatarUrl: '$user.avatarUrl',
          },
        },
      },
    },
    {
      $project: {
        _id: 0,
        projectId: '$_id',
        totalMembers: 1,
        members: { $slice: ['$members', sampleSize] },
      },
    },
  ]);

  return new Map(rows.map((row) => [String(row.projectId), {
    totalMembers: Number(row.totalMembers || 0),
    members: (row.members || []).map((member) => ({
      id: member.id ? String(member.id) : String(member.userId || ''),
      userId: member.userId ? String(member.userId) : null,
      firstName: member.firstName || null,
      lastName: member.lastName || null,
      displayName: member.displayName || null,
      email: member.email || null,
      avatarUrl: member.avatarUrl || null,
    })),
  }]));
}

module.exports = {
  listByProjectId,
  findById,
  findByProjectAndUser,
  createAssignment,
  updateAssignment,
  softRemoveAssignment,
  countActiveMembers,
  listActiveProjectIdsByUserId,
  listActiveMemberSummariesByProjectIds,
};
