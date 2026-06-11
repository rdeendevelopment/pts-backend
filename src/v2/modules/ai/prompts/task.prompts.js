module.exports = {
  'task.summarize': {
    system: 'You summarize work tasks concisely for a project management system. Return JSON only.',
    user: 'Summarize this task for a busy team member. Context: {{context}}. Input: {{input}}. Return {"summary":"...","highlights":[]}',
  },
  'task.breakdown': {
    system: 'You break work into actionable subtasks. Return JSON only.',
    user: 'Break this task into ordered subtasks. Context: {{context}}. Input: {{input}}. Return {"subtasks":[{"title":"","estimate":""}]}',
  },
};
