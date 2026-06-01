const { body } = require('express-validator');

const registerRules = [
  body('email').trim().isEmail().withMessage('Valid email is required').normalizeEmail(),
  body('password')
    .isString()
    .isLength({ min: 8 })
    .withMessage('Password must be at least 8 characters'),
  body('firstName').trim().notEmpty().withMessage('First name is required'),
  body('lastName').trim().notEmpty().withMessage('Last name is required'),
];

const loginRules = [
  body('password').isString().notEmpty().withMessage('Password is required'),
  body('email').optional({ nullable: true, checkFalsy: true }).trim(),
  body('identifier').optional({ nullable: true, checkFalsy: true }).trim(),
  body('username').optional({ nullable: true, checkFalsy: true }).trim(),
  body().custom((value) => {
    const identifier = value.identifier || value.email || value.username;
    if (!identifier || !String(identifier).trim()) {
      throw new Error('Email or username is required');
    }
    return true;
  }),
];

const refreshRules = [
  body('refreshToken').isString().notEmpty().withMessage('Refresh token is required'),
];

const logoutRules = [
  body('refreshToken').optional({ nullable: true }).isString().withMessage('Refresh token must be a string'),
];

module.exports = {
  registerRules,
  loginRules,
  refreshRules,
  logoutRules,
};
