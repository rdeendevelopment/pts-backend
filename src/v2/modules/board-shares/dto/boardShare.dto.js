function toBoardShareDto(doc) {
  if (!doc) return null;
  const row = doc.toObject ? doc.toObject() : doc;

  return {
    id: String(row._id),
    clientId: String(row.clientId),
    projectIds: (row.projectIds || []).map((id) => String(id)),
    role: row.role,
    status: row.status,
    expiresAt: row.expiresAt || null,
    createdBy: row.createdBy ? String(row.createdBy) : null,
    revokedAt: row.revokedAt || null,
    revokedBy: row.revokedBy ? String(row.revokedBy) : null,
    createdAt: row.createdAt || null,
    updatedAt: row.updatedAt || null,
  };
}

function toSharedProjectListItem(project, share) {
  if (!project) return null;
  const row = project.toObject ? project.toObject() : project;
  return {
    id: String(row._id),
    name: row.name || '',
    status: row.status,
    isActive: !['archived', 'cancelled', 'completed'].includes(String(row.status || '').toLowerCase()),
    updatedAt: row.updatedAt || null,
    shareRole: share?.role || null,
    clientId: share?.clientId ? String(share.clientId) : null,
  };
}

module.exports = {
  toBoardShareDto,
  toSharedProjectListItem,
};
