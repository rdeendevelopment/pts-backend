const ProjectMember = require('../../MongoModels/project_member.model');
const { ProjectAssignment, CoreProject, CoreUser } = require('../../MongoModels');

async function syncProjectMembers(projectSourceId) {
  const project = await CoreProject.findOne({ legacyId: Number(projectSourceId), isDeleted: false }, { _id: 1, legacyId: 1 }).lean();
  if (!project) return;

  const rows = await ProjectAssignment.find({
    legacyProjectId: Number(projectSourceId),
    status: 'assigned',
    isDeleted: false,
  }).lean();

  const legacyUserIds = [...new Set(rows.map((r) => Number(r.legacyUserId)).filter(Boolean))];
  const users = legacyUserIds.length
    ? await CoreUser.find({ legacyId: { $in: legacyUserIds }, isDeleted: false }, { _id: 1, legacyId: 1 }).lean()
    : [];
  const userObjectIdMap = new Map(users.map((u) => [Number(u.legacyId), u._id]));

  for (const row of rows) {
    const userObjectId = userObjectIdMap.get(Number(row.legacyUserId));
    if (!userObjectId) continue;

    await ProjectMember.findOneAndUpdate(
      {
        projectId: project._id,
        userId: userObjectId,
      },
      {
        $set: {
          projectId: project._id,
          'projectRef.sourceId': Number(projectSourceId),
          'projectRef.sourceType': 'mongodb',
          userId: userObjectId,
          role: 'member',
          addedBy: userObjectId,
          addedAt: row.legacyCreatedAt || new Date(),
          isActive: true,
        },
      },
      { upsert: true, new: true }
    );
  }

  const activeObjectIds = users.map((u) => u._id);
  if (activeObjectIds.length > 0) {
    await ProjectMember.updateMany(
      {
        projectId: project._id,
        userId: { $nin: activeObjectIds },
      },
      { $set: { isActive: false } }
    );
  } else {
    await ProjectMember.updateMany({ projectId: project._id }, { $set: { isActive: false } });
  }
}

async function syncAllProjects() {
  const projectIds = await ProjectAssignment.distinct('legacyProjectId');
  for (const projectId of projectIds) await syncProjectMembers(projectId);
}

async function getProjectMembers(projectSourceId) {
  await syncProjectMembers(projectSourceId);
  return ProjectMember.find({ 'projectRef.sourceId': Number(projectSourceId), isActive: true }).lean();
}

async function isProjectMember(userId, projectSourceId) {
  await syncProjectMembers(projectSourceId);
  const member = await ProjectMember.findOne({
    'projectRef.sourceId': Number(projectSourceId),
    userId,
    isActive: true,
  }).lean();
  return !!member;
}

module.exports = { syncProjectMembers, syncAllProjects, getProjectMembers, isProjectMember };
