function toModuleDto(moduleDoc) {
  if (!moduleDoc) return null;
  const row = moduleDoc.toObject ? moduleDoc.toObject() : moduleDoc;

  return {
    id: String(row._id),
    key: row.key,
    name: row.name,
    description: row.description || '',
    category: row.category,
    status: row.status,
    sort_order: row.sortOrder,
    icon: row.icon || null,
    route_base: row.routeBase || null,
    is_system: Boolean(row.isSystem),
    created_at: row.createdAt || null,
    updated_at: row.updatedAt || null,
  };
}

/** Minimal shape for auth session responses. */
function toSessionModuleDto(moduleDoc) {
  if (!moduleDoc) return null;
  const row = moduleDoc.toObject ? moduleDoc.toObject() : moduleDoc;

  return {
    id: String(row._id),
    key: row.key,
    name: row.name,
    status: row.status,
  };
}

module.exports = {
  toModuleDto,
  toSessionModuleDto,
};
