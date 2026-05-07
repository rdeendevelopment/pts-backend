const bcrypt = require('bcrypt');

const { buildAuthResponse, findLoginAccount } = require('../Services/auth/access-control.service');
const coreMongo = require('../Repositories/core-mongo.repository');

function deletedValue(value, id) {
  if (!value) return value;
  return `${value}__deleted_${id}_${Date.now()}`;
}

exports.signup = async function signup(req, res) {
  try {
    const { email, password, user_name } = req.body;
    if (!email && !user_name) return res.status(400).send({ message: 'Email or username is required.' });
    if (!password) return res.status(400).send({ message: 'Password is required.' });

    if (email && await coreMongo.findUserByEmailOrUsername(email)) {
      return res.status(400).send({ message: 'Email address already exists!' });
    }
    if (user_name && await coreMongo.findUserByEmailOrUsername(user_name)) {
      return res.status(400).send({ message: 'Username already exists!' });
    }

    const user = await coreMongo.createUser({ ...req.body, password: await bcrypt.hash(password, 10) });
    return res.send({ message: 'Account Created!', data: user });
  } catch (error) {
    console.log(`Catch Error: in user signup => ${error}`);
    return res.status(500).send({ message: 'Internal server error', error: error.message });
  }
};

exports.login = async function login(req, res) {
  try {
    const { password, email } = req.body;
    const loginAccount = await findLoginAccount(email);
    const user = loginAccount?.accountType === 'user' ? loginAccount.account : null;

    if (!user) return res.status(400).send({ message: 'Invalid Email/Username or password' });
    if (!(await bcrypt.compare(password, user.password))) return res.status(400).send({ message: 'Invalid password' });
    if (user.is_deleted) return res.status(400).json({ message: 'User no longer exists.' });
    if (!user.is_active) return res.status(400).json({ message: 'Account is not active, please contact with Support' });

    await coreMongo.updateUser(user.id, { last_login: new Date() });
    const authResponse = await buildAuthResponse('user', user);
    return res.send({ message: 'Logged in successfully.', ...authResponse, is_guest_admin: false });
  } catch (error) {
    console.log(`Catch Error: in login user => ${error}`);
    return res.send({ status: false, message: 'Error: Internal server error', error: error.message });
  }
};

exports.getAllUsers = async function getAllUsers(req, res) {
  try {
    return res.send({ data: await coreMongo.getAllUsers(), source: 'mongodb' });
  } catch (error) {
    console.log(`Catch Error: in getting all users => ${error}`);
    return res.send({ status: false, message: 'Error: Internal server error', error: error.message });
  }
};

exports.getUserById = async function getUserById(req, res) {
  try {
    const user = await coreMongo.getUserById(req.params.id);
    if (!user) return res.status(404).send({ message: 'User not found' });
    return res.send({ data: user, source: 'mongodb' });
  } catch (error) {
    console.log(`Catch Error: in getting user by id => ${error}`);
    return res.send({ status: false, message: 'Error: Internal server error', error: error.message });
  }
};

exports.updateUser = async function updateUser(req, res) {
  try {
    const { id } = req.params;
    const { email, user_name } = req.body;
    if (email && await coreMongo.findUserByEmailOrUsername(email, id)) {
      return res.status(400).send({ message: 'Email address already exists!' });
    }
    if (user_name && await coreMongo.findUserByEmailOrUsername(user_name, id)) {
      return res.status(400).send({ message: 'Username already exists!' });
    }

    const user = await coreMongo.updateUser(id, req.body);
    if (!user) return res.status(404).send({ message: 'User not found' });
    return res.send({ message: 'User updated successfully', data: user });
  } catch (error) {
    return res.status(500).send({ message: 'Internal server error', error: error.message });
  }
};

exports.updatePassword = async function updatePassword(req, res) {
  try {
    const current = await coreMongo.getUserById(req.params.id);
    if (!current) return res.status(404).send({ message: 'User not found' });

    const nextPassword = req.body.newPassword || req.body.password;
    if (!nextPassword) return res.status(400).send({ message: 'New password is required' });

    if (req.body.oldPassword && !(await bcrypt.compare(req.body.oldPassword, current.password))) {
      return res.status(400).send({ message: 'Current password is incorrect' });
    }

    const user = await coreMongo.updateUser(req.params.id, {
      password: await bcrypt.hash(nextPassword, 10),
      must_change_password: Boolean(req.body.mustChangePassword || req.body.must_change_password),
    });
    return res.send({ message: 'Password updated successfully', data: user });
  } catch (error) {
    return res.status(500).send({ message: 'Internal server error', error: error.message });
  }
};

exports.deleteUser = async function deleteUser(req, res) {
  try {
    const current = await coreMongo.getUserById(req.params.id);
    if (!current) return res.status(404).send({ message: 'User not found' });
    await coreMongo.updateUser(req.params.id, {
      is_deleted: true,
      is_active: false,
      email: deletedValue(current.email, current.id),
      user_name: deletedValue(current.user_name, current.id),
    });
    return res.send({ message: 'User deleted successfully' });
  } catch (error) {
    return res.status(500).send({ message: 'Internal server error', error: error.message });
  }
};

exports.toggleActiveStatus = async function toggleActiveStatus(req, res) {
  try {
    const user = await coreMongo.updateUser(req.params.id, { is_active: req.body.is_active });
    if (!user) return res.status(404).send({ message: 'User not found' });
    return res.send({ message: 'User status updated successfully' });
  } catch (error) {
    return res.status(500).send({ message: 'Internal server error', error: error.message });
  }
};
