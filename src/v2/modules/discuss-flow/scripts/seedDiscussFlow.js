#!/usr/bin/env node
require('dotenv').config();

const { info, warn } = require('../../../kernel/logger');
const { connectTargetForSeed, closeMigrationConnections } = require('../../../migration/helpers/dualConnection.helper');
const { ensureDiscussFlowModuleIndexes } = require('../models');
const { seedSystemModules } = require('../../modules');
const { seedRbac } = require('../../rbac');
const moduleRepository = require('../../modules/repositories/module.repository');
const accountRepository = require('../../auth/repositories/account.repository');
const userRepository = require('../../users/repositories/user.repository');
const workspaceRepository = require('../repositories/discussFlowWorkspace.repository');
const topicRepository = require('../repositories/discussFlowTopic.repository');
const topicMemberRepository = require('../repositories/discussFlowTopicMember.repository');
const timelineRepository = require('../repositories/discussFlowTimeline.repository');
const { MODULE_KEY } = require('../constants/discussFlow.constants');

const SEED_PREFIX = '[DFLOW-SEED]';

async function enableDiscussFlowModule() {
  const moduleDoc = await moduleRepository.findByKey(MODULE_KEY);
  if (!moduleDoc) {
    return { enabled: false, reason: 'module_not_found_run_v2_seed_first' };
  }

  if (moduleDoc.status !== 'active') {
    const { getModuleModel } = require('../../modules/models/module.model');
    const Module = getModuleModel();
    await Module.updateOne({ _id: moduleDoc._id }, { $set: { status: 'active', updatedAt: new Date() } });
    return { enabled: true, updated: true };
  }

  return { enabled: true, updated: false };
}

async function resolveSampleAccount() {
  const seedEmail = String(process.env.PTS_V2_SEED_ADMIN_EMAIL || 'admin@example.com').toLowerCase().trim();
  let account = await accountRepository.findByEmail(seedEmail);

  if (!account) {
    const users = await userRepository.listUsers({ status: 'active' }, { limit: 1, skip: 0 });
    if (!users.items?.length) return null;
    account = await accountRepository.findById(users.items[0].accountId);
  }

  return account;
}

async function seedSampleWorkspace(account) {
  const tenantId = account._id;
  const slug = 'product-discovery';

  let workspace = await workspaceRepository.findBySlug(tenantId, slug);
  if (!workspace) {
    workspace = await workspaceRepository.create({
      tenantId,
      name: 'Product Discovery',
      slug,
      description: 'DiscussFlow sample workspace',
      visibility: 'team',
      status: 'active',
      ownerId: tenantId,
      memberCount: 1,
      topicCount: 0,
      createdBy: tenantId,
      updatedBy: tenantId,
    });
    info(`${SEED_PREFIX} workspace created`, { slug });
  }

  const topicSlug = 'sso-requirements';
  const exists = await topicRepository.slugExists(workspace._id, topicSlug);
  if (exists) {
    return { workspace, topic: await topicRepository.list(tenantId, { workspaceId: workspace._id, limit: 1 }).then((r) => r.items[0]) };
  }

  const topic = await topicRepository.create({
    workspaceId: workspace._id,
    tenantId,
    title: 'SSO Requirements',
    slug: topicSlug,
    description: 'Discussion → requirement → decision flow sample',
    status: 'active',
    priority: 'high',
    category: 'product',
    tags: ['auth', 'sso'],
    createdBy: tenantId,
    ownerId: tenantId,
    lastActivityAt: new Date(),
    timelineEnabled: true,
  });

  await topicMemberRepository.create({
    topicId: topic._id,
    tenantId,
    accountId: tenantId,
    role: 'owner',
  });

  await workspaceRepository.incrementTopicCount(workspace._id, tenantId, 1);

  await timelineRepository.create({
    topicId: topic._id,
    tenantId,
    eventType: 'topic_created',
    actorId: tenantId,
    payload: { title: topic.title },
  });

  info(`${SEED_PREFIX} sample topic created`, { topicSlug });
  return { workspace, topic };
}

async function main() {
  await connectTargetForSeed();
  await seedSystemModules();
  await seedRbac();
  await ensureDiscussFlowModuleIndexes();

  const moduleResult = await enableDiscussFlowModule();
  info(`${SEED_PREFIX} module`, moduleResult);

  const account = await resolveSampleAccount();
  if (!account) {
    warn(`${SEED_PREFIX} no account found — module enabled, sample data skipped`);
    await closeMigrationConnections();
    return;
  }

  const sample = await seedSampleWorkspace(account);
  info(`${SEED_PREFIX} complete`, {
    workspaceId: String(sample.workspace._id),
    topicId: sample.topic ? String(sample.topic._id) : null,
  });

  await closeMigrationConnections();
}

main().catch((err) => {
  warn(`${SEED_PREFIX} failed`, { message: err.message });
  process.exitCode = 1;
});
