const { parseBoolean } = require('./sqlPhase1Cli.helper');

function parsePhase2CliArgs(argv = []) {
  const args = {
    file: null,
    dryRun: true,
    reset: false,
    verbose: false,
    runId: null,
    mode: 'insert-only',
    resume: true,
    batchSize: 500,
  };

  for (const token of argv) {
    if (token.startsWith('--file=')) args.file = token.slice('--file='.length);
    if (token.startsWith('--dryRun=')) args.dryRun = parseBoolean(token.slice('--dryRun='.length), true);
    if (token.startsWith('--dry-run=')) args.dryRun = parseBoolean(token.slice('--dry-run='.length), true);
    if (token === '--dry-run') args.dryRun = true;
    if (token.startsWith('--reset=')) args.reset = parseBoolean(token.slice('--reset='.length), false);
    if (token.startsWith('--verbose=')) args.verbose = parseBoolean(token.slice('--verbose='.length), false);
    if (token === '--verbose') args.verbose = true;
    if (token.startsWith('--runId=')) args.runId = token.slice('--runId='.length);
    if (token.startsWith('--run-id=')) args.runId = token.slice('--run-id='.length);
    if (token.startsWith('--mode=')) args.mode = token.slice('--mode='.length);
    if (token.startsWith('--resume=')) args.resume = parseBoolean(token.slice('--resume='.length), true);
    if (token === '--resume') args.resume = true;
    if (token.startsWith('--batch-size=')) args.batchSize = Number(token.slice('--batch-size='.length));
  }

  if (!['insert-only', 'upsert'].includes(args.mode)) {
    throw new Error(`Unsupported mode "${args.mode}". Use insert-only or upsert.`);
  }

  return args;
}

module.exports = {
  parsePhase2CliArgs,
};
