const test = require('node:test');
const assert = require('node:assert/strict');
const DEFAULT_MODULES = require('../helpers/defaultModules.helper');
const {
  CORE_MODULE_KEY_SET,
  OPTIONAL_FEATURE_MODULE_KEY_SET,
  isCoreModuleKey,
} = require('../constants/moduleRegistry.constants');

test('My Day is an always-available core module', () => {
  const dailyFlow = DEFAULT_MODULES.find((module) => module.key === 'daily_flow');
  assert.ok(dailyFlow);
  assert.equal(dailyFlow.status, 'active');
  assert.equal(isCoreModuleKey('daily_flow'), true);
  assert.equal(CORE_MODULE_KEY_SET.has('daily_flow'), true);
  assert.equal(OPTIONAL_FEATURE_MODULE_KEY_SET.has('daily_flow'), false);
});
