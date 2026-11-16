#!/usr/bin/env node
/**
 * Ejecuta un comando con las variables de apps/api/.env (prioridad sobre las globales en desarrollo).
 * Uso: node scripts/with-env.cjs prisma migrate dev
 */
const { existsSync, readFileSync } = require('fs');
const { resolve } = require('path');
const { spawnSync } = require('child_process');
const { parseEnv } = require('util');

const envFile = resolve(__dirname, '..', '.env');
const env = { ...process.env };
if (existsSync(envFile)) {
  const values = parseEnv(readFileSync(envFile, 'utf8'));
  const override = process.env.NODE_ENV !== 'production';
  for (const [k, v] of Object.entries(values)) if (override || env[k] === undefined) env[k] = v;
}

const [cmd, ...args] = process.argv.slice(2);
if (!cmd) {
  console.error('Uso: with-env.cjs <comando> [args...]');
  process.exit(1);
}
const result = spawnSync(cmd, args, { stdio: 'inherit', env, shell: process.platform === 'win32' });
process.exit(result.status ?? 1);
