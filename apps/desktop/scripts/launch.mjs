#!/usr/bin/env node
/**
 * Stable launch entry for the Electron shell (see P1.1: "a stable desktop launch entry ... for the QA
 * workflow").
 *
 * Two environment facts are handled here rather than in the app:
 * - `ELECTRON_RUN_AS_NODE` makes the Electron binary behave like plain Node, so the GUI never opens.
 *   It is inherited from the surrounding tooling (DSH sets it), so it is removed explicitly.
 * - `--dev` points the shell at the Vite dev server unless the caller already chose a URL.
 */
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const appDirectory = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);

const env = { ...process.env };

if (env.ELECTRON_RUN_AS_NODE !== undefined) {
  console.log(
    '[launch] removed ELECTRON_RUN_AS_NODE so Electron starts the GUI instead of plain Node',
  );
  delete env.ELECTRON_RUN_AS_NODE;
}

if (process.argv.includes('--dev') && (env.AURALIDE_DEV_SERVER_URL ?? '') === '') {
  env.AURALIDE_DEV_SERVER_URL = 'http://localhost:5173';
}

const electronExecutable = require('electron');

const child = spawn(electronExecutable, ['.'], {
  stdio: 'inherit',
  env,
  cwd: appDirectory,
});

child.on('exit', (code, signal) => {
  if (signal !== null) {
    console.error(`[launch] Electron terminated by ${signal}`);
    process.exitCode = 1;
    return;
  }
  process.exitCode = code ?? 0;
});

child.on('error', (error) => {
  console.error(`[launch] could not start Electron: ${error.message}`);
  process.exitCode = 1;
});
