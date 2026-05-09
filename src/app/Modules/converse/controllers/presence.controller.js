const userPresence = require('../services/userPresence.service');

// GET /api/converse/presence?userIds=id1,id2,id3
async function getPresenceStatuses(req, res) {
  try {
    const { userIds } = req.query;
    if (!userIds) {
      return res.json({ success: true, data: { statuses: [] } });
    }
    const ids = String(userIds)
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean)
      .slice(0, 500); // guard against huge payloads

    if (process.env.NODE_ENV !== 'production') {
      console.log(`[converse:presence] API requested for ${ids.length} userIds`);
    }

    const statuses = userPresence.getManyStatuses(ids);
    return res.json({ success: true, data: { statuses } });
  } catch (err) {
    console.error('[converse:presence] getPresenceStatuses error:', err.message);
    return res.status(500).json({ success: false, message: 'Internal error' });
  }
}

// GET /api/converse/presence/online
async function getOnlineUserIds(req, res) {
  try {
    const userIds = userPresence.getOnlineUserIds();
    return res.json({ success: true, data: { userIds } });
  } catch (err) {
    console.error('[converse:presence] getOnlineUserIds error:', err.message);
    return res.status(500).json({ success: false, message: 'Internal error' });
  }
}

module.exports = { getPresenceStatuses, getOnlineUserIds };
