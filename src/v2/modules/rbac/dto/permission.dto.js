function toPermissionDto(permissionDoc) {
  if (!permissionDoc) return null;
  const row = permissionDoc.toObject ? permissionDoc.toObject() : permissionDoc;

  return {
    id: String(row._id),
    module_id: String(row.moduleId),
    key: row.key,
    name: row.name,
    description: row.description || '',
    category: row.category,
    status: row.status,
    is_system: Boolean(row.isSystem),
    created_at: row.createdAt || null,
    updated_at: row.updatedAt || null,
  };
}

module.exports = {
  toPermissionDto,
};
