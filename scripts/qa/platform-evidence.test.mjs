import assert from 'node:assert/strict';
import { test } from 'node:test';
import { assertPlatformEvidence } from './platform-evidence.mjs';

const mac = {
  node: { platform: 'darwin', arch: 'arm64' },
  electron: { platform: 'darwin', arch: 'arm64', version: '44' },
  uname: 'arm64',
  arm64Hardware: '1',
  translated: '0',
};

test('requires actual native Node, hardware and Electron identities', () => {
  assertPlatformEvidence(mac, 'darwin', 'arm64');
  assertPlatformEvidence(
    {
      node: { platform: 'win32', arch: 'x64' },
      electron: { platform: 'win32', arch: 'x64', version: '44' },
    },
    'win32',
    'x64',
  );
  assert.throws(() => assertPlatformEvidence(mac, 'darwin', 'x64'));
  assert.throws(() => assertPlatformEvidence(mac, 'linux', 'arm64'));
  assert.throws(() => assertPlatformEvidence({ ...mac, uname: 'x86_64' }, 'darwin', 'arm64'));
  assert.throws(() => assertPlatformEvidence({ ...mac, translated: '1' }, 'darwin', 'arm64'));
  assert.throws(() =>
    assertPlatformEvidence(
      { ...mac, electron: { ...mac.electron, arch: 'x64' } },
      'darwin',
      'arm64',
    ),
  );
  assert.throws(() =>
    assertPlatformEvidence({ ...mac, node: { ...mac.node, arch: 'x64' } }, 'darwin', 'arm64'),
  );
});
