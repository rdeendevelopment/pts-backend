const { EXAMPLE_MODULE_KEY } = require('../constants/example.constants');

function buildStatusMessage() {
  return `${EXAMPLE_MODULE_KEY} module structure is available for v2 development.`;
}

module.exports = {
  buildStatusMessage,
};
