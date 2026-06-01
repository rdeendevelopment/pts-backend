const fs = require('fs/promises');
const path = require('path');

async function writeMigrationReport(runId, stepName, payload) {
  const reportDir = path.join(__dirname, '..', 'reports', String(runId));
  await fs.mkdir(reportDir, { recursive: true });
  const filePath = path.join(reportDir, `${stepName}.json`);
  await fs.writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  return filePath;
}

module.exports = {
  writeMigrationReport,
};
