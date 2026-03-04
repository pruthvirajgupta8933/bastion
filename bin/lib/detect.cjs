'use strict';

const fs = require('fs');
const path = require('path');

// ── Helpers ──────────────────────────────────────────────────────────────────

function fileExists(filePath) {
  return fs.existsSync(filePath);
}

function readFileContent(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf-8');
  } catch {
    return '';
  }
}

function readJSON(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch {
    return null;
  }
}

function hasGlobMatch(dir, pattern) {
  if (!fs.existsSync(dir)) return false;
  try {
    const entries = fs.readdirSync(dir);
    return entries.some((name) => name.match(pattern));
  } catch {
    return false;
  }
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
    // Permission errors etc.
  }
  return count;
}

// ── Detectors ────────────────────────────────────────────────────────────────

function detectNode(projectDir) {
  const pkgPath = path.join(projectDir, 'package.json');
  if (!fileExists(pkgPath)) return { languages: [], frameworks: [], testing: [] };

  const pkg = readJSON(pkgPath);
  if (!pkg) return { languages: [], frameworks: [], testing: [] };

  const languages = ['javascript'];
  const frameworks = [];
  const testing = [];

  const allDeps = {
    ...(pkg.dependencies || {}),
    ...(pkg.devDependencies || {}),
  };

  const frameworkMap = {
    next: 'next.js',
    react: 'react',
    vue: 'vue',
    '@angular/core': 'angular',
    svelte: 'svelte',
    express: 'express',
    fastify: 'fastify',
    '@nestjs/core': 'nestjs',
    nuxt: 'nuxt',
    'solid-js': 'solid',
    astro: 'astro',
    remix: 'remix',
    hono: 'hono',
  };

  const testMap = {
    vitest: 'vitest',
    jest: 'jest',
    mocha: 'mocha',
    playwright: 'playwright',
    '@playwright/test': 'playwright',
    cypress: 'cypress',
    '@testing-library/react': 'testing-library',
  };

  for (const [dep, name] of Object.entries(frameworkMap)) {
    if (allDeps[dep]) frameworks.push(name);
  }

  for (const [dep, name] of Object.entries(testMap)) {
    if (allDeps[dep]) testing.push(name);
  }

  return { languages, frameworks, testing };
}

function detectTypeScript(projectDir) {
  if (fileExists(path.join(projectDir, 'tsconfig.json'))) {
    return { languages: ['typescript'] };
  }
  return { languages: [] };
}

function detectGo(projectDir) {
  const goModPath = path.join(projectDir, 'go.mod');
  if (!fileExists(goModPath)) return { languages: [], frameworks: [] };

  const content = readFileContent(goModPath);
  const frameworks = [];

  const goFrameworks = {
    'github.com/gin-gonic/gin': 'gin',
    'github.com/labstack/echo': 'echo',
    'github.com/gofiber/fiber': 'fiber',
    'github.com/gorilla/mux': 'gorilla',
    'google.golang.org/grpc': 'grpc',
  };

  for (const [mod, name] of Object.entries(goFrameworks)) {
    if (content.includes(mod)) frameworks.push(name);
  }

  return { languages: ['go'], frameworks };
}

function detectPython(projectDir) {
  const pyprojectPath = path.join(projectDir, 'pyproject.toml');
  const requirementsPath = path.join(projectDir, 'requirements.txt');

  if (!fileExists(pyprojectPath) && !fileExists(requirementsPath)) {
    return { languages: [], frameworks: [], testing: [] };
  }

  const content =
    readFileContent(pyprojectPath) + '\n' + readFileContent(requirementsPath);

  const frameworks = [];
  const testing = [];

  const pyFrameworks = {
    django: 'django',
    fastapi: 'fastapi',
    flask: 'flask',
    starlette: 'starlette',
    aiohttp: 'aiohttp',
    tornado: 'tornado',
  };

  const pyTesting = {
    pytest: 'pytest',
    unittest: 'unittest',
    'pytest-asyncio': 'pytest-asyncio',
  };

  for (const [dep, name] of Object.entries(pyFrameworks)) {
    if (content.toLowerCase().includes(dep)) frameworks.push(name);
  }

  for (const [dep, name] of Object.entries(pyTesting)) {
    if (content.toLowerCase().includes(dep)) testing.push(name);
  }

  return { languages: ['python'], frameworks, testing };
}

function detectSwift(projectDir) {
  if (!fileExists(path.join(projectDir, 'Package.swift'))) {
    return { languages: [], frameworks: [] };
  }

  const content = readFileContent(path.join(projectDir, 'Package.swift'));
  const frameworks = [];

  if (content.includes('vapor')) frameworks.push('vapor');
  if (content.includes('Hummingbird')) frameworks.push('hummingbird');

  return { languages: ['swift'], frameworks };
}

function detectRust(projectDir) {
  if (!fileExists(path.join(projectDir, 'Cargo.toml'))) {
    return { languages: [], frameworks: [] };
  }

  const content = readFileContent(path.join(projectDir, 'Cargo.toml'));
  const frameworks = [];

  if (content.includes('actix-web')) frameworks.push('actix-web');
  if (content.includes('axum')) frameworks.push('axum');
  if (content.includes('rocket')) frameworks.push('rocket');
  if (content.includes('tokio')) frameworks.push('tokio');

  return { languages: ['rust'], frameworks };
}

