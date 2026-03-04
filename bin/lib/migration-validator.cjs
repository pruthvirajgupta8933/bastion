'use strict';

const fs = require('fs');
const path = require('path');

// ── Patterns ─────────────────────────────────────────────────────────────────

const DESTRUCTIVE_PATTERNS = [
  { pattern: /\bDROP\s+TABLE\b/gi, message: 'DROP TABLE detected — data loss risk' },
  { pattern: /\bDROP\s+COLUMN\b/gi, message: 'DROP COLUMN detected — data loss risk' },
  { pattern: /\bTRUNCATE\s+TABLE\b/gi, message: 'TRUNCATE TABLE detected — data loss risk' },
  { pattern: /\bDROP\s+INDEX\b/gi, message: 'DROP INDEX detected — may affect query performance' },
  { pattern: /\bDROP\s+SCHEMA\b/gi, message: 'DROP SCHEMA detected — data loss risk' },
  { pattern: /\bDROP\s+DATABASE\b/gi, message: 'DROP DATABASE detected — catastrophic data loss risk' },
];

const RISKY_ALTER_PATTERN = /\bALTER\s+TABLE\b(?!.*\bCONCURRENTLY\b)/gi;

const TYPE_NARROWING_PATTERNS = [
  {
    pattern: /ALTER\s+TABLE\s+\S+\s+ALTER\s+COLUMN\s+\S+\s+(?:SET\s+DATA\s+)?TYPE\s+VARCHAR\s*\(\s*(\d+)\s*\)/gi,
    check: 'varchar_narrowing',
  },
  {
    pattern: /ALTER\s+TABLE\s+\S+\s+ALTER\s+COLUMN\s+\S+\s+(?:SET\s+DATA\s+)?TYPE\s+(SMALLINT|TINYINT)\b/gi,
    check: 'int_narrowing',
  },
  {
    pattern: /ALTER\s+TABLE\s+\S+\s+MODIFY\s+COLUMN\s+\S+\s+VARCHAR\s*\(\s*(\d+)\s*\)/gi,
    check: 'varchar_narrowing',
  },
];

// ── Helpers ──────────────────────────────────────────────────────────────────

function getLineNumber(content, index) {
  return content.substring(0, index).split('\n').length;
}

function findAllMatches(content, regex) {
  const matches = [];
  let match;
  // Reset lastIndex for global regexes
  const re = new RegExp(regex.source, regex.flags);
  while ((match = re.exec(content)) !== null) {
    matches.push({
      text: match[0],
      index: match.index,
      line: getLineNumber(content, match.index),
    });
  }
  return matches;
}

function checkDownMigrationExists(filePath) {
  const dir = path.dirname(filePath);
  const base = path.basename(filePath);

  // Common patterns: 001_up.sql/001_down.sql, 001.up.sql/001.down.sql
  const downVariants = [
    base.replace(/[._]up\b/i, '_down'),
    base.replace(/[._]up\b/i, '.down'),
    base.replace(/\.sql$/, '.down.sql'),
  ];

  // Also check for a "down" directory sibling
  const downDir = path.join(dir, '..', 'down');

  for (const variant of downVariants) {
    if (variant !== base && fs.existsSync(path.join(dir, variant))) {
      return true;
    }
  }

  if (fs.existsSync(downDir)) {
    const downFiles = fs.readdirSync(downDir);
    // Extract sequence number from current file
    const seqMatch = base.match(/^(\d+)/);
    if (seqMatch) {
      const seq = seqMatch[1];
      if (downFiles.some((f) => f.startsWith(seq))) return true;
    }
  }

  return false;
}

// ── validateMigration ────────────────────────────────────────────────────────

