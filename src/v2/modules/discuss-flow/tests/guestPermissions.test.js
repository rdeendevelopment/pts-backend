const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { AppError } = require('../../../kernel/errors');
const {
  guestHasPermission,
  assertActorTopicRead,
  assertActorTopicWrite,
} = require('../helpers/discussFlowPermission.helper');
const { assertActorTopicScope } = require('../helpers/discussFlowActor.helper');
const { GUEST_ROLE_PERMISSIONS } = require('../constants/discussFlow.constants');

const topic = {
  _id: '64b1f2a3c4d5e6f7a8b9c0d1',
  ownerId: 'owner-1',
};

describe('guest permissions', () => {
  it('maps guest role permissions', () => {
    assert.equal(GUEST_ROLE_PERMISSIONS.viewer.sendMessage, false);
    assert.equal(GUEST_ROLE_PERMISSIONS.commenter.sendMessage, true);
    assert.equal(GUEST_ROLE_PERMISSIONS.contributor.createRequirement, true);
  });

  it('viewer cannot write', () => {
    const actor = {
      actorType: 'guest',
      actorId: 'guest-1',
      topicId: String(topic._id),
      role: 'viewer',
      permissions: GUEST_ROLE_PERMISSIONS.viewer,
    };

    assert.throws(
      () => assertActorTopicWrite(actor, topic, null),
      (err) => err instanceof AppError && err.status === 403
    );
  });

  it('commenter can write messages', () => {
    const actor = {
      actorType: 'guest',
      actorId: 'guest-2',
      topicId: String(topic._id),
      role: 'commenter',
      permissions: GUEST_ROLE_PERMISSIONS.commenter,
    };

    assert.doesNotThrow(() => assertActorTopicWrite(actor, topic, null));
    assert.equal(guestHasPermission(actor, 'sendMessage'), true);
  });

  it('guest cannot access unrelated topic', () => {
    const actor = {
      actorType: 'guest',
      actorId: 'guest-3',
      topicId: 'other-topic-id',
      role: 'commenter',
      permissions: GUEST_ROLE_PERMISSIONS.commenter,
    };

    assert.throws(
      () => assertActorTopicScope(actor, topic._id),
      (err) => err instanceof AppError && err.status === 403
    );
  });

  it('viewer can read assigned topic', () => {
    const actor = {
      actorType: 'guest',
      actorId: 'guest-4',
      topicId: String(topic._id),
      role: 'viewer',
      permissions: GUEST_ROLE_PERMISSIONS.viewer,
    };

    assert.doesNotThrow(() => assertActorTopicRead(actor, topic, null));
  });
});
