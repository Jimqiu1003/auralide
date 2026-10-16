import { createRequire } from 'node:module';
import { cp, mkdir, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';

const desktopRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repositoryRoot = resolve(desktopRoot, '../..');
const dist = join(desktopRoot, 'dist');
const bundleDir = join(dist, 'portable-main');
const portableDir = join(dist, 'portable', 'Auralide-win32-x64');

if (process.platform !== 'win32' || process.arch !== 'x64') {
  throw new Error('Desktop Demo portable packaging currently supports Windows x64 only.');
}

// The renderer and preload are built with the existing repository scripts.
// Bundle trusted main and its workspace dependencies for a self-contained app;
// built-in Node modules and Electron stay external, not a second IPC/edit path.
await build({
  configFile: false,
  root: desktopRoot,
  logLevel: 'warn',
  ssr: { noExternal: true, external: ['electron'] },
  build: {
    ssr: join(dist, 'main', 'main.js'),
    target: 'node24',
    outDir: bundleDir,
    emptyOutDir: true,
    minify: false,
    rollupOptions: {
      external: (id) => id === 'electron' || id.startsWith('node:'),
      output: { format: 'es', entryFileNames: 'main.js' },
    },
  },
});

const require = createRequire(import.meta.url);
const electronExecutable = require('electron');
if (typeof electronExecutable !== 'string' || !electronExecutable.endsWith('electron.exe')) {
  throw new Error('Expected the installed official Electron Windows executable.');
}

await rm(portableDir, { force: true, recursive: true });
await mkdir(dirname(portableDir), { recursive: true });
await cp(dirname(electronExecutable), portableDir, { recursive: true });
const packagedApp = join(portableDir, 'resources', 'app');
await mkdir(join(packagedApp, 'dist', 'main'), { recursive: true });
await cp(join(bundleDir, 'main.js'), join(packagedApp, 'dist', 'main', 'main.js'));
await cp(join(dist, 'main', 'preload.cjs'), join(packagedApp, 'dist', 'main', 'preload.cjs'));
await cp(join(dist, 'renderer'), join(packagedApp, 'dist', 'renderer'), { recursive: true });
await cp(join(repositoryRoot, 'LICENSE'), join(packagedApp, 'LICENSE'));
await cp(join(repositoryRoot, 'NOTICE'), join(packagedApp, 'NOTICE'));
await writeFile(
  join(packagedApp, 'package.json'),
  JSON.stringify(
    {
      name: 'auralide',
      version: '0.1.0',
      productName: 'Auralide Desktop Demo',
      private: true,
      type: 'module',
      main: 'dist/main/main.js',
    },
    null,
    2,
  ) + '\n',
);
await writeFile(
  join(portableDir, 'README.txt'),
  'Auralide Desktop Demo 0.1 — unsigned Windows x64 test build.\n' +
    'Keep the entire extracted directory together. Not a production release.\n',
);
await rename(join(portableDir, 'electron.exe'), join(portableDir, 'Auralide.exe'));
process.stdout.write(`Windows x64 unsigned portable Demo: ${portableDir}\n`);
