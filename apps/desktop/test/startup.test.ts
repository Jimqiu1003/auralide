import { describe, expect, it } from 'vitest';

import { portableUserDataPath, startupRefusalMessage } from '../src/main/startup.js';

/**
 * Issue #32: a portable build quit with exit code 0 and no window when the single-instance lock
 * could not be acquired. These tests pin the two decisions that fix it, without launching Electron:
 * the portable data directory and the refusal message. The end-to-end behaviour (window appears, or
 * the refusal is visible) is covered by the packaged-app check in the PR description.
 */
describe('portable user-data directory', () => {
  it('places state next to the executable, not in the roaming profile', () => {
    expect(portableUserDataPath('C:\\apps\\Auralide\\Auralide.exe')).toBe(
      'C:\\apps\\Auralide\\user-data',
    );
  });

  it('keeps the same rule for a nested portable folder', () => {
    expect(portableUserDataPath('D:\\tools\\portable\\Auralide.exe')).toBe(
      'D:\\tools\\portable\\user-data',
    );
  });
});

describe('startup refusal message', () => {
  const message = startupRefusalMessage('C:\\apps\\Auralide\\user-data');

  it('names the failure and the data directory so a user can act on it', () => {
    expect(message).toContain('无法启动');
    expect(message).toContain('单实例锁');
    expect(message).toContain('C:\\apps\\Auralide\\user-data');
  });

  it('does not claim a cause it cannot distinguish', () => {
    // The lock cannot be created and the lock being held look identical from inside the process.
    expect(message).toContain('另一个 Auralide 窗口');
    expect(message).toContain('权限');
  });
});
