const objectId = require('./objectId');
const { validateRequest } = require('./validateRequest');

module.exports = {
  ...objectId,
  validateRequest,
};
