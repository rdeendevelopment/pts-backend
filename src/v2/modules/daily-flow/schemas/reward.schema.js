/**
 * Request shape reference for Daily Flow rewards.
 */
module.exports = {
  dayKey: 'YYYY-MM-DD',
  type: 'consistency | goal_completion | team_support | healthy_habit | custom',
  label: 'required when type is custom',
  description: 'optional string',
  status: 'earned | revoked',
};
