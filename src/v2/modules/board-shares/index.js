const routes = require('./board-shares.routes');
const { ensureBoardShareIndexes } = require('./models');

module.exports = {
  routes,
  ensureBoardShareIndexes,
  boardShareAccess: require('./helpers/boardShareAccess.helper'),
  boardShareService: require('./services/boardShare.service'),
};
