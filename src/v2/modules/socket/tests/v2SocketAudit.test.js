const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const MODULES_ROOT = path.resolve(__dirname, '../..');
const SOCKET_MODULE = path.join(MODULES_ROOT, 'socket');

const FORBIDDEN_PATTERNS = [
  /require\(['"]socket\.io['"]\)/,
  /\bio\.emit\s*\(/,
  /\bsocket\.emit\s*\(/,
  /\breq\.io\b/,
  /get\(['"]io['"]\)/,
  /\bglobal\.io\b/,
  /\bio\.to\s*\(\s*['"`][^'"`]+['"`]/,
  /['"`](?:account|user|project|task|conversation):/,
];

function listJsFiles(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...listJsFiles(fullPath));
    } else if (entry.name.endsWith('.js') && !entry.name.endsWith('.test.js')) {
      files.push(fullPath);
    }
  }

  return files;
}

function isUnderSocketModule(filePath) {
  return filePath.startsWith(`${SOCKET_MODULE}${path.sep}`);
}

function scanModuleForViolations() {
  const violations = [];
  const moduleDirs = fs.readdirSync(MODULES_ROOT, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name !== 'example')
    .map((entry) => path.join(MODULES_ROOT, entry.name));

  for (const moduleDir of moduleDirs) {
    for (const filePath of listJsFiles(moduleDir)) {
      if (isUnderSocketModule(filePath)) continue;

      const content = fs.readFileSync(filePath, 'utf8');
      const relativePath = path.relative(MODULES_ROOT, filePath);

      for (const pattern of FORBIDDEN_PATTERNS) {
        if (pattern.test(content)) {
          violations.push({ file: relativePath, pattern: String(pattern) });
        }
      }
    }
  }

  return violations;
}

test('v2 business modules do not use raw socket.io or hard-coded room strings', () => {
  const violations = scanModuleForViolations();
  assert.deepEqual(
    violations,
    [],
    `Forbidden socket usage found:\n${violations.map((v) => `- ${v.file} (${v.pattern})`).join('\n')}`
  );
});

test('allowed socket integration uses global socketService emit helpers', () => {
  const taskHelper = fs.readFileSync(
    path.join(MODULES_ROOT, 'tasks/helpers/taskSocketEvents.helper.js'),
    'utf8'
  );

  assert.match(taskHelper, /socketService\.emitToProject/);
  assert.doesNotMatch(taskHelper, /require\(['"]socket\.io['"]\)/);
});
