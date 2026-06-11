const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { getDiscussFlowTopicRoom } = require('../../socket/helpers/socketRooms.helper');
const { DISCUSSFLOW_SOCKET_EVENTS } = require('../constants/discussFlowSocket.constants');
const { getTopicRoom, DISCUSSFLOW_SOCKET_EVENTS: exportedEvents } = require('../helpers/discussFlowSocketEvents.helper');

describe('discussFlowSocketEvents.helper', () => {
  it('uses discussflow:topic room naming', () => {
    const topicId = '64b1f2a3c4d5e6f7a8b9c0d1';
    assert.equal(getTopicRoom(topicId), `discussflow:topic:${topicId}`);
    assert.equal(getDiscussFlowTopicRoom(topicId), `discussflow:topic:${topicId}`);
  });

  it('exports expected socket event names', () => {
    assert.equal(exportedEvents.MESSAGE_CREATED, 'discussflow:message:created');
    assert.equal(exportedEvents.RIGHT_PANEL_UPDATED, 'discussflow:right-panel:updated');
    assert.equal(DISCUSSFLOW_SOCKET_EVENTS.TYPING_START, 'discussflow:typing:start');
  });

  it('message socket payload shape is serializable', () => {
    const payload = {
      message: {
        id: 'msg-1',
        topic_id: 'topic-1',
        content: 'Hello',
        message_status: 'active',
        ai_suggestion_status: 'pending',
      },
      actor_type: 'user',
    };

    const serialized = JSON.parse(JSON.stringify(payload));
    assert.equal(serialized.message.id, 'msg-1');
    assert.equal(serialized.message.ai_suggestion_status, 'pending');
  });
});
