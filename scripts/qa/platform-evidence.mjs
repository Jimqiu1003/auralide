import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { arch, platform, release } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export function assertPlatformEvidence(evidence, expectedPlatform, expectedArch) {
  assert.ok(
    (expectedPlatform === 'win32' && expectedArch === 'x64') ||
      (expectedPlatform === 'darwin' && expectedArch === 'arm64'),
    'Only Windows x64 and macOS ARM64 are first-release targets',
  );
  assert.equal(evidence.node.platform, expectedPlatform);
  assert.equal(evidence.node.arch, expectedArch);
  assert.equal(evidence.electron.platform, expectedPlatform);
  assert.equal(evidence.electron.arch, expectedArch);
  assert.ok(evidence.electron.version, 'Must execute the actual Electron main process');
  if (expectedPlatform === 'darwin') {
    assert.equal(evidence.uname, 'arm64');
    assert.equal(evidence.arm64Hardware, '1');
    assert.equal(evidence.translated, '0', 'Rosetta is not a native ARM64 verification');
  }
}

async function main() {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
  const appRoot = resolve(root, 'apps/desktop');
  const artifacts = resolve(appRoot, 'test-artifacts');
  const evidence = {
    recordedAt: new Date().toISOString(),
    node: { platform: platform(), arch: arch(), version: process.version, osRelease: release() },
    electron: null,
    pass: false,
  };
  let app;
  try {
    if (process.platform === 'darwin') {
      evidence.uname = execFileSync('/usr/bin/uname', ['-m'], { encoding: 'utf8' }).trim();
      evidence.arm64Hardware = execFileSync('/usr/sbin/sysctl', ['-n', 'hw.optional.arm64'], {
        encoding: 'utf8',
      }).trim();
      evidence.translated =
        execFileSync('/usr/sbin/sysctl', ['-in', 'sysctl.proc_translated'], {
          encoding: 'utf8',
        }).trim() || '0';
    }
    const require = createRequire(resolve(appRoot, 'package.json'));
    const { _electron } = require('playwright-core');
    const env = { ...process.env };
    delete env.ELECTRON_RUN_AS_NODE;
    delete env.AURALIDE_DEV_SERVER_URL;
    app = await _electron.launch({
      executablePath: require('electron'),
      args: [appRoot],
      cwd: appRoot,
      env,
      timeout: 60_000,
    });
    await app.firstWindow();
    evidence.electron = await app.evaluate(() => ({
      platform: process.platform,
      arch: process.arch,
      version: process.versions.electron,
    }));
    assertPlatformEvidence(evidence, process.argv[2], process.argv[3]);
    evidence.pass = true;
  } catch (error) {
    evidence.error = String(error);
    process.exitCode = 1;
  } finally {
    if (app) {
      try {
        await app.close();
      } catch (error) {
        evidence.closeError = String(error);
        evidence.pass = false;
        process.exitCode = 1;
      }
    }
    await mkdir(artifacts, { recursive: true });
    await writeFile(resolve(artifacts, 'platform.json'), `${JSON.stringify(evidence, null, 2)}\n`);
    process.stdout.write(`${JSON.stringify(evidence, null, 2)}\n`);
  }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  await main();
}
