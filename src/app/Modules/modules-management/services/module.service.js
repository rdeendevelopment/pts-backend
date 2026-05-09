const SystemModule = require('../models/module.model');
const { DEFAULT_MODULES } = require('../constants/module.constants');

async function seedModules() {
  for (const def of DEFAULT_MODULES) {
    await SystemModule.findOneAndUpdate(
      { key: def.key },
      { $setOnInsert: def },
      { upsert: true, returnDocument: 'before' }
    );
  }
}

async function getAllModules() {
  return SystemModule.find().sort({ order: 1, key: 1 }).lean();
}

async function toggleModule(key, enabled, allowDisableCore = false) {
  const mod = await SystemModule.findOne({ key });
  if (!mod) return null;

  if (mod.isCore && !enabled && !allowDisableCore) {
    const err = new Error('Core modules cannot be disabled without allowDisableCore=true');
    err.statusCode = 422;
    throw err;
  }

  mod.enabled = enabled;
  await mod.save();
  return mod.toObject();
}

module.exports = { seedModules, getAllModules, toggleModule };
