/**
 * Request shape reference for Daily Flow goals.
 */
module.exports = {
  dayKey: 'YYYY-MM-DD',
  type: 'work | personal',
  title: 'required string',
  description: 'optional string',
  status: 'pending | in_progress | completed | skipped | deferred',
  isPrivate: 'boolean — defaults true for personal goals',
  sortOrder: 'optional number',
};
