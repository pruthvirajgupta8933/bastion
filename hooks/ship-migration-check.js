#!/usr/bin/env node
'use strict';

const path = require('path');

// ── Constants ────────────────────────────────────────────────────────────────

const MIGRATION_PATH_PATTERNS = [
  /\/migrations\/.*\.sql$/i,
  /\/migrate\/.*\.sql$/i,
  /migration.*\.sql$/i,
  /\/db\/.*\.sql$/i,
  /\/prisma\/migrations\//i,
  /\/drizzle\//i,
];

const DESTRUCTIVE_PATTERNS = [
  { pattern: /\bDROP\s+TABLE\b/i, name: 'DROP TABLE' },
  { pattern: /\bDROP\s+COLUMN\b/i, name: 'DROP COLUMN' },
  { pattern: /\bTRUNCATE\b/i, name: 'TRUNCATE' },
  { pattern: /\bDROP\s+INDEX\b/i, name: 'DROP INDEX' },
  { pattern: /\bDROP\s+DATABASE\b/i, name: 'DROP DATABASE' },
  { pattern: /\bDROP\s+SCHEMA\b/i, name: 'DROP SCHEMA' },
];

const RISKY_ALTER_PATTERN = /\bALTER\s+TABLE\b(?!.*\bCONCURRENTLY\b)/i;

const TYPE_NARROWING_PATTERNS = [
  /\bALTER\s+(?:TABLE|COLUMN)\b.*\bSET\s+DATA\s+TYPE\b/i,
  /\bALTER\s+(?:TABLE|COLUMN)\b.*\bTYPE\s+(?:smallint|tinyint|int\b|integer\b)/i,
  /\bALTER\s+(?:TABLE|COLUMN)\b.*\b(?:SET\s+DATA\s+)?TYPE\s+VARCHAR\s*\(\s*\d+\s*\)/i,
];

const ROLLBACK_INDICATORS = [
  /\b(?:down|rollback|revert)\b/i,
  /-- down migration/i,
  /-- rollback/i,
];

// ── Helpers ──────────────────────────────────────────────────────────────────

function isMigrationFile(filePath) {
  return MIGRATION_PATH_PATTERNS.some((pattern) => pattern.test(filePath));
}

function scanDestructiveOps(content) {
  const findings = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (const { pattern, name } of DESTRUCTIVE_PATTERNS) {
      if (pattern.test(line)) {
        findings.push({ type: 'destructive', operation: name, line: i + 1 });
      }
    }
  }
  return findings;
}

function scanRiskyAlters(content) {
  const findings = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    if (RISKY_ALTER_PATTERN.test(lines[i])) {
      findings.push({ type: 'risky-alter', line: i + 1 });
    }
  }
  return findings;
}

function scanTypeNarrowing(content) {
  const findings = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    for (const pattern of TYPE_NARROWING_PATTERNS) {
      if (pattern.test(lines[i])) {
        findings.push({ type: 'type-narrowing', line: i + 1 });
        break;
      }
    }
  }
  return findings;
}

function hasRollbackMigration(content) {
  return ROLLBACK_INDICATORS.some((pattern) => pattern.test(content));
}

function formatWarning(findings, filePath, hasRollback) {
  const parts = [];

  const destructive = findings.filter((f) => f.type === 'destructive');
  if (destructive.length > 0) {
    const ops = [...new Set(destructive.map((f) => f.operation))].join(', ');
    parts.push(`Destructive operations: ${ops}`);
  }

  const riskyAlters = findings.filter((f) => f.type === 'risky-alter');
  if (riskyAlters.length > 0) {
    parts.push(`ALTER TABLE without CONCURRENTLY (lines: ${riskyAlters.map((f) => f.line).join(', ')})`);
  }

  const narrowing = findings.filter((f) => f.type === 'type-narrowing');
  if (narrowing.length > 0) {
    parts.push(`Possible type narrowing (lines: ${narrowing.map((f) => f.line).join(', ')})`);
  }

  if (!hasRollback && destructive.length > 0) {
    parts.push('No rollback/down migration detected');
  }

  return `MIGRATION [${path.basename(filePath)}]: ${parts.join(' | ')}`;
}

// ── Main ─────────────────────────────────────────────────────────────────────

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

  if (!filePath || !isMigrationFile(filePath)) {
    process.stdout.write(JSON.stringify({ decision: 'allow' }));
    return;
  }

  // Get content: prefer tool_input.content (Write), fall back to reading file
  const content = toolInput.content || (() => {
    try {
      const fs = require('fs');
      return fs.readFileSync(filePath, 'utf-8');
    } catch {
      return null;
    }
  })();

  if (!content) {
    process.stdout.write(JSON.stringify({ decision: 'allow' }));
    return;
  }

  const findings = [
    ...scanDestructiveOps(content),
    ...scanRiskyAlters(content),
    ...scanTypeNarrowing(content),
  ];

  if (findings.length === 0) {
    process.stdout.write(JSON.stringify({ decision: 'allow' }));
    return;
  }

  const hasRollback = hasRollbackMigration(content);
  const reason = formatWarning(findings, filePath, hasRollback);

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
