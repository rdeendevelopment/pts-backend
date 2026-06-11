#!/usr/bin/env node
require('dotenv').config();

const { info, warn } = require('../../../kernel/logger');
const { connectTargetForSeed, closeMigrationConnections } = require('../../../migration/helpers/dualConnection.helper');
const { ensureDailyFlowModuleIndexes } = require('../models');
const { seedSystemModules } = require('../../modules');
const { seedRbac } = require('../../rbac');
const moduleRepository = require('../../modules/repositories/module.repository');
const accountRepository = require('../../auth/repositories/account.repository');
const userRepository = require('../../users/repositories/user.repository');
const dayRepository = require('../repositories/dailyFlowDay.repository');
const goalRepository = require('../repositories/dailyFlowGoal.repository');
const catchupRepository = require('../repositories/dailyFlowCatchup.repository');
const reflectionRepository = require('../repositories/dailyFlowReflection.repository');
const rewardRepository = require('../repositories/dailyFlowReward.repository');
const settingsRepository = require('../repositories/dailyFlowSettings.repository');
const { formatDayKey, getBusinessTimezone } = require('../../activity/helpers/week.helper');
const { DAILY_FLOW_MODULE_KEY } = require('../constants/dailyFlow.constants');

const SEED_PREFIX = '[DF-SEED]';

