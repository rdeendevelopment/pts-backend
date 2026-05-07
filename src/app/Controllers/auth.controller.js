const jwt = require('jsonwebtoken');

const constants = require('../../../config/constants');
const {
  buildAuthResponse,
  findAccountFromTokenPayload,
  tokenHash,
} = require('../Services/auth/access-control.service');
const coreMongo = require('../Repositories/core-mongo.repository');

function readBearer(req) {
  return String(req.header('Authorization') || '').replace(/^Bearer\s+/i, '').trim();
}

exports.me = async function (req, res) {
  try {
    const token = readBearer(req);
    if (!token) return res.status(401).json({ success: false, message: 'Unauthorized' });

    const decoded = jwt.verify(token, constants.APP_SECRET);
    const result = await findAccountFromTokenPayload(decoded);
    if (!result) return res.status(401).json({ success: false, message: 'Unauthorized' });

    const authResponse = await buildAuthResponse(result.accountType, result.account, { includeRefresh: false });

    return res.json({ success: true, ...authResponse });
  } catch (error) {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }
};

exports.refresh = async function (req, res) {
  try {
    const refreshToken = req.body?.refreshToken;
    if (!refreshToken) return res.status(401).json({ success: false, message: 'Refresh token required' });
    const hashedToken = tokenHash(refreshToken);

    const stored = await coreMongo.findValidRefreshToken(hashedToken);
    if (!stored) return res.status(401).json({ success: false, message: 'Invalid refresh token' });

    const fakePayload = {
      user: {
        id: stored.user_id,
        accountType: stored.user_type,
      },
    };
    const result = await findAccountFromTokenPayload(fakePayload);
    if (!result) return res.status(401).json({ success: false, message: 'Unauthorized' });

    await coreMongo.revokeRefreshTokenByLegacyId(stored.id);

    const authResponse = await buildAuthResponse(result.accountType, result.account);
    return res.json({ success: true, ...authResponse });
  } catch (error) {
    return res.status(401).json({ success: false, message: 'Invalid refresh token' });
  }
};

exports.logout = async function (req, res) {
  try {
    const refreshToken = req.body?.refreshToken;
    if (refreshToken) {
      const hashedToken = tokenHash(refreshToken);
      await coreMongo.revokeRefreshTokenByHash(hashedToken);
    }

    return res.json({ success: true, message: 'Logged out successfully' });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Unable to logout' });
  }
};