function validateMigration(filePath) {
  if (!filePath || typeof filePath !== 'string') {
    throw new Error('validateMigration() requires a valid file path');
  }

  if (!fs.existsSync(filePath)) {
    throw new Error(`Migration file not found: ${filePath}`);
  }

  const content = fs.readFileSync(filePath, 'utf-8');
  const warnings = [];
  const errors = [];
  const suggestions = [];

  // Check destructive operations
  for (const { pattern, message } of DESTRUCTIVE_PATTERNS) {
    const matches = findAllMatches(content, pattern);
    for (const match of matches) {
      errors.push({
        message,
        line: match.line,
        text: match.text.trim(),
      });
    }
  }

  // Check risky ALTER TABLE without CONCURRENTLY
  const alterMatches = findAllMatches(content, RISKY_ALTER_PATTERN);
  for (const match of alterMatches) {
    // Only warn for ADD INDEX / CREATE INDEX without CONCURRENTLY
    const lineContent = content.split('\n')[match.line - 1] || '';
    if (/\bINDEX\b/i.test(lineContent) && !/\bCONCURRENTLY\b/i.test(lineContent)) {
      warnings.push({
        message: 'ALTER TABLE / INDEX operation without CONCURRENTLY — may lock table',
        line: match.line,
        text: match.text.trim(),
      });
    }
  }

  // Check type narrowing
  for (const { pattern, check } of TYPE_NARROWING_PATTERNS) {
    const matches = findAllMatches(content, pattern);
    for (const match of matches) {
      if (check === 'varchar_narrowing') {
        warnings.push({
          message: 'Potential type narrowing (VARCHAR size reduction) — may truncate data',
          line: match.line,
          text: match.text.trim(),
        });
      } else if (check === 'int_narrowing') {
        warnings.push({
          message: 'Integer type narrowing (to SMALLINT/TINYINT) — may cause overflow',
          line: match.line,
          text: match.text.trim(),
        });
      }
    }
  }

  // Check for missing rollback
  const isUpMigration = /[._]up\b/i.test(path.basename(filePath));
  if (isUpMigration && !checkDownMigrationExists(filePath)) {
    warnings.push({
      message: 'No corresponding down/rollback migration found',
      line: 0,
      text: '',
    });
    suggestions.push('Create a matching rollback migration to enable safe rollbacks');
  }

  // General suggestions
  if (errors.length > 0) {
    suggestions.push('Consider using soft deletes or column renaming instead of DROP operations');
    suggestions.push('Add a data backup step before running destructive migrations');
  }

  if (warnings.some((w) => w.message.includes('CONCURRENTLY'))) {
    suggestions.push('Use CREATE INDEX CONCURRENTLY for PostgreSQL to avoid table locks');
  }

  const valid = errors.length === 0;

  return { valid, warnings, errors, suggestions };
}

// ── validateMigrationChain ───────────────────────────────────────────────────

function validateMigrationChain(dirPath) {
  if (!dirPath || typeof dirPath !== 'string') {
    throw new Error('validateMigrationChain() requires a valid directory path');
  }

  if (!fs.existsSync(dirPath)) {
    throw new Error(`Migration directory not found: ${dirPath}`);
  }

  const files = fs.readdirSync(dirPath)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  if (files.length === 0) {
    return {
      valid: true,
      totalFiles: 0,
      chainErrors: [],
      fileResults: [],
      summary: 'No migration files found',
    };
  }

  const chainErrors = [];
  const fileResults = [];

  // Extract sequence numbers
  const sequences = [];
  for (const file of files) {
    const seqMatch = file.match(/^(\d+)/);
    if (seqMatch) {
      sequences.push({ number: parseInt(seqMatch[1], 10), file });
    } else {
      chainErrors.push({
        message: `File "${file}" does not start with a sequence number`,
        file,
      });
    }
  }

  // Check for gaps
  const sortedSeqs = [...sequences].sort((a, b) => a.number - b.number);
  for (let i = 1; i < sortedSeqs.length; i++) {
    const prev = sortedSeqs[i - 1].number;
    const curr = sortedSeqs[i].number;
    if (curr - prev > 1) {
      chainErrors.push({
        message: `Gap in sequence: ${prev} → ${curr} (missing ${prev + 1})`,
        after: sortedSeqs[i - 1].file,
        before: sortedSeqs[i].file,
      });
    }
  }

  // Check for duplicates
  const seqCounts = {};
  for (const { number, file } of sequences) {
    if (!seqCounts[number]) {
      seqCounts[number] = [];
    }
    seqCounts[number].push(file);
  }

  for (const [num, fileList] of Object.entries(seqCounts)) {
    if (fileList.length > 1) {
      chainErrors.push({
        message: `Duplicate sequence number ${num}: ${fileList.join(', ')}`,
        files: fileList,
      });
    }
  }

  // Validate each migration file
  for (const file of files) {
    const filePath = path.join(dirPath, file);
    const result = validateMigration(filePath);
    fileResults.push({ file, ...result });
  }

  const totalWarnings = fileResults.reduce((sum, r) => sum + r.warnings.length, 0);
  const totalErrors = fileResults.reduce((sum, r) => sum + r.errors.length, 0);
  const allValid = chainErrors.length === 0 && totalErrors === 0;

  return {
    valid: allValid,
    totalFiles: files.length,
    chainErrors,
    fileResults,
    summary: allValid
      ? `All ${files.length} migration(s) passed validation` +
        (totalWarnings > 0 ? ` with ${totalWarnings} warning(s)` : '')
      : `Found ${totalErrors} error(s) and ${chainErrors.length} chain issue(s) across ${files.length} file(s)`,
  };
}

module.exports = { validateMigration, validateMigrationChain };
