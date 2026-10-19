import { dirname, join } from 'node:path';

/**
 * Startup decisions extracted from `main.ts` so they can be tested without launching Electron.
 *
 * Background (issue #32): a portable build could exit with code 0 and no window. Electron keeps the
 * single-instance lock inside the user-data directory, so a stale or locked `%APPDATA%\Auralide`
 * made `requestSingleInstanceLock()` fail and the main process quit before showing anything.
 */

/**
 * The user-data directory a portable copy should use: a `user-data` folder next to the executable.
 *
 * Keeping state beside the application is what "portable" has to mean — it also stops one broken
 * profile from permanently poisoning every later launch, because each copy owns its own directory.
 */
export const portableUserDataPath = (executablePath: string): string =>
  join(dirname(executablePath), 'user-data');

/**
 * The message shown when the single-instance lock cannot be acquired.
 *
 * The process cannot distinguish "another copy is running" from "the lock file cannot be created"
 * (stale profile, permissions, locked file), so the wording covers both and never asserts one cause.
 */
export const startupRefusalMessage = (userDataDirectory: string): string =>
  'Auralide 无法启动：未能获取单实例锁。\n\n' +
  '这通常意味着另一个 Auralide 窗口已经在运行，或者数据目录中的锁文件被占用/权限异常。\n\n' +
  `数据目录：${userDataDirectory}\n\n` +
  '请先确认没有正在运行的 Auralide 窗口；如果确认没有，请关闭后重试，或删除上述目录下的锁文件。';
