const bcrypt = require('bcrypt');

const { buildAuthResponse, findLoginAccount } = require('../Services/auth/access-control.service');
const coreMongo = require('../Repositories/core-mongo.repository');

exports.signup = async function signup(req, res) {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).send({ message: 'Email and password are required' });

    const existing = await findLoginAccount(email);
    if (existing) return res.status(400).send({ message: 'Email address already exists!' });

    const admin = await coreMongo.createAdmin({
      ...req.body,
      password: await bcrypt.hash(password, 10),
      type: req.body.type || 'super-admin',
      is_active: req.body.is_active === undefined ? true : req.body.is_active,
    });

    return res.send({ message: 'Account Created!', data: admin });
  } catch (error) {
    console.log(`Catch Error: in admin signup => ${error}`);
    return res.status(500).send({ message: 'Internal server error', error: error.message });
  }
};

exports.login = async function login(req, res) {
  try {
    const { password, email } = req.body;
    const loginAccount = await findLoginAccount(email);
    const user = loginAccount?.account;

    if (!user) return res.status(400).send({ message: 'Invalid Email or username' });
    if (!(await bcrypt.compare(password, user.password))) return res.status(400).send({ message: 'Invalid password' });
    if (user.is_deleted) return res.status(400).json({ message: 'User no longer exists' });
    if (!user.is_active) return res.status(400).json({ message: 'Account is not active, please contact with Support' });

    user.last_login = new Date();
    if (typeof user.save === 'function') await user.save();

    const authResponse = await buildAuthResponse(loginAccount.accountType, user);
    return res.send({ message: 'Logged in successfully.', ...authResponse });
  } catch (error) {
    console.log(`Catch Error in login: ${error}`);
    return res.status(500).send({ message: 'Internal server error', error: error.message });
  }
};

exports.getById = async function getById(req, res) {
  try {
    const admin = await coreMongo.getAdminById(req.params.id);
    return res.send({ data: admin });
  } catch (error) {
    console.log(`Catch Error: in getting admin details => ${error}`);
    return res.send({ status: false, message: 'Error: Internal server error', error: error.message });
  }
};

exports.update = async function update(req, res) {
  try {
    const admin = await coreMongo.updateAdmin(req.params.id, req.body);
    if (!admin) return res.status(404).send({ message: 'Admin not found' });
    return res.send({ message: 'Profile updated successfully', data: admin });
  } catch (error) {
    return res.status(500).send({ message: 'Internal server error', error: error.message });
  }
};

exports.updatePassword = async function updatePassword(req, res) {
  try {
    const admin = await coreMongo.getAdminById(req.body.userId || req.params.id);
    if (!admin) return res.status(404).send({ message: 'Admin not found' });
    if (req.body.oldPassword && !(await bcrypt.compare(req.body.oldPassword, admin.password))) {
      return res.status(400).send({ message: 'Current password is incorrect' });
    }
    const nextPassword = req.body.newPassword || req.body.password;
    if (!nextPassword) return res.status(400).send({ message: 'New password is required' });
    const updated = await coreMongo.updateAdmin(admin.id, { password: await bcrypt.hash(nextPassword, 10) });
    return res.send({ message: 'Password updated successfully', data: updated });
  } catch (error) {
    return res.status(500).send({ message: 'Internal server error', error: error.message });
  }
};
