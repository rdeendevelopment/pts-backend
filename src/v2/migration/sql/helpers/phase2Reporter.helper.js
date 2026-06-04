function createCounter() {
  return { expected: 0, imported: 0, skipped: 0, duplicate: 0, errors: 0 };
}

function initPhase2Report({ fileName, dryRun, mode, resume = true, parseStats }) {
  return {
    fileName,
    dryRun,
    mode,
    resume,
    startedAt: new Date().toISOString(),
    completedAt: null,
    executionMs: 0,
    runId: null,
    parseStats,
    workingHours: createCounter(),
    expandedEntries: createCounter(),
    weeks: { created: 0, updated: 0, skipped: 0 },
    dailyNotes: { attached: 0, skipped: 0 },
    errorsByCode: {},
    totals: {
      importedMinutes: 0,
      importedHours: 0,
      dateRange: { min: null, max: null },
      usersAffected: 0,
      projectsAffected: 0,
    },
    validation: null,
  };
}

function bumpError(report, code) {
  report.errorsByCode[code] = (report.errorsByCode[code] || 0) + 1;
  return report;
}

function printPhase2Report(report) {
  const lines = [];
  lines.push('');
  lines.push('═'.repeat(72));
  lines.push(` PTS SQL Phase 2 Migration ${report.dryRun ? '(DRY RUN)' : '(LIVE)'} [${report.mode}]`);
  lines.push('═'.repeat(72));
  lines.push(`File:      ${report.fileName}`);
  lines.push(`Resume:    ${report.resume !== false}`);
  lines.push(`Run ID:    ${report.runId || 'n/a'}`);
  lines.push(`Duration:  ${(report.executionMs / 1000).toFixed(2)}s`);
  lines.push('');
  lines.push('Working hours rows');
  lines.push(`  Expected:  ${report.workingHours.expected}`);
  lines.push(`  Expanded:  ${report.expandedEntries.expected}`);
  lines.push(`  Imported:  ${report.expandedEntries.imported}`);
  lines.push(`  Skipped:   ${report.expandedEntries.skipped}`);
  lines.push(`  Duplicate: ${report.expandedEntries.duplicate}`);
  lines.push(`  Errors:    ${report.expandedEntries.errors}`);
  lines.push('');
  lines.push('Weeks');
  lines.push(`  Created:   ${report.weeks.created}`);
  lines.push(`  Updated:   ${report.weeks.updated}`);
  lines.push(`  Skipped:   ${report.weeks.skipped}`);
  lines.push('');
  lines.push('Daily notes');
  lines.push(`  Attached:  ${report.dailyNotes.attached}`);
  lines.push(`  Skipped:   ${report.dailyNotes.skipped}`);
  lines.push('');
  lines.push('Totals');
  lines.push(`  Minutes:   ${report.totals.importedMinutes}`);
  lines.push(`  Hours:     ${report.totals.importedHours.toFixed(2)}`);
  lines.push(`  Users:     ${report.totals.usersAffected}`);
  lines.push(`  Projects:  ${report.totals.projectsAffected}`);
  if (report.totals.dateRange.min) {
    lines.push(`  Date range: ${report.totals.dateRange.min} → ${report.totals.dateRange.max}`);
  }
  if (Object.keys(report.errorsByCode).length) {
    lines.push('');
    lines.push('Errors by code:');
    for (const [code, count] of Object.entries(report.errorsByCode).sort((a, b) => b[1] - a[1])) {
      lines.push(`  ${code}: ${count}`);
    }
  }
  if (report.validation) {
    lines.push('');
    lines.push(`Validation: ${report.validation.ok ? 'PASSED' : 'FAILED'}`);
    for (const issue of report.validation.issues || []) {
      lines.push(`  - ${issue}`);
    }
  }
  lines.push('═'.repeat(72));
  // eslint-disable-next-line no-console
  console.log(lines.join('\n'));
}

module.exports = {
  initPhase2Report,
  bumpError,
  printPhase2Report,
};
