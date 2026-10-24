import { dirname, join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { portableUserDataPath, startupRefusalMessage } from '../src/main/startup.js';

/**
 * Issue #32: a portable build quit with exit code 0 and no window when the single-instance lock
 * could not be acquired. These tests pin the two decisions that fix it, without launching Electron:
 * the portable data directory and the refusal message. The end-to-end behaviour (window appears, or
 * the refusal is visible) is covered by the packaged-app check in the PR description.
 *
 * Expected values are built with `node:path` rather than written as literals, because `path.join`
 * follows the host platform: a hard-coded `C:\...` passes on Windows and fails on the macOS runner,
 * and a hard-coded `/...` does the reverse.
 */
describe('portable user-data directory', () => {
  it('places state next to the executable, not in the roaming profile', () => {
    const executable = join('/apps', 'Auralide', 'Auralide.exe');
    expect(portableUserDataPath(executable)).toBe(join('/apps', 'Auralide', 'user-data'));
  });

  it('keeps the same rule for a nested portable folder', () => {
    const executable = join('/tools', 'portable', 'Auralide.exe');
    expect(portableUserDataPath(executable)).toBe(join('/tools', 'portable', 'user-data'));
  });

  it('derives the directory from the executable, not from the process working directory', () => {
    const executable = join('/apps', 'Auralide', 'Auralide.exe');
    expect(portableUserDataPath(executable)).toBe(join(dirname(executable), 'user-data'));
  });

  it('never returns the roaming profile directory', () => {
    expect(portableUserDataPath(join('/apps', 'Auralide', 'Auralide.exe'))).not.toContain(
      'AppData',
    );
  });
});

describe('startup refusal message', () => {
  const directory = join('/apps', 'Auralide', 'user-data');
  const message = startupRefusalMessage(directory);

  it('names the failure and the data directory so a user can act on it', () => {
    expect(message).toContain('无法启动');
    expect(message).toContain('单实例锁');
    expect(message).toContain(directory);
  });

  it('does not claim a cause it cannot distinguish', () => {
    // The lock cannot be created and the lock being held look identical from inside the process.
    expect(message).toContain('另一个 Auralide 窗口');
    expect(message).toContain('权限');
  });
});
