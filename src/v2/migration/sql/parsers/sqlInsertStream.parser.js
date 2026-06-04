const fs = require('fs');
const readline = require('readline');

const PHASE1_TABLES = new Set([
  'admins',
  'users',
  'clients',
  'projects',
  'project_users',
  'project_default_tasks',
]);

const PHASE2_TABLES = new Set([
  'working_hours',
  'daily_notes',
]);

const INSERT_PREFIX_RE = /^INSERT INTO `([^`]+)`/i;

/**
 * Parse a single SQL value token from INSERT row text.
 * @param {string} text - full VALUES section starting at '('
 * @param {number} start - index of opening '('
 * @returns {{ value: *, end: number }}
 */
function parseSqlValue(text, start) {
  let i = start;

  while (i < text.length && /\s/.test(text[i])) i += 1;

  if (text[i] === '(') {
    return parseSqlTuple(text, i);
  }

  if (text.slice(i, i + 4).toUpperCase() === 'NULL') {
    return { value: null, end: i + 4 };
  }

  if (text[i] === "'" || text[i] === '"') {
    return parseSqlQuotedString(text, i);
  }

  const numberMatch = text.slice(i).match(/^-?\d+(?:\.\d+)?/);
  if (numberMatch) {
    const raw = numberMatch[0];
    const value = raw.includes('.') ? parseFloat(raw) : parseInt(raw, 10);
    return { value, end: i + raw.length };
  }

  throw new Error(`Unable to parse SQL value near: ${text.slice(i, i + 40)}`);
}

function parseSqlQuotedString(text, start) {
  const quote = text[start];
  let i = start + 1;
  let value = '';

  while (i < text.length) {
    const ch = text[i];

    if (ch === '\\' && i + 1 < text.length) {
      const next = text[i + 1];
      if (next === 'n') value += '\n';
      else if (next === 'r') value += '\r';
      else if (next === 't') value += '\t';
      else if (next === '0') value += '\0';
      else value += next;
      i += 2;
      continue;
    }

    if (ch === quote) {
      if (text[i + 1] === quote) {
        value += quote;
        i += 2;
        continue;
      }
      return { value, end: i + 1 };
    }

    value += ch;
    i += 1;
  }

  throw new Error('Unterminated SQL string literal');
}

function parseSqlTuple(text, start) {
  let i = start + 1;
  const values = [];

  while (i < text.length) {
    while (i < text.length && /\s/.test(text[i])) i += 1;
    if (text[i] === ')') {
      return { value: values, end: i + 1 };
    }

    const parsed = parseSqlValue(text, i);
    values.push(parsed.value);
    i = parsed.end;

    while (i < text.length && /\s/.test(text[i])) i += 1;
    if (text[i] === ',') {
      i += 1;
      continue;
    }
    if (text[i] === ')') {
      return { value: values, end: i + 1 };
    }
    throw new Error(`Unexpected character "${text[i]}" while parsing SQL tuple`);
  }

  throw new Error('Unterminated SQL tuple');
}

function parseInsertColumns(header) {
  const match = header.match(/\(([^)]+)\)\s*VALUES\s*/i);
  if (!match) {
    throw new Error(`Invalid INSERT header: ${header.slice(0, 120)}`);
  }

  return match[1]
    .split(',')
    .map((col) => col.trim().replace(/^`|`$/g, ''));
}

function rowsFromValuesSection(valuesSection) {
  const rows = [];
  let i = 0;

  while (i < valuesSection.length) {
    while (i < valuesSection.length && /\s/.test(valuesSection[i])) i += 1;
    if (i >= valuesSection.length) break;
    if (valuesSection[i] !== '(') {
      i += 1;
      continue;
    }

    const parsed = parseSqlTuple(valuesSection, i);
    rows.push(parsed.value);
    i = parsed.end;

    while (i < valuesSection.length && /\s/.test(valuesSection[i])) i += 1;
    if (valuesSection[i] === ',') i += 1;
  }

  return rows;
}

function normalizeRow(columns, values) {
  const row = {};
  for (let idx = 0; idx < columns.length; idx += 1) {
    row[columns[idx]] = values[idx] ?? null;
  }
  return row;
}

function parseInsertStatement(sqlChunk, allowedTables = PHASE1_TABLES) {
  const trimmed = sqlChunk.trim();
  const headerMatch = trimmed.match(INSERT_PREFIX_RE);
  if (!headerMatch) return null;

  const table = headerMatch[1];
  if (!allowedTables.has(table)) return null;

  const valuesIndex = trimmed.toUpperCase().indexOf('VALUES');
  if (valuesIndex < 0) return null;

  const header = trimmed.slice(0, valuesIndex + 'VALUES'.length);
  const valuesSection = trimmed.slice(valuesIndex + 'VALUES'.length).replace(/;\s*$/, '');
  const columns = parseInsertColumns(header);
  const tuples = rowsFromValuesSection(valuesSection);

  return {
    table,
    columns,
    rows: tuples.map((tuple) => normalizeRow(columns, tuple)),
  };
}

/**
 * Stream-parse a MySQL dump and collect phase-1 INSERT rows.
 * @param {string} filePath
 * @param {{ verbose?: boolean, onProgress?: Function }} [options]
 */
async function extractTablesFromSqlFile(filePath, allowedTables, options = {}) {
  if (!filePath || !fs.existsSync(filePath)) {
    throw new Error(`SQL file not found: ${filePath}`);
  }

  const result = {};
  for (const table of allowedTables) {
    result[table] = [];
  }

  const stream = fs.createReadStream(filePath, { encoding: 'utf8' });
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

  let buffer = '';
  let insertCount = 0;

  const flushBuffer = () => {
    if (!buffer.trim()) return;
    const parsed = parseInsertStatement(buffer, allowedTables);
    buffer = '';
    if (!parsed) return;

    insertCount += 1;
    if (options.verbose) {
      // eslint-disable-next-line no-console
      console.log(`[sql-parser] ${parsed.table}: +${parsed.rows.length} rows`);
    }

    result[parsed.table].push(...parsed.rows);
  };

  for await (const line of rl) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('--') || trimmed.startsWith('/*')) continue;

    if (INSERT_PREFIX_RE.test(trimmed)) {
      flushBuffer();
      buffer = trimmed;
      if (trimmed.endsWith(';')) flushBuffer();
      continue;
    }

    if (buffer) {
      buffer += `\n${trimmed}`;
      if (trimmed.endsWith(';')) flushBuffer();
    }
  }

  flushBuffer();

  const counts = {};
  for (const table of allowedTables) {
    counts[table] = result[table].length;
  }

  return {
    data: result,
    stats: { insertStatements: insertCount, counts },
  };
}

async function extractPhase1TablesFromSqlFile(filePath, options = {}) {
  return extractTablesFromSqlFile(filePath, PHASE1_TABLES, options);
}

async function extractPhase2TablesFromSqlFile(filePath, options = {}) {
  return extractTablesFromSqlFile(filePath, PHASE2_TABLES, options);
}

module.exports = {
  PHASE1_TABLES,
  PHASE2_TABLES,
  parseInsertStatement,
  parseSqlValue,
  extractTablesFromSqlFile,
  extractPhase1TablesFromSqlFile,
  extractPhase2TablesFromSqlFile,
};
