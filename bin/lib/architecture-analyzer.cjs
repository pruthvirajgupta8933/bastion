'use strict';

const fs = require('fs');
const path = require('path');

// ── Constants ────────────────────────────────────────────────────────────────

const CODE_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.vue', '.svelte', '.py', '.go', '.rs'];
const COMPONENT_DIRS = ['components', 'pages', 'views', 'layouts', 'screens'];
const FRONTEND_DIRS = ['src/components', 'src/pages', 'src/views', 'app', 'pages', 'components'];
const BACKEND_DIRS = ['src/api', 'src/server', 'api', 'server', 'lib', 'services'];
const MAX_COMPONENT_LINES = 500;
const FRONTEND_RATIO_WARN = 0.75;
const MAX_FILES_TO_SCAN = 2000;

const DB_IMPORT_PATTERNS = [
  /from\s+['"]@prisma\/client['"]/,
  /require\s*\(\s*['"]@prisma\/client['"]\s*\)/,
  /from\s+['"]drizzle-orm['"]/,
  /from\s+['"]sequelize['"]/,
  /from\s+['"]typeorm['"]/,
  /from\s+['"]mongoose['"]/,
  /import\s+.*\bprisma\b/i,
];

const SECRET_PATTERNS = [
  { pattern: /['"](?:sk|pk)[-_](?:live|test)[-_]\w{20,}['"]/, label: 'Stripe API key' },
  { pattern: /['"]AKIA[0-9A-Z]{16}['"]/, label: 'AWS Access Key' },
  { pattern: /['"]ghp_[a-zA-Z0-9]{36}['"]/, label: 'GitHub Personal Access Token' },
  { pattern: /['"]xox[bpoas]-[a-zA-Z0-9-]+['"]/, label: 'Slack token' },
  { pattern: /password\s*[:=]\s*['"][^'"]{8,}['"](?!\s*(?:process|env|import|require))/i, label: 'Hardcoded password' },
  { pattern: /api[_-]?key\s*[:=]\s*['"][a-zA-Z0-9]{20,}['"]/i, label: 'Hardcoded API key' },
  { pattern: /secret\s*[:=]\s*['"][a-zA-Z0-9+/=]{20,}['"]/i, label: 'Hardcoded secret' },
];

const MONEY_FLOAT_PATTERNS = [
  /(?:price|amount|balance|cost|total|fee|payment|salary|wage|revenue)\s*:\s*(?:float|double|number)\b/i,
  /(?:price|amount|balance|cost|total|fee|payment|salary|wage|revenue)\s*=\s*(?:parseFloat|Number)\b/i,
  /Float\s*.*(?:price|amount|balance|cost|total|fee|payment)/i,
  /(?:price|amount|balance|cost|total|fee)\s+(?:float|double|real)\b/i,
];

// ── Helpers ──────────────────────────────────────────────────────────────────

function collectCodeFiles(dir, maxFiles) {
  const files = [];
  if (!fs.existsSync(dir)) return files;

  const walk = (currentDir) => {
    if (files.length >= maxFiles) return;
    let entries;
    try {
      entries = fs.readdirSync(currentDir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (files.length >= maxFiles) return;
      if (entry.name.startsWith('.') || entry.name === 'node_modules' ||
          entry.name === 'dist' || entry.name === 'build' || entry.name === '.next' ||
          entry.name === 'vendor' || entry.name === '__pycache__') {
        continue;
      }
      const full = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (CODE_EXTENSIONS.some((ext) => entry.name.endsWith(ext))) {
        files.push(full);
      }
    }
  };

  walk(dir);
  return files;
}

function countLines(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    return content.split('\n').length;
  } catch {
    return 0;
  }
}

function readFileContent(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf-8');
  } catch {
    return '';
  }
}

function isInComponentDir(filePath) {
  const normalized = filePath.replace(/\\/g, '/');
  return COMPONENT_DIRS.some((dir) => normalized.includes(`/${dir}/`));
}

function isInFrontendDir(filePath, projectDir) {
  const relative = path.relative(projectDir, filePath).replace(/\\/g, '/');
  return FRONTEND_DIRS.some((dir) => relative.startsWith(dir + '/') || relative.startsWith(dir));
}

function countFilesInDir(dirPath, extensions) {
  if (!fs.existsSync(dirPath)) return 0;
  let count = 0;
  try {
    const walk = (dir) => {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(full);
        } else if (extensions.some((ext) => entry.name.endsWith(ext))) {
          count++;
        }
      }
    };
    walk(dirPath);
  } catch {
    // Permission error etc.
  }
  return count;
}

// ── Checks ───────────────────────────────────────────────────────────────────

function checkFrontendRatio(projectDir) {
  let frontendCount = 0;
  let backendCount = 0;

  for (const dir of FRONTEND_DIRS) {
    frontendCount += countFilesInDir(path.join(projectDir, dir), CODE_EXTENSIONS);
  }
  for (const dir of BACKEND_DIRS) {
    backendCount += countFilesInDir(path.join(projectDir, dir), CODE_EXTENSIONS);
  }

  const total = frontendCount + backendCount;
  if (total === 0) return [];

  const ratio = frontendCount / total;
  if (ratio > FRONTEND_RATIO_WARN) {
    return [{
      severity: 'medium',
      category: 'architecture',
      message: `Frontend code ratio is ${Math.round(ratio * 100)}% (threshold: ${FRONTEND_RATIO_WARN * 100}%). Consider extracting backend logic.`,
      file: '',
      line: 0,
    }];
  }
  return [];
}

function checkGodComponents(files) {
  const issues = [];
  for (const filePath of files) {
    if (!isInComponentDir(filePath)) continue;
    const lineCount = countLines(filePath);
    if (lineCount > MAX_COMPONENT_LINES) {
      issues.push({
        severity: 'high',
        category: 'god-component',
        message: `Component has ${lineCount} lines (max: ${MAX_COMPONENT_LINES}). Break it into smaller components.`,
        file: filePath,
        line: 0,
      });
    }
  }
  return issues;
}

function checkDirectDbAccess(files, projectDir) {
  const issues = [];
  for (const filePath of files) {
    if (!isInFrontendDir(filePath, projectDir)) continue;
    const content = readFileContent(filePath);
    for (const pattern of DB_IMPORT_PATTERNS) {
      if (pattern.test(content)) {
        const lines = content.split('\n');
        const lineNum = lines.findIndex((line) => pattern.test(line)) + 1;
        issues.push({
          severity: 'critical',
          category: 'architecture',
          message: 'Direct database access from frontend code. Use an API layer instead.',
          file: filePath,
          line: lineNum,
        });
        break;
      }
    }
  }
  return issues;
}

function checkNPlusOnePatterns(files) {
  const issues = [];
  // Pattern: for/forEach/while loop containing await + database-like call
  const loopPattern = /(?:for\s*\(|\.forEach\s*\(|while\s*\(|for\s+await)/;
  const awaitDbPattern = /await\s+\w*\.(?:find|query|select|fetch|get|create|update|delete|execute|save|remove)\s*\(/;

  for (const filePath of files) {
    const content = readFileContent(filePath);
    const lines = content.split('\n');

    let insideLoop = false;
    let braceDepth = 0;
    let loopStartLine = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      if (loopPattern.test(line)) {
        insideLoop = true;
        braceDepth = 0;
        loopStartLine = i + 1;
      }

      if (insideLoop) {
        braceDepth += (line.match(/\{/g) || []).length;
        braceDepth -= (line.match(/\}/g) || []).length;

        if (awaitDbPattern.test(line)) {
          issues.push({
            severity: 'high',
            category: 'n-plus-one',
            message: 'Potential N+1 query: database call inside a loop. Use batch queries instead.',
            file: filePath,
            line: i + 1,
          });
        }

        if (braceDepth <= 0 && i > loopStartLine) {
          insideLoop = false;
        }
      }
    }
  }
  return issues;
}

function checkMissingIndexes(projectDir) {
  const issues = [];

  // Check Prisma schema
  const prismaPath = path.join(projectDir, 'prisma', 'schema.prisma');
  if (fs.existsSync(prismaPath)) {
    const content = readFileContent(prismaPath);
    const relationPattern = /(\w+)\s+(\w+)\s+@relation\(fields:\s*\[(\w+)\]/g;
    const indexPattern = /@@index\(\[([^\]]+)\]\)/g;

    const indexedFields = new Set();
    let indexMatch;
    while ((indexMatch = indexPattern.exec(content)) !== null) {
      for (const field of indexMatch[1].split(',')) {
        indexedFields.add(field.trim());
      }
    }

    let relMatch;
    while ((relMatch = relationPattern.exec(content)) !== null) {
      const fkField = relMatch[3];
      if (!indexedFields.has(fkField)) {
        const line = content.substring(0, relMatch.index).split('\n').length;
        issues.push({
          severity: 'medium',
          category: 'missing-index',
          message: `Foreign key field "${fkField}" may need an index for query performance.`,
          file: prismaPath,
          line,
        });
      }
    }
  }

  return issues;
}

function checkFloatForMoney(files) {
  const issues = [];
  for (const filePath of files) {
    const content = readFileContent(filePath);
    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      for (const pattern of MONEY_FLOAT_PATTERNS) {
        if (pattern.test(lines[i])) {
          issues.push({
            severity: 'high',
            category: 'float-money',
            message: 'Float/double used for monetary value. Use integer cents or a Decimal library.',
            file: filePath,
            line: i + 1,
          });
          break;
        }
      }
    }
  }
  return issues;
}

function checkHardcodedSecrets(files) {
  const issues = [];
  for (const filePath of files) {
    // Skip common non-source files
    const basename = path.basename(filePath);
    if (basename.endsWith('.test.ts') || basename.endsWith('.test.js') ||
        basename.endsWith('.spec.ts') || basename.endsWith('.spec.js') ||
        basename.endsWith('.d.ts')) {
      continue;
    }

    const content = readFileContent(filePath);
    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      // Skip comments and env references
      if (line.trim().startsWith('//') || line.trim().startsWith('#') ||
          line.trim().startsWith('*') || line.includes('process.env') ||
          line.includes('os.environ') || line.includes('.env')) {
        continue;
      }

      for (const { pattern, label } of SECRET_PATTERNS) {
        if (pattern.test(line)) {
          issues.push({
            severity: 'critical',
            category: 'hardcoded-secret',
            message: `Potential ${label} found in source code. Use environment variables instead.`,
            file: filePath,
            line: i + 1,
          });
          break;
        }
      }
    }
  }
  return issues;
}

// ── Score Calculation ────────────────────────────────────────────────────────

function calculateScore(issues) {
  let score = 100;

  const penalties = {
    critical: 15,
    high: 10,
    medium: 5,
    low: 2,
  };

  for (const issue of issues) {
    score -= penalties[issue.severity] || 2;
  }

  return Math.max(0, Math.min(100, score));
}

function generateSuggestions(issues) {
  const suggestions = new Set();
  const categories = new Set(issues.map((i) => i.category));

  if (categories.has('god-component')) {
    suggestions.add('Extract large components into smaller, focused sub-components');
  }
  if (categories.has('architecture')) {
    suggestions.add('Introduce an API layer between frontend and database');
  }
  if (categories.has('n-plus-one')) {
    suggestions.add('Replace loop-based queries with batch operations (e.g., WHERE id IN (...))');
  }
  if (categories.has('missing-index')) {
    suggestions.add('Add database indexes on frequently queried foreign key columns');
  }
  if (categories.has('float-money')) {
    suggestions.add('Use integer arithmetic (cents) or a Decimal library for monetary calculations');
  }
  if (categories.has('hardcoded-secret')) {
    suggestions.add('Move all secrets to environment variables or a secrets manager');
  }

  return [...suggestions];
}

// ── Main ─────────────────────────────────────────────────────────────────────

function analyzeArchitecture(projectDir) {
  if (!projectDir || typeof projectDir !== 'string') {
    throw new Error('analyzeArchitecture() requires a valid project directory path');
  }

  if (!fs.existsSync(projectDir)) {
    throw new Error(`Project directory does not exist: ${projectDir}`);
  }

  const files = collectCodeFiles(projectDir, MAX_FILES_TO_SCAN);

  const issues = [
    ...checkFrontendRatio(projectDir),
    ...checkGodComponents(files),
    ...checkDirectDbAccess(files, projectDir),
    ...checkNPlusOnePatterns(files),
    ...checkMissingIndexes(projectDir),
    ...checkFloatForMoney(files),
    ...checkHardcodedSecrets(files),
  ];

  const score = calculateScore(issues);
  const suggestions = generateSuggestions(issues);

  return { score, issues, suggestions };
}

module.exports = { analyzeArchitecture };
