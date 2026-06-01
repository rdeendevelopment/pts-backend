/**
 * Legacy Task V2 used numeric projectRef.sourceId (CoreProject.legacyId).
 * v2 Tasks use pts_projects._id only in public APIs.
 *
 * TODO(data-migration): When importing legacy tasksV2 rows, map sourceId → pts_projects._id
 * via an explicit migration table or legacyId field on pts_projects.
 * Do NOT add silent runtime fallback here.
 */

function assertNoLegacyProjectRef(payload = {}) {
  if (payload.projectRef?.sourceId != null || payload.project_source_id != null) {
    const err = new Error('Legacy projectRef.sourceId is not supported in v2 Tasks API');
    err.code = 'TASK_LEGACY_MAPPING_REQUIRED';
    return err;
  }
  return null;
}

module.exports = {
  assertNoLegacyProjectRef,
};
