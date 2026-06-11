const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { AppError } = require('../../../kernel/errors');
const { assertActorCanApproveAiReview } = require('../helpers/discussFlowPermission.helper');

const topic = {
  _id: '64b1f2a3c4d5e6f7a8b9c0d1',
  ownerId: 'owner-1',
};

describe('AI review permissions', () => {
  it('guest cannot approve AI review items', () => {
    const guestActor = {
      actorType: 'guest',
      actorId: 'guest-1',
      topicId: String(topic._id),
      role: 'contributor',
    };

    assert.throws(
      () => assertActorCanApproveAiReview(guestActor, topic, null),
      (err) => err instanceof AppError && err.status === 403
    );
  });

  it('topic owner can approve AI review items', () => {
    const userActor = {
      actorType: 'user',
      actorId: 'owner-1',
      topicId: String(topic._id),
    };

    assert.doesNotThrow(() => assertActorCanApproveAiReview(userActor, topic, null));
  });

  it('viewer member cannot approve AI review items', () => {
    const userActor = {
      actorType: 'user',
      actorId: 'user-2',
      topicId: String(topic._id),
    };
    const member = { role: 'viewer' };

    assert.throws(
      () => assertActorCanApproveAiReview(userActor, topic, member),
      (err) => err instanceof AppError && err.status === 403
    );
  });
});
