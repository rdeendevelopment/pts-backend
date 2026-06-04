function createEntityStats() {
  return { expected: 0, imported: 0, skipped: 0, errors: 0 };
}

function initPhase1Report({ fileName, dryRun, parseStats }) {
  return {
    fileName,
    dryRun,
    startedAt: new Date().toISOString(),
    completedAt: null,
    executionMs: 0,
    runId: null,
    parseStats,
    entities: {
      users: createEntityStats(),
      admins: createEntityStats(),
      clients: createEntityStats(),
      projects: createEntityStats(),
      assignments: createEntityStats(),
      workCategories: createEntityStats(),
    },
    validation: null,
  };
}

function printPhase1Report(report) {
  const lines = [];
  lines.push('');
  lines.push('═'.repeat(72));
  lines.push(` PTS SQL Phase 1 Migration ${report.dryRun ? '(DRY RUN)' : '(LIVE)'}`);
  lines.push('═'.repeat(72));
  lines.push(`File:      ${report.fileName}`);
  lines.push(`Run ID:    ${report.runId || 'n/a'}`);
  lines.push(`Duration:  ${(report.executionMs / 1000).toFixed(2)}s`);
  lines.push('');

  const table = [
    ['Entity', 'Expected', 'Imported', 'Skipped', 'Errors'],
  ];

  for (const [label, key] of [
    ['Users', 'users'],
    ['Clients', 'clients'],
    ['Projects', 'projects'],
    ['Assignments', 'assignments'],
    ['Work Categories', 'workCategories'],
    ['Admins', 'admins'],
  ]) {
    const row = report.entities[key];
    table.push([label, row.expected, row.imported, row.skipped, row.errors]);
  }

  const colWidths = [18, 10, 10, 10, 10];
  for (const row of table) {
    lines.push(row.map((cell, i) => String(cell).padEnd(colWidths[i])).join(''));
  }

  if (report.parseStats?.counts) {
    lines.push('');
    lines.push('Parsed from SQL:');
    lines.push(JSON.stringify(report.parseStats.counts, null, 2));
  }

  if (report.validation) {
    lines.push('');
    lines.push(`Validation: ${report.validation.ok ? 'PASSED' : 'FAILED'}`);
    if (report.validation.issues?.length) {
      for (const issue of report.validation.issues) {
        lines.push(`  - ${issue}`);
      }
    }
  }

  lines.push('═'.repeat(72));
  // eslint-disable-next-line no-console
  console.log(lines.join('\n'));
}

module.exports = {
  createEntityStats,
  initPhase1Report,
  printPhase1Report,
};