async function enableDailyFlowModule() {
  const moduleDoc = await moduleRepository.findByKey(DAILY_FLOW_MODULE_KEY);
  if (!moduleDoc) {
    return { enabled: false, reason: 'module_not_found_run_v2_seed_first' };
  }

  if (moduleDoc.status !== 'active') {
    const { getModuleModel } = require('../../modules/models/module.model');
    const Module = getModuleModel();
    await Module.updateOne(
      { _id: moduleDoc._id },
      { $set: { status: 'active', updatedAt: new Date() } }
    );
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

async function findSeedGoal(accountId, dayKey, title) {
  const { getDailyFlowGoalModel } = require('../models/dailyFlowGoal.model');
  const Goal = getDailyFlowGoalModel();
  return Goal.findOne({ accountId, dayKey, title, isDeleted: false }).lean();
}

async function findSeedCatchup(accountId, dayKey, title) {
  const { getDailyFlowCatchupModel } = require('../models/dailyFlowCatchup.model');
  const Catchup = getDailyFlowCatchupModel();
  return Catchup.findOne({ accountId, dayKey, title, isDeleted: false }).lean();
}

async function seedSampleRecords(account) {
  const accountId = account._id;
  const user = await userRepository.findByAccountId(accountId);

  if (!user) {
    return { skipped: true, reason: 'no_user_profile_for_account' };
  }

  const timezone = user.timezone || getBusinessTimezone();
  const dayKey = formatDayKey(new Date(), timezone);

  await settingsRepository.upsertSettings(accountId, {
    enableDailyFlow: true,
    weekendPlanningEnabled: true,
    shareWorkGoalsWithAdmin: false,
    sharePersonalGoalsWithAdmin: false,
    allowRewardEligibility: true,
    timezone,
  });

  const day = await dayRepository.findOrCreateDay(accountId, dayKey, {
    userId: user._id,
    timezone,
    status: 'active',
  });

  const seedGoals = [
    {
      type: 'work',
      title: `${SEED_PREFIX} Ship sprint deliverables`,
      description: 'Complete assigned sprint tasks.',
      status: 'in_progress',
      targetValue: 5,
      currentValue: 2,
    },
    {
      type: 'work',
      title: `${SEED_PREFIX} Update project documentation`,
      description: 'Document API changes for Daily Flow.',
      status: 'pending',
    },
    {
      type: 'personal',
      title: `${SEED_PREFIX} Evening walk`,
      description: '30 minute walk after work.',
      status: 'pending',
      category: 'healthy_habit',
    },
    {
      type: 'personal',
      title: `${SEED_PREFIX} Read 20 pages`,
      description: 'Personal reading goal.',
      status: 'completed',
      completedAt: new Date(),
    },
  ];

  let goalsCreated = 0;
  for (const seedGoal of seedGoals) {
    const existing = await findSeedGoal(accountId, dayKey, seedGoal.title);
    if (existing) continue;

    await goalRepository.createGoal({
      accountId,
      userId: user._id,
      dayId: day._id,
      dayKey,
      dueDate: dayKey,
      type: seedGoal.type,
      title: seedGoal.title,
      description: seedGoal.description,
      category: seedGoal.category || null,
      targetValue: seedGoal.targetValue ?? null,
      currentValue: seedGoal.currentValue ?? 0,
      status: seedGoal.status,
      isPrivate: seedGoal.type === 'personal',
      visibility: 'private',
      sourceType: 'manual',
      completedAt: seedGoal.completedAt || null,
    });
    goalsCreated += 1;
  }

  const seedCatchups = [
    { type: 'need_to_discuss', title: `${SEED_PREFIX} Sprint planning follow-up` },
    { type: 'need_help', title: `${SEED_PREFIX} API review support` },
    { type: 'reminder', title: `${SEED_PREFIX} Submit weekly reflection` },
  ];

  let catchupsCreated = 0;
  for (const seedCatchup of seedCatchups) {
    const existing = await findSeedCatchup(accountId, dayKey, seedCatchup.title);
    if (existing) continue;

    await catchupRepository.createCatchup({
      accountId,
      userId: user._id,
      dayId: day._id,
      dayKey,
      type: seedCatchup.type,
      title: seedCatchup.title,
      status: 'open',
      priority: 'medium',
    });
    catchupsCreated += 1;
  }

  const reflection = await reflectionRepository.findReflectionByAccountAndDayKey(accountId, dayKey);
  if (!reflection) {
    await reflectionRepository.upsertReflection(accountId, dayKey, {
      accountId,
      userId: user._id,
      dayId: day._id,
      dayKey,
      biggestWin: 'Completed Daily Flow Layer 1 backend.',
      blockers: 'Waiting for Angular integration.',
      learnings: 'Privacy-first admin summaries work well.',
      tomorrowPlan: 'Start Angular module shell.',
      mood: 4,
      energy: 4,
    });
  }

  const seedRewards = [
    {
      ruleKey: '3_day_consistency',
      type: 'consistency',
      label: '3 Day Consistency',
      description: 'Sample seed reward for consistency.',
    },
    {
      ruleKey: 'completed_all_planned_goals',
      type: 'goal_completion',
      label: 'All Planned Goals Completed',
      description: 'Sample seed reward for goal completion.',
    },
  ];

  let rewardsCreated = 0;
  for (const seedReward of seedRewards) {
    const existing = await rewardRepository.findRewardByRule(accountId, dayKey, seedReward.ruleKey);
    if (existing) continue;

    await rewardRepository.createReward({
      accountId,
      userId: user._id,
      dayId: day._id,
      dayKey,
      type: seedReward.type,
      ruleKey: seedReward.ruleKey,
      label: seedReward.label,
      description: seedReward.description,
      status: 'earned',
      earnedAt: new Date(),
    });
    rewardsCreated += 1;
  }

  return {
    skipped: false,
    account_id: String(accountId),
    user_id: String(user._id),
    day_key: dayKey,
    goals_created: goalsCreated,
    catchups_created: catchupsCreated,
    reflection_created: reflection ? 0 : 1,
    rewards_created: rewardsCreated,
  };
}

async function main() {
  info('Starting Daily Flow seed');

  await connectTargetForSeed();
  await ensureDailyFlowModuleIndexes();
  await seedSystemModules();
  const rbacSummary = await seedRbac();

  const moduleSummary = await enableDailyFlowModule();
  const account = await resolveSampleAccount();

  const summary = {
    module: moduleSummary,
    rbac: {
      permissions_seeded: rbacSummary?.permissions?.total ?? null,
      permission_keys: [
        'daily_flow.view',
        'daily_flow.manage',
        'daily_flow.admin',
      ],
      note: 'Use daily_flow.view/manage/admin (not read/write/settings aliases).',
    },
    sample: null,
  };

  if (!account) {
    warn('Daily Flow seed: no sample account found. Run npm run v2:seed first.');
    summary.sample = { skipped: true, reason: 'no_sample_account' };
  } else {
    summary.sample = await seedSampleRecords(account);
  }

  info('Daily Flow seed completed', summary);
  console.log(JSON.stringify({ ok: true, ...summary }, null, 2));
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeMigrationConnections();
  });
