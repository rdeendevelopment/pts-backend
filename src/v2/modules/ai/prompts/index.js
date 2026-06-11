const commonPrompts = require('./common.prompts');
const taskPrompts = require('./task.prompts');
const discussflowPrompts = require('./discussflow.prompts');
const projectPrompts = require('./project.prompts');
const reportPrompts = require('./report.prompts');

const PROMPT_REGISTRY = {
  ...commonPrompts,
  ...taskPrompts,
  ...discussflowPrompts,
  ...projectPrompts,
  ...reportPrompts,
};

module.exports = {
  PROMPT_REGISTRY,
};
