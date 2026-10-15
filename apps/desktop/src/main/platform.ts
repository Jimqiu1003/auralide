import type { MenuItemConstructorOptions } from 'electron';

/** Native text editing only; document commands must still pass through Core. */
export const applicationMenuTemplate = (
  platform: NodeJS.Platform,
): MenuItemConstructorOptions[] => {
  const mac = platform === 'darwin';
  return [
    ...(mac ? [{ role: 'appMenu' as const }] : []),
    { label: 'File', submenu: [{ role: mac ? 'close' : 'quit' }] },
    {
      label: 'Edit',
      submenu: [
        { role: 'cut', accelerator: mac ? 'Command+X' : 'Ctrl+X' },
        { role: 'copy', accelerator: mac ? 'Command+C' : 'Ctrl+C' },
        { role: 'paste', accelerator: mac ? 'Command+V' : 'Ctrl+V' },
        { role: 'selectAll', accelerator: mac ? 'Command+A' : 'Ctrl+A' },
      ],
    },
    { role: 'windowMenu' },
  ];
};
