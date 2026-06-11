# Daily Flow Layer 1 QA Checklist

## Module & Access

- [ ] `GET /status` works when global module is disabled and returns `enabled: false`
- [ ] User routes return `MODULE_NOT_AVAILABLE` when global module is disabled
- [ ] `GET /settings` and `PATCH /settings` work when global module is enabled
- [ ] User routes return `DAILY_FLOW_DISABLED_FOR_USER` when `enable_daily_flow: false`
- [ ] `PATCH /settings` with `enable_daily_flow: true` restores user access
- [ ] Admin routes work when global module enabled (even if user setting disabled)
- [ ] Unauthorized requests return 401
- [ ] Missing permissions return 403

## Day Records

- [ ] `GET /today` creates one day record for logged-in user
- [ ] Second `GET /today` does not create duplicate day
- [ ] `GET /day/:date` validates `YYYY-MM-DD`
- [ ] Invalid date returns `DAILY_FLOW_INVALID_DAY_KEY`
- [ ] Weekend day blocked when `weekend_planning_enabled: false`

## Goals

- [ ] Create work goal with `goal_type: work`
- [ ] Create personal goal with `goal_type: personal`
- [ ] Personal goal defaults to `is_private: true`
- [ ] Update own goal succeeds
- [ ] Update another user's goal returns 404
- [ ] Progress update auto-completes at `current_value >= target_value`
- [ ] Progress drop below target reverts completed goal to `in_progress`
- [ ] `current_value < 0` rejected
- [ ] Complete goal sets `completed_at`
- [ ] Delete goal soft-deletes (`status: deleted`)
- [ ] Deleted goal cannot be updated

## Catchups

- [ ] Create catchup with required `title`, `type`, `day_key`
- [ ] Update own catchup
- [ ] Resolve catchup sets `resolved_at` and `status: done`
- [ ] Delete catchup soft-deletes
- [ ] Cross-account catchup mutation returns 404

## Mood & Reflection

- [ ] `POST /mood` saves morning values on day record
- [ ] `POST /mood` saves evening values on day record
- [ ] `POST /reflection` upserts one reflection per user/day
- [ ] Second reflection POST updates same record

## Weekly Summary & Rewards

- [ ] `GET /weekly-summary` returns counts and <= 7 day records
- [ ] Custom `week_start` / `week_end` range works
- [ ] `POST /rewards/evaluate` creates eligible rewards once
- [ ] Second evaluate returns `existing_rewards`, not duplicates
- [ ] Evaluate blocked when `allow_reward_eligibility: false`

## Admin & Privacy

- [ ] `GET /admin/team-summary` returns `scope: "account"`
- [ ] Team summary has no personal goal titles/descriptions
- [ ] `GET /admin/user/:userId` hides work goals when sharing disabled
- [ ] `GET /admin/user/:userId` hides personal goals unless explicitly shared
- [ ] Admin user summary respects `goals_limit` and `meta.goals_truncated`

## Pagination & Limits

- [ ] Dashboard defaults: goals 100, catchups 100
- [ ] Dashboard max: 200
- [ ] `meta.goals_truncated` true when more goals exist than limit

## Data Integrity

- [ ] All IDs are 24-char Mongo ObjectIds in API responses
- [ ] No hard deletes for goals/catchups
- [ ] Seed script is idempotent on repeated runs

## Automated Tests

Run:

```bash
node --test src/v2/modules/daily-flow/tests/*.test.js
```
