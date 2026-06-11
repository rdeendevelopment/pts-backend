const {
  emitRightPanelUpdated,
  emitTruthUpdated,
  emitResumeUpdated,
} = require('./discussFlowSocketEvents.helper');
const panelService = require('../services/panel.service');

async function emitTruthPanelUpdate(actor, topic) {
  const panel = await panelService.getTopicPanel({ ...actor, topic }, topic._id);
  const slice = {
    counts: panel.counts,
    documents: panel.documents,
    truth_status: panel.truth_status,
    next_actions: panel.next_actions,
    participant_count: panel.participant_count,
    guest_links: panel.guest_links,
    handoffs: panel.handoffs,
    last_activity: panel.last_activity,
  };
  emitTruthUpdated(topic._id, slice);
  emitRightPanelUpdated(topic._id, slice);
  emitResumeUpdated(topic._id, {
    topic_id: String(topic._id),
    truth_status: panel.truth_status,
    next_actions: panel.next_actions,
    handoffs: panel.handoffs,
  });
  return panel;
}

module.exports = {
  emitTruthPanelUpdate,
};
