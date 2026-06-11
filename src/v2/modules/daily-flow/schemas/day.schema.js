/**
 * Request shape reference for Daily Flow day records.
 * Validation rules live in validators/dailyFlow.validators.js.
 */
module.exports = {
  dayKey: 'YYYY-MM-DD',
  timezone: 'IANA timezone string',
  status: 'draft | active | completed',
  moodMorning: '1-5',
  moodEvening: '1-5',
  energyMorning: '1-5',
  energyEvening: '1-5',
  notes: 'optional string',
};
