import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { cp, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';

const desktopRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repositoryRoot = resolve(desktopRoot, '../..');
const dist = join(desktopRoot, 'dist');
const version = '0.2.0-preview.1';
const commit = execFileSync('git', ['rev-parse', 'HEAD'], {
  cwd: repositoryRoot,
  encoding: 'utf8',
}).trim();
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const name = `Auralide-${version}-${commit.slice(0, 7)}-win32-x64-${stamp}`;
const bundleDir = join(dist, `portable-main-${stamp}`);
const portableDir = join(dist, 'portable', name);

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
    emptyOutDir: false,
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

await mkdir(dirname(portableDir), { recursive: true });
await mkdir(portableDir);
await cp(dirname(electronExecutable), portableDir, { recursive: true });
const packagedApp = join(portableDir, 'resources', 'app');
await mkdir(join(packagedApp, 'dist', 'main'), { recursive: true });
await cp(join(bundleDir, 'main.js'), join(packagedApp, 'dist', 'main', 'main.js'));
await cp(join(dist, 'main', 'preload.cjs'), join(packagedApp, 'dist', 'main', 'preload.cjs'));
await cp(join(dist, 'renderer'), join(packagedApp, 'dist', 'renderer'), { recursive: true });
await cp(join(repositoryRoot, 'LICENSE'), join(packagedApp, 'LICENSE'));
await cp(join(repositoryRoot, 'NOTICE'), join(packagedApp, 'NOTICE'));
const domRequire = createRequire(require.resolve('react-dom/package.json'));
const cssRequire = createRequire(require.resolve('postcss/package.json'));
const licenses = [];
for (const name of [
  'react',
  'react-dom',
  'scheduler',
  'zod',
  'acorn',
  'postcss',
  'nanoid',
  'picocolors',
  'source-map-js',
]) {
  const resolver =
    name === 'scheduler'
      ? domRequire
      : ['nanoid', 'picocolors', 'source-map-js'].includes(name)
        ? cssRequire
        : require;
  const metadata = resolver.resolve(`${name}/package.json`);
  const info = JSON.parse(await readFile(metadata, 'utf8'));
  licenses.push(
    `${name}@${info.version}\n${await readFile(join(dirname(metadata), 'LICENSE'), 'utf8')}`,
  );
}
await writeFile(join(portableDir, 'THIRD_PARTY_NOTICES.txt'), licenses.join('\n\n'));
await mkdir(join(portableDir, 'Examples'));
await cp(
  join(repositoryRoot, 'docs/examples/studio-notes.auralide.json'),
  join(portableDir, 'Examples', 'studio-notes.auralide.json'),
);
await writeFile(
  join(packagedApp, 'package.json'),
  JSON.stringify(
    {
      name: 'auralide',
      version,
      productName: 'Auralide',
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
  `Auralide ${version} — Windows x64 portable preview\nSource: ${commit}\n\n` +
    '解压完整文件夹，双击 Auralide.exe。无需安装 Node.js 或 pnpm。\n' +
    '请保持 exe、resources 和其余运行库在同一文件夹，不要只复制 exe。\n' +
    '支持基础编辑、会话内撤销/重做、保存/重开，以及含图片/字体/音视频的离线 HTML 封装。\n' +
    '动态源 HTML 可保留为隔离组件；单文件上限 100 MiB，未知动态依赖可能不支持。\n' +
    'Agent Apply、任意 HTML 无损编辑、持久撤销历史及 PPTX/PDF 尚未交付。\n' +
    '这是未签名预览版；Windows 可能提示未知发布者。正式版本发布需另外验收。\n',
);
await rename(join(portableDir, 'electron.exe'), join(portableDir, 'Auralide.exe'));
const manifest = {
  version,
  commit,
  builtAt: stamp,
  platform: process.platform,
  arch: process.arch,
  directory: portableDir,
  executable: join(portableDir, 'Auralide.exe'),
};
await writeFile(join(portableDir, 'build-info.json'), JSON.stringify(manifest, null, 2) + '\n');
await mkdir(join(desktopRoot, 'test-artifacts'), { recursive: true });
await writeFile(
  join(desktopRoot, 'test-artifacts', 'portable-build.json'),
  JSON.stringify(manifest, null, 2) + '\n',
);
process.stdout.write(`Windows x64 unsigned portable preview: ${portableDir}\n`);
