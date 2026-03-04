#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync } = require('child_process');

// ── Constants ────────────────────────────────────────────────────────────────

const SHIPKIT_ROOT = path.resolve(__dirname, '..');
const HOME = require('os').homedir();
const CLAUDE_DIR = path.join(HOME, '.claude');
const SHIPKIT_META_DIR = path.join(HOME, '.shipkit');
const MANIFEST_PATH = path.join(SHIPKIT_META_DIR, 'manifest.json');
const SETTINGS_PATH = path.join(CLAUDE_DIR, 'settings.json');

// Only copy hooks and commands — NEVER rules or agents (ECC owns those)
const COPY_MAPPINGS = [
  { src: 'hooks', dest: 'hooks' },
  { src: 'commands/ship', dest: 'commands/ship' },
];

// The 3 ShipKit hooks — NO context monitor, NO statusline (GSD owns those)
const SHIPKIT_HOOKS = [
  {
    matcher: 'Write|Edit',
    hooks: [
      { type: 'command', command: `node "${path.join(CLAUDE_DIR, 'hooks', 'ship-guardian.js')}"` },
      { type: 'command', command: `bash "${path.join(CLAUDE_DIR, 'hooks', 'ship-format.sh')}"` },
      { type: 'command', command: `node "${path.join(CLAUDE_DIR, 'hooks', 'ship-migration-check.js')}"` },
    ],
  },
];

// ── Utilities ────────────────────────────────────────────────────────────────

function fileHash(filePath) {
  const content = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(content).digest('hex');
}

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function collectFiles(dir) {
  if (!fs.existsSync(dir)) {
    return [];
  }
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const result = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      result.push(...collectFiles(full));
    } else {
      result.push(full);
    }
  }
  return result;
}

function readJSON(filePath) {
  if (!fs.existsSync(filePath)) {
    return null;
  }
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch {
    return null;
  }
}

function writeJSON(filePath, data) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf-8');
}

function isShipkitHook(hookObj) {
  const cmd = typeof hookObj === 'string' ? hookObj : (hookObj && hookObj.command) || '';
  return cmd.includes('ship-');
}

function cleanEmptyDirs(dir) {
  if (!fs.existsSync(dir)) return;
  try {
    const entries = fs.readdirSync(dir);
    if (entries.length === 0) {
      fs.rmdirSync(dir);
    }
  } catch {
    // Not empty or other issue — skip
  }
}

function printUsage() {
  console.log(`
shipkit — Thin addon layer for Claude Code (complements ECC + GSD)

Usage: shipkit <command>

Commands:
  install     Copy hooks + commands to ~/.claude/ and patch settings
  uninstall   Remove ShipKit files from ~/.claude/ and unpatch settings
  detect      Run stack detection on current directory
  scan        Run architecture + migration analysis on current directory
`);
}

// ── Dependency Installation ──────────────────────────────────────────────────

