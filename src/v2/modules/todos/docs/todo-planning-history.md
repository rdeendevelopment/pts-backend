# Todo planning history

My Day stores append-oriented planning snapshots in `planningHistory`. Ordinary Todo edits cannot write these fields. Carry-forward, completion, and reopening use dedicated repository operations so historical reporting is not derived from the Todo's current status.

## Backfill

For an installation affected by the former date-overwrite behavior, first preview and apply the conservative repair:

```sh
npm run v2:repair:todo-history:dry-run
npm run v2:repair:todo-history
```

The repair records a direct carry only when `createdAt`, the stored destination date, and `updatedAt` consistently prove it. It reports ambiguous and duplicate-candidate counts, does not invent intermediate days or movers, and never deletes records. Run the baseline backfill afterward for ambiguous rows where only the current stored planning date is known.

Preview the idempotent batched migration:

```sh
npm run v2:migrate:todo-history:dry-run
```

Apply it:

```sh
npm run v2:migrate:todo-history
```

The command logs `processed`, `updated`, `skipped`, and `failed` counts. It uses the earliest reliable stored planning date (`firstPlannedDate`, `currentPlannedDate`, then `todoDate`, with `createdAt` only as a final fallback), preserves known completion timestamps, and sets `sourceType` from `linkedTaskId`.

The migration creates one initial planning entry only. Exact carry-forward actions that happened before this feature were never stored and cannot be reconstructed safely, so the migration does not invent them.

## Connected verification

The verification commands create uniquely tagged temporary fixtures, exercise the real HTTP API and configured database, and remove those exact fixtures in `finally` cleanup:

```sh
npm run v2:verify:todo-history
npm run v2:verify:todo-linked-completion
```

The first command covers the three-day 10/3/7 planning scenario, idempotent Bring to Today, completion/reopen, and legacy completion fallback. The second covers Task drawer reads, My Day-only completion, My Day plus Task completion, an already-completed Task, and a workflow that cannot transition to done.

## Reporting

`GET /api/v2/todos/reports?period=daily|weekly|monthly&date=YYYY-MM-DD` returns owner-scoped, date-bounded metrics. `pendingAtDayEnd` comes from immutable entries for the reporting date, `currentlyPending` comes from each Todo's latest status, and `completedLate`/`completedLateItems[].completedLateDays` use the final completion date minus `firstPlannedDate`. Daily My Day lists and summaries use the same history calculations.
