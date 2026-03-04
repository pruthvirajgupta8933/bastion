#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

// ── Constants ────────────────────────────────────────────────────────────────

const DEBOUNCE_PATH = '/tmp/shipkit-guardian-debounce.json';
const DEBOUNCE_INTERVAL = 5;
const MAX_FILE_LINES = 800;

const SECRET_PATTERNS = [
  {
    name: 'OpenAI/Stripe API key (sk-)',
    pattern: /['"]sk[-_][a-zA-Z0-9_-]{20,}['"]/,
  },
  {
    name: 'Publishable key (pk-)',
    pattern: /['"]pk[-_][a-zA-Z0-9_-]{20,}['"]/,
  },
  {
    name: 'Hardcoded API key assignment',
    pattern: /(?:api[_-]?key|secret[_-]?key|api[_-]?secret)\s*[:=]\s*['"][a-zA-Z0-9_-]{20,}['"]/i,
  },
  {
    name: 'AWS access key',
    pattern: /AKIA[0-9A-Z]{16}/,
  },
  {
    name: 'Hardcoded password',
    pattern: /password\s*[:=]\s*['"][^'"]{8,}['"]/i,
  },
  {
    name: 'Private key',
    pattern: /-----BEGIN (?:RSA |EC )?PRIVATE KEY-----/,
  },
  {
    name: 'Connection string with credentials',
    pattern: /(?:mysql|postgres|mongodb):\/\/[^:]+:[^@]+@/,
  },
  {
    name: 'GitHub token',
    pattern: /['"]ghp_[a-zA-Z0-9]{35,}['"]/,
  },
  {
    name: 'Slack token',
    pattern: /['"]xox[bpoas]-[a-zA-Z0-9-]+['"]/,
  },
];

// NOTE: console.log detection REMOVED — ECC's stop hook already handles this

const SQL_INJECTION_PATTERNS = [
  /["']SELECT\s.*["']\s*\+/i,
  /`SELECT\s.*\$\{/i,
  /["']INSERT\s.*["']\s*\+/i,
  /`INSERT\s.*\$\{/i,
  /["']UPDATE\s.*["']\s*\+/i,
  /`UPDATE\s.*\$\{/i,
  /["']DELETE\s.*["']\s*\+/i,
  /`DELETE\s.*\$\{/i,
];

// ── Helpers ──────────────────────────────────────────────────────────────────

function readJSON(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch {
    return null;
  }
}

function writeJSON(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf-8');
}

function shouldDebounce(filePath) {
  const debounce = readJSON(DEBOUNCE_PATH) || {};
  const count = (debounce[filePath] || 0) + 1;
  const updated = { ...debounce, [filePath]: count };
  writeJSON(DEBOUNCE_PATH, updated);
  // Warn on 1st call, then every 5th call (1, 6, 11, ...)
  return count % DEBOUNCE_INTERVAL !== 1;
}

// ── Scanners ─────────────────────────────────────────────────────────────────

function scanSecrets(content) {
  const findings = [];
  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Skip comments and env references
    if (line.trim().startsWith('//') || line.trim().startsWith('#') ||
        line.trim().startsWith('*') || line.includes('process.env') ||
        line.includes('os.environ') || line.includes('.env')) {
      continue;
    }
    for (const { name, pattern } of SECRET_PATTERNS) {
      if (pattern.test(line)) {
        findings.push({ type: 'secret', name, line: i + 1 });
      }
    }
  }
  return findings;
}

function scanSQLInjection(content) {
  const findings = [];
  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    for (const pattern of SQL_INJECTION_PATTERNS) {
      if (pattern.test(lines[i])) {
        findings.push({ type: 'sql-injection', line: i + 1 });
        break;
      }
    }
  }
  return findings;
}

function checkFileSize(content) {
  const lineCount = content.split('\n').length;
  if (lineCount > MAX_FILE_LINES) {
    return [{ type: 'file-size', lineCount }];
  }
  return [];
}

// ── Main ─────────────────────────────────────────────────────────────────────

function getFileContent(toolInput) {
  // For Write, use the content directly
  if (toolInput.content) {
    return toolInput.content;
  }
  // For Edit, read from file
  if (toolInput.file_path) {
    try {
      return fs.readFileSync(toolInput.file_path, 'utf-8');
    } catch {
      return null;
    }
  }
  return null;
}

function formatFindings(findings, filePath) {
  const groups = { secret: [], 'sql-injection': [], 'file-size': [] };

  for (const f of findings) {
    if (groups[f.type]) {
      groups[f.type].push(f);
    }
  }

  const parts = [];

  if (groups.secret.length > 0) {
    const details = groups.secret.map((f) => `${f.name} (line ${f.line})`).join(', ');
    parts.push(`SECRETS DETECTED: ${details}`);
  }

  if (groups['sql-injection'].length > 0) {
    const lines = groups['sql-injection'].map((f) => f.line).join(', ');
    parts.push(`Possible SQL injection on lines: ${lines}`);
  }

  if (groups['file-size'].length > 0) {
    const count = groups['file-size'][0].lineCount;
    parts.push(`File exceeds ${MAX_FILE_LINES} lines (${count} lines)`);
  }

  return `GUARDIAN [${path.basename(filePath)}]: ${parts.join(' | ')}`;
}

async function main() {
  let rawInput = '';
  for await (const chunk of process.stdin) {
    rawInput += chunk;
  }

  let input;
  try {
    input = JSON.parse(rawInput);
  } catch {
    process.stdout.write(JSON.stringify({ decision: 'allow' }));
    return;
  }

  const toolInput = input.tool_input || {};
  const filePath = toolInput.file_path;

  if (!filePath) {
    process.stdout.write(JSON.stringify({ decision: 'allow' }));
    return;
  }

  // Debounce: only warn every Nth call per file
  if (shouldDebounce(filePath)) {
    process.stdout.write(JSON.stringify({ decision: 'allow' }));
    return;
  }

  const content = getFileContent(toolInput);
  if (!content) {
    process.stdout.write(JSON.stringify({ decision: 'allow' }));
    return;
  }

  const findings = [
    ...scanSecrets(content),
    ...scanSQLInjection(content),
    ...checkFileSize(content),
  ];

  if (findings.length === 0) {
    process.stdout.write(JSON.stringify({ decision: 'allow' }));
    return;
  }

  const reason = formatFindings(findings, filePath);

  // Output in GSD-compatible format
  process.stdout.write(JSON.stringify({
    decision: 'warn',
    reason,
    hookSpecificOutput: {
      hookEventName: 'PostToolUse',
      additionalContext: reason,
    },
  }));
}

main().catch(() => {
  process.stdout.write(JSON.stringify({ decision: 'allow' }));
});
