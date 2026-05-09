const { getAllModules, toggleModule } = require('../services/module.service');

exports.listModules = async function listModules(req, res) {
  try {
    const modules = await getAllModules();
    return res.send({ data: modules });
  } catch (error) {
    console.error('[modules-management] listModules error:', error);
    return res.status(500).send({ message: 'Internal server error', error: error.message });
  }
};

exports.toggleModule = async function toggleModuleHandler(req, res) {
  try {
    const { key } = req.params;
    const { enabled, allowDisableCore } = req.body;

    const mod = await toggleModule(key, enabled, Boolean(allowDisableCore));
    if (!mod) return res.status(404).send({ message: `Module '${key}' not found` });

    return res.send({ message: `Module '${key}' ${enabled ? 'enabled' : 'disabled'} successfully`, data: mod });
  } catch (error) {
    if (error.statusCode === 422) {
      return res.status(422).send({ message: error.message });
    }
    console.error('[modules-management] toggleModule error:', error);
    return res.status(500).send({ message: 'Internal server error', error: error.message });
  }
};
