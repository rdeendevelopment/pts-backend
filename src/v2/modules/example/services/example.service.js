const repository = require('../repositories/example.repository');
const { toStatusDto } = require('../dto/status.dto');
const { buildStatusMessage } = require('../helpers/example.helper');
const { EXAMPLE_MODULE_KEY } = require('../constants/example.constants');

async function getModuleStatus() {
  await repository.ping();

  return toStatusDto({
    module: EXAMPLE_MODULE_KEY,
    status: 'ready',
    message: buildStatusMessage(),
  });
}

module.exports = {
  getModuleStatus,
};