function isCommandAvailable(cmd) {
  try {
    execSync(`which ${cmd}`, { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

function installECC() {
  const eccInstalled = (() => {
    try {
      execSync('npm list -g ecc-universal', { stdio: 'pipe' });
      return true;
    } catch {
      return false;
    }
  })();

  if (!eccInstalled) {
    console.log('  Installing ECC (ecc-universal)...');
    execSync('npm install -g ecc-universal', { stdio: 'inherit' });
  } else {
    console.log('  ECC (ecc-universal): already installed');
  }

  const rulesDir = path.join(CLAUDE_DIR, 'rules', 'common');
  if (!fs.existsSync(rulesDir)) {
    console.log('  Setting up ECC rules (all languages)...');
    execSync('ecc-install typescript python golang swift', { stdio: 'inherit' });
  } else {
    console.log('  ECC rules: already in place');
  }
}

function installGSD() {
  const gsdVersionFile = path.join(CLAUDE_DIR, 'get-shit-done', 'VERSION');
  if (fs.existsSync(gsdVersionFile)) {
    console.log('  GSD (get-shit-done-cc): already installed');
    return;
  }

  console.log('  Installing GSD (get-shit-done-cc)...');
  execSync('npx -y get-shit-done-cc@latest --claude --global', { stdio: 'inherit' });
}

function installRalphLoop() {
  const ralphCommand = path.join(CLAUDE_DIR, 'commands', 'ralph-loop.md');
  const ralphPlugin = path.join(CLAUDE_DIR, 'plugins', 'ralph-wiggum');
  if (fs.existsSync(ralphCommand) || fs.existsSync(ralphPlugin)) {
    console.log('  Ralph Loop: already installed');
    return;
  }

  console.log('  Installing Ralph Loop (official Anthropic plugin)...');
  const tmpDir = '/tmp/claude-code-ralph';

  // Clean up any previous partial clone
  if (fs.existsSync(tmpDir)) {
    execSync(`rm -rf "${tmpDir}"`, { stdio: 'pipe' });
  }

  execSync(
    'git clone --depth 1 --filter=blob:none --sparse https://github.com/anthropics/claude-code.git ' + tmpDir,
    { stdio: 'inherit' }
  );
  execSync('git sparse-checkout set plugins/ralph-wiggum', { cwd: tmpDir, stdio: 'inherit' });

  const pluginSrc = path.join(tmpDir, 'plugins', 'ralph-wiggum');
  if (fs.existsSync(pluginSrc)) {
    // Copy plugin contents into ~/.claude/ (commands/, hooks/, etc.)
    const pluginEntries = fs.readdirSync(pluginSrc, { withFileTypes: true });
    for (const entry of pluginEntries) {
      const srcPath = path.join(pluginSrc, entry.name);
      const destPath = path.join(CLAUDE_DIR, entry.name);
      if (entry.isDirectory()) {
        // Merge directory contents (don't overwrite entire directory)
        const files = collectFiles(srcPath);
        for (const file of files) {
          const relativePath = path.relative(srcPath, file);
          const destFile = path.join(destPath, relativePath);
          ensureDir(path.dirname(destFile));
          fs.copyFileSync(file, destFile);
        }
      } else {
        ensureDir(path.dirname(destPath));
        fs.copyFileSync(srcPath, destPath);
      }
    }
    console.log('  Ralph Loop: plugin files copied to ~/.claude/');
  } else {
    console.warn('  Ralph Loop: plugin directory not found in repo (skipped)');
  }

  // Clean up temp clone
  execSync(`rm -rf "${tmpDir}"`, { stdio: 'pipe' });
}

function ensureDependencies() {
  console.log('ShipKit: Checking dependencies...\n');

  // Require npm
  if (!isCommandAvailable('npm')) {
    console.error('ShipKit: npm is required. Install Node.js first.');
    process.exit(1);
  }

  // Require git (for Ralph Loop clone)
  if (!isCommandAvailable('git')) {
    console.error('ShipKit: git is required.');
    process.exit(1);
  }

  // 1. ECC — Standards Layer
  try {
    installECC();
  } catch (err) {
    console.warn(`  WARNING: ECC installation failed: ${err.message}`);
    console.warn('  Continuing without ECC. Install manually: npm install -g ecc-universal');
  }

  // 2. GSD — Workflow Layer (must install before ShipKit patches settings.json)
  try {
    installGSD();
  } catch (err) {
    console.warn(`  WARNING: GSD installation failed: ${err.message}`);
    console.warn('  Continuing without GSD. Install manually: npx -y get-shit-done-cc@latest --claude --global');
  }

  // 3. Ralph Loop — Autonomous Iteration Layer
  try {
    installRalphLoop();
  } catch (err) {
    console.warn(`  WARNING: Ralph Loop installation failed: ${err.message}`);
    console.warn('  Continuing without Ralph Loop.');
  }

  console.log('\n  Dependencies checked.\n');
}

// ── Install ──────────────────────────────────────────────────────────────────

function install() {
  console.log('ShipKit: Installing addon layer...\n');

  // Install ECC, GSD, Ralph Loop first (GSD patches settings.json before we append)
  ensureDependencies();

  const manifest = { version: '1.0.0', installedAt: new Date().toISOString(), files: {} };

  for (const mapping of COPY_MAPPINGS) {
    const srcDir = path.join(SHIPKIT_ROOT, mapping.src);
    const destDir = path.join(CLAUDE_DIR, mapping.dest);
    const files = collectFiles(srcDir);

    for (const srcFile of files) {
      const relativePath = path.relative(srcDir, srcFile);
      const destFile = path.join(destDir, relativePath);
      ensureDir(path.dirname(destFile));
      fs.copyFileSync(srcFile, destFile);

      const hash = fileHash(srcFile);
      const manifestKey = path.relative(CLAUDE_DIR, destFile);
      manifest.files[manifestKey] = { hash, source: path.relative(SHIPKIT_ROOT, srcFile) };
      console.log(`  Copied: ${manifestKey}`);
    }
  }

  patchSettings();
  writeJSON(MANIFEST_PATH, manifest);

  console.log(`\n  Manifest: ${MANIFEST_PATH}`);
  console.log('ShipKit: Installation complete.\n');
}

// ── Settings Patching ────────────────────────────────────────────────────────

function patchSettings() {
  const settings = readJSON(SETTINGS_PATH) || {};

  // SAFETY: Never touch statusLine — GSD owns it
  // SAFETY: Never touch rules or agents — ECC owns those

  const existingHooks = settings.hooks || {};
  const postToolUse = existingHooks.PostToolUse || [];

  // Check if ship-* hooks already exist (idempotent)
  const hasShipHooks = postToolUse.some((entry) => {
    const hooks = entry.hooks || [];
    return hooks.some((h) => isShipkitHook(h));
  });

  if (hasShipHooks) {
    console.log('\n  Settings: ShipKit hooks already present (skipped)');
    return;
  }

  // Append ShipKit hook entries — never replace existing ones
  const updatedPostToolUse = [...postToolUse, ...SHIPKIT_HOOKS];
  const updatedHooks = { ...existingHooks, PostToolUse: updatedPostToolUse };
  const updatedSettings = { ...settings, hooks: updatedHooks };

  writeJSON(SETTINGS_PATH, updatedSettings);
  console.log('\n  Patched: settings.json (3 hooks appended to PostToolUse)');
}

function unpatchSettings() {
  const settings = readJSON(SETTINGS_PATH);
  if (!settings || !settings.hooks) return;

  const updatedHooks = {};

  for (const [eventType, entries] of Object.entries(settings.hooks)) {
    const filtered = entries
      .map((entry) => {
        const cleanedHooks = (entry.hooks || []).filter((h) => !isShipkitHook(h));
        return cleanedHooks.length > 0 ? { ...entry, hooks: cleanedHooks } : null;
      })
      .filter(Boolean);

    if (filtered.length > 0) {
      updatedHooks[eventType] = filtered;
    }
  }

  const updatedSettings = { ...settings };
  if (Object.keys(updatedHooks).length > 0) {
    updatedSettings.hooks = updatedHooks;
  } else {
    delete updatedSettings.hooks;
  }

  writeJSON(SETTINGS_PATH, updatedSettings);
  console.log('  Unpatched: settings.json (ship-* hooks removed)');
}

// ── Uninstall ────────────────────────────────────────────────────────────────

function uninstall() {
  const manifest = readJSON(MANIFEST_PATH);
  if (!manifest) {
    console.error('ShipKit: No manifest found. Nothing to uninstall.');
    process.exit(1);
  }

  console.log('ShipKit: Uninstalling...\n');

  for (const manifestKey of Object.keys(manifest.files)) {
    const destFile = path.join(CLAUDE_DIR, manifestKey);
    if (fs.existsSync(destFile)) {
      fs.unlinkSync(destFile);
      console.log(`  Removed: ${manifestKey}`);
    }
  }

  cleanEmptyDirs(path.join(CLAUDE_DIR, 'commands', 'ship'));
  cleanEmptyDirs(path.join(CLAUDE_DIR, 'hooks'));

  unpatchSettings();

  if (fs.existsSync(MANIFEST_PATH)) {
    fs.unlinkSync(MANIFEST_PATH);
  }
  cleanEmptyDirs(SHIPKIT_META_DIR);

  console.log('\nShipKit: Uninstallation complete.\n');
}

// ── Detect ───────────────────────────────────────────────────────────────────

function detect() {
  const { detect: runDetect } = require('./lib/detect.cjs');
  const projectDir = process.cwd();

  console.log(`ShipKit: Detecting stack in ${projectDir}\n`);
  const result = runDetect(projectDir);
  console.log(JSON.stringify(result, null, 2));
}

// ── Scan ─────────────────────────────────────────────────────────────────────

function scan() {
  const { analyzeArchitecture } = require('./lib/architecture-analyzer.cjs');
  const { validateMigrationChain } = require('./lib/migration-validator.cjs');
  const projectDir = process.cwd();

  console.log(`ShipKit: Scanning ${projectDir}\n`);

  // Architecture analysis
  const archResult = analyzeArchitecture(projectDir);

  console.log('========================================');
  console.log('  ShipKit Architecture Report');
  console.log('========================================\n');
  console.log(`  Score: ${archResult.score}/100\n`);

  if (archResult.issues.length === 0) {
    console.log('  No issues found.\n');
  } else {
    const grouped = {};
    for (const issue of archResult.issues) {
      const sev = issue.severity;
      if (!grouped[sev]) grouped[sev] = [];
      grouped[sev].push(issue);
    }

    for (const severity of ['critical', 'high', 'medium', 'low']) {
      const issues = grouped[severity];
      if (!issues || issues.length === 0) continue;

      console.log(`  ${severity.toUpperCase()} (${issues.length}):`);
      for (const issue of issues) {
        const loc = issue.file ? `${path.relative(projectDir, issue.file)}:${issue.line}` : '';
        console.log(`    - [${issue.category}] ${issue.message}${loc ? ` (${loc})` : ''}`);
      }
      console.log('');
    }
  }

  if (archResult.suggestions.length > 0) {
    console.log('  Suggestions:');
    for (const suggestion of archResult.suggestions) {
      console.log(`    - ${suggestion}`);
    }
    console.log('');
  }

  // Migration analysis — scan common migration directories
  const migrationDirs = [
    'migrations', 'db/migrations', 'prisma/migrations',
    'drizzle', 'src/migrations', 'database/migrations',
  ];

  let foundMigrations = false;
  for (const dir of migrationDirs) {
    const fullDir = path.join(projectDir, dir);
    if (fs.existsSync(fullDir)) {
      foundMigrations = true;
      console.log('----------------------------------------');
      console.log(`  Migration Analysis: ${dir}/`);
      console.log('----------------------------------------\n');

      const migResult = validateMigrationChain(fullDir);
      console.log(`  ${migResult.summary}\n`);

      if (migResult.chainErrors.length > 0) {
        console.log('  Chain errors:');
        for (const err of migResult.chainErrors) {
          console.log(`    - ${err.message}`);
        }
        console.log('');
      }

      for (const fileResult of migResult.fileResults) {
        if (fileResult.errors.length === 0 && fileResult.warnings.length === 0) continue;
        console.log(`  ${fileResult.file}:`);
        for (const err of fileResult.errors) {
          console.log(`    ERROR: ${err.message} (line ${err.line})`);
        }
        for (const warn of fileResult.warnings) {
          console.log(`    WARN: ${warn.message} (line ${warn.line})`);
        }
      }
    }
  }

  if (!foundMigrations) {
    console.log('  No migration directories found.\n');
  }

  console.log('========================================\n');
}

// ── Main ─────────────────────────────────────────────────────────────────────

function main() {
  const command = process.argv[2];

  if (!command || command === '--help' || command === '-h') {
    printUsage();
    process.exit(0);
  }

  const commands = { install, uninstall, detect, scan };

  const handler = commands[command];
  if (!handler) {
    console.error(`ShipKit: Unknown command "${command}"\n`);
    printUsage();
    process.exit(1);
  }

  try {
    handler();
  } catch (err) {
    console.error(`ShipKit: Error running "${command}": ${err.message}`);
    if (process.env.SHIPKIT_DEBUG) {
      console.error(err.stack);
    }
    process.exit(1);
  }
}

main();
