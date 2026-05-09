const { getActorId } = require('../services/converseMapper.service');
const userSearchService = require('../services/userSearch.service');

exports.search = async function search(req, res) {
  try {
    const actorId = getActorId(req);
    const q = String(req.query.q || '').trim();

    const users = await userSearchService.searchUsers(q, actorId);
    return res.send({ data: users });
  } catch (err) {
    console.error('[converse/userSearch] error:', err.message);
    return res.status(500).send({ message: 'Internal server error', error: err.message });
  }
};
