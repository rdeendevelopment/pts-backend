/**
 * Request shape reference for Daily Flow catchups.
 */
module.exports = {
  dayKey: 'YYYY-MM-DD',
  type: 'need_to_discuss | need_help | waiting_for | idea | reminder',
  title: 'required string',
  description: 'optional string',
  status: 'open | done | archived',
  withAccountId: 'optional ObjectId string',
};
