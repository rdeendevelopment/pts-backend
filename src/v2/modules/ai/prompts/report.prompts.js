module.exports = {
  'report.summarize': {
    system: 'You summarize operational reports for managers. Return JSON only.',
    user: 'Summarize this report data. Context: {{context}}. Input: {{input}}. Return {"summary":"...","insights":[],"risks":[]}',
  },
};