function detectDatabases(projectDir) {
  const databases = [];

  // Prisma
  const prismaSchemaPath = path.join(projectDir, 'prisma', 'schema.prisma');
  if (fileExists(prismaSchemaPath)) databases.push('prisma');

  // Drizzle
  if (
    hasGlobMatch(projectDir, /^drizzle\.config\.\w+$/) ||
    fileExists(path.join(projectDir, 'drizzle.config.ts')) ||
    fileExists(path.join(projectDir, 'drizzle.config.js'))
  ) {
    databases.push('drizzle');
  }

  // Check package.json for other ORMs
  const pkg = readJSON(path.join(projectDir, 'package.json'));
  if (pkg) {
    const allDeps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
    if (allDeps.sequelize) databases.push('sequelize');
    if (allDeps.typeorm) databases.push('typeorm');
    if (allDeps.mongoose || allDeps.mongodb) databases.push('mongodb');
    if (allDeps.pg || allDeps['@prisma/client']) {
      if (!databases.includes('postgresql')) databases.push('postgresql');
    }
    if (allDeps.mysql2 || allDeps.mysql) databases.push('mysql');
    if (allDeps.redis || allDeps.ioredis) databases.push('redis');
  }

  return databases;
}

function detectDeployment(projectDir) {
  const deployment = [];

  if (fileExists(path.join(projectDir, 'Dockerfile')) ||
      fileExists(path.join(projectDir, 'docker-compose.yml')) ||
      fileExists(path.join(projectDir, 'docker-compose.yaml'))) {
    deployment.push('docker');
  }

  if (fileExists(path.join(projectDir, 'vercel.json')) ||
      fileExists(path.join(projectDir, '.vercel'))) {
    deployment.push('vercel');
  }

  if (fileExists(path.join(projectDir, 'serverless.yml')) ||
      fileExists(path.join(projectDir, 'serverless.yaml'))) {
    deployment.push('serverless');
  }

  if (fileExists(path.join(projectDir, 'netlify.toml'))) {
    deployment.push('netlify');
  }

  if (fileExists(path.join(projectDir, 'fly.toml'))) {
    deployment.push('fly.io');
  }

  if (fileExists(path.join(projectDir, 'railway.json')) ||
      fileExists(path.join(projectDir, 'railway.toml'))) {
    deployment.push('railway');
  }

  if (fs.existsSync(path.join(projectDir, '.github', 'workflows'))) {
    deployment.push('github-actions');
  }

  if (fileExists(path.join(projectDir, '.gitlab-ci.yml'))) {
    deployment.push('gitlab-ci');
  }

  return deployment;
}

function calculateFrontendRatio(projectDir) {
  const codeExtensions = ['.ts', '.tsx', '.js', '.jsx', '.vue', '.svelte'];

  const frontendDirs = [
    'src/components', 'src/pages', 'src/views', 'src/layouts',
    'app', 'pages', 'components',
  ];

  const backendDirs = [
    'src/api', 'src/server', 'src/services', 'src/lib',
    'api', 'server', 'lib', 'services',
  ];

  let frontendCount = 0;
  let backendCount = 0;

  for (const dir of frontendDirs) {
    frontendCount += countFilesInDir(path.join(projectDir, dir), codeExtensions);
  }

  for (const dir of backendDirs) {
    backendCount += countFilesInDir(path.join(projectDir, dir), codeExtensions);
  }

  const total = frontendCount + backendCount;
  if (total === 0) return 0;

  return Math.round((frontendCount / total) * 100) / 100;
}

// ── Main detect function ─────────────────────────────────────────────────────

function detect(projectDir) {
  if (!projectDir || typeof projectDir !== 'string') {
    throw new Error('detect() requires a valid project directory path');
  }

  if (!fs.existsSync(projectDir)) {
    throw new Error(`Project directory does not exist: ${projectDir}`);
  }

  const nodeResult = detectNode(projectDir);
  const tsResult = detectTypeScript(projectDir);
  const goResult = detectGo(projectDir);
  const pyResult = detectPython(projectDir);
  const swiftResult = detectSwift(projectDir);
  const rustResult = detectRust(projectDir);

  const languages = [
    ...new Set([
      ...nodeResult.languages,
      ...tsResult.languages,
      ...goResult.languages,
      ...pyResult.languages,
      ...swiftResult.languages,
      ...rustResult.languages,
    ]),
  ];

  const frameworks = [
    ...new Set([
      ...nodeResult.frameworks,
      ...(goResult.frameworks || []),
      ...(pyResult.frameworks || []),
      ...(swiftResult.frameworks || []),
      ...(rustResult.frameworks || []),
    ]),
  ];

  const testing = [
    ...new Set([
      ...nodeResult.testing,
      ...(pyResult.testing || []),
    ]),
  ];

  const databases = detectDatabases(projectDir);
  const deployment = detectDeployment(projectDir);
  const frontendRatio = calculateFrontendRatio(projectDir);

  return {
    languages,
    frameworks,
    databases,
    deployment,
    testing,
    frontendRatio,
    detectedAt: new Date().toISOString(),
  };
}

module.exports = { detect };
