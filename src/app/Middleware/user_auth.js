const { authenticate } = require('./auth');

module.exports = async function userAuth(req, res, next) {
  return authenticate(req, res, next);
};
