const coreMongo = require('../Repositories/core-mongo.repository');

exports.save = async function save(req, res) {
  try {
    if (req.body.email && await coreMongo.findClientByEmail(req.body.email)) {
      return res.status(400).send({ message: 'Email address already exists!' });
    }
    const client = await coreMongo.createClient(req.body);
    return res.send({ message: 'Client Created!', data: client });
  } catch (error) {
    console.log(`Catch Error: in client signup => ${error}`);
    return res.status(500).send({ message: 'Internal server error', error: error.message });
  }
};

exports.getAllClients = async function getAllClients(req, res) {
  try {
    return res.send({ data: await coreMongo.getAllClients(), source: 'mongodb' });
  } catch (error) {
    console.log(`Catch Error: in getting all clients => ${error}`);
    return res.send({ status: false, message: 'Error: Internal server error', error: error.message });
  }
};

exports.getClientById = async function getClientById(req, res) {
  try {
    const client = await coreMongo.getClientById(req.params.id);
    if (!client) return res.status(404).send({ message: 'Client not found' });
    return res.send({ data: client, source: 'mongodb' });
  } catch (error) {
    console.log(`Catch Error: in getting client by id => ${error}`);
    return res.send({ status: false, message: 'Error: Internal server error', error: error.message });
  }
};

exports.updateClient = async function updateClient(req, res) {
  try {
    if (req.body.email && await coreMongo.findClientByEmail(req.body.email, req.params.id)) {
      return res.status(400).send({ message: 'Email address already exists!' });
    }
    const client = await coreMongo.updateClient(req.params.id, req.body);
    if (!client) return res.status(404).send({ message: 'Client not found' });
    return res.send({ message: 'Client updated successfully', data: client });
  } catch (error) {
    return res.status(500).send({ message: 'Internal server error', error: error.message });
  }
};

exports.deleteClient = async function deleteClient(req, res) {
  try {
    const client = await coreMongo.updateClient(req.params.id, { is_deleted: true });
    if (!client) return res.status(404).send({ message: 'Client not found' });
    return res.send({ message: 'Client deleted successfully' });
  } catch (error) {
    return res.status(500).send({ message: 'Internal server error', error: error.message });
  }
};

exports.toggleActiveStatus = async function toggleActiveStatus(req, res) {
  try {
    const client = await coreMongo.updateClient(req.params.id, { is_active: req.body.is_active });
    if (!client) return res.status(404).send({ message: 'Client not found' });
    return res.send({ message: 'Client status updated successfully' });
  } catch (error) {
    return res.status(500).send({ message: 'Internal server error', error: error.message });
  }
};
