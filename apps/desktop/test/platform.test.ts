import { describe, expect, it } from 'vitest';

import { applicationMenuTemplate } from '../src/main/platform.js';

describe('native platform menu', () => {
  it('uses the macOS application menu and Command shortcuts', () => {
    const menu = applicationMenuTemplate('darwin');
    expect(menu[0]?.role).toBe('appMenu');
    expect(JSON.stringify(menu)).toContain('Command+C');
    expect(JSON.stringify(menu)).toContain('"role":"close"');
    expect(JSON.stringify(menu)).not.toContain('Ctrl+');
  });

  it('uses Windows quit and Ctrl shortcuts without document mutation handlers', () => {
    const menu = applicationMenuTemplate('win32');
    expect(menu[0]?.label).toBe('File');
    expect(JSON.stringify(menu)).toContain('Ctrl+C');
    expect(JSON.stringify(menu)).toContain('"role":"quit"');
    expect(JSON.stringify(menu)).not.toContain('Command+');
    expect(JSON.stringify(menu)).not.toContain('undo');
    expect(JSON.stringify(menu)).not.toContain('redo');
  });
});
