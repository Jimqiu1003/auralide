# @auralide/desktop

A2 · Studio Productivity 正式桌面 Shell。文档由主进程持有，所有编辑通过 Core
Dispatcher 和 expectedRevision；文件路径只来自主进程原生对话框。

支持切换/增删幻灯片、插入文本/矩形/椭圆、对象及图层选择、修改文本、拖动和键盘移动、
保存/重新打开、Light/Dark/System，以及原生隔离 Aura 工作区。还支持文字字号/字重/颜色/对齐、
形状填充/描边、位置/尺寸输入、顶层/底层调整、会话内 Undo/Redo 和基础演示。
Agent Apply、联网研究、持久版本历史和图像资产管线尚未接入，不加载外部资产。

文字在右侧修改后点击「应用文本修改」；双击画布文字可定位到该输入框。
草稿跨切页/对象/Aura 保留；Escape 撤回当前输入。保存时可明确选择应用所有草稿并保存。
Ctrl/Cmd+S 保存，Ctrl/Cmd+O 打开；方向键移动 1px，Shift+方向键移动 10px，Delete 删除选中对象。
输入框保留原生文本快捷键。关闭未应用输入或未保存文档时需要明确放弃。
输入框之外 Ctrl/Cmd+Z 撤销，Ctrl/Cmd+Shift+Z 或 Ctrl/Cmd+Y 重做；重新打开后历史清空。
F5 从头演示，Shift+F5 从当前页演示；方向键/翻页键导航，Escape 返回编辑器。也可使用工具栏按钮。
「排列」页数值在离开输入框时应用，无效值恢复原值；文本样式位于「格式」页下方。

可打开仓库内 [真实示例文档](../../docs/examples/studio-notes.auralide.json)，另存或修改前先复制到自己的目录。
关闭后重新启动，通过「打开」选择此前保存的文件。没有自动恢复最近文件或自动保存承诺。

[本轮交付与视觉验证](../../docs/reports/demo-v02-shell-report.md)。
[稳定便携预览交付](../../docs/reports/stable-portable-preview.md) 记录当前验证和未完成验收。

## Run

```powershell
pnpm build                            # 在仓库根目录构建全部依赖及桌面应用
pnpm --filter @auralide/desktop start   # production load path: file://dist/renderer/index.html
```

Development load path (Vite dev server + HMR, same security posture):

```powershell
# terminal 1
pnpm --filter @auralide/desktop dev                 # vite on http://localhost:5173 (strictPort)
# terminal 2
pnpm --filter @auralide/desktop start:dev           # == node scripts/launch.mjs --dev
```

`scripts/launch.mjs` is the stable launch entry (also used by the QA workflow): it removes
`ELECTRON_RUN_AS_NODE`, which some tooling sets globally and which would otherwise make the Electron
binary run as plain Node, without a window.

`AURALIDE_DEV_SERVER_URL` is the only switch between the two load paths; `webPreferences`, the
preload bridge, the IPC allow-list and the navigation guards are identical in both.

## Smoke run

```powershell
pnpm --filter @auralide/desktop smoke          # both modes, sequentially
node test/smoke.electron.mjs dev               # dev only
```

Security smoke explicitly loads `#diagnostics`; ordinary launches never show those probes.
The diagnostic fragment is not linked from ordinary product menus. Developers may deliberately load
that entry fragment; remove it and reload to return. It launches a **real window** (Playwright's Electron driver), asserts the renderer, the frozen
preload surface, the allow-listed ping, the refusal path, the console for CSP violations, and the
per-mode policy; then writes `test-artifacts/<mode>.png` (screenshot) and `test-artifacts/<mode>.json`
(machine-readable evidence: checks, console log, main-process startup line). It needs a desktop
session and is separate from `pnpm verify`; native Windows x64/macOS ARM64 CI runs it explicitly.

## Content Security Policy

One source (`vite.config.ts`, plugin `auralide-csp`) injects one of two policies into
`src/renderer/index.html` at the `<!--csp-->` placeholder:

- **build / production**: `script-src 'self'` — no inline script, no `'unsafe-eval'`;
- **serve / development**: additionally `script-src 'unsafe-inline'` (Vite's inline React Refresh
  preamble) and `connect-src ws://localhost:5173` (HMR).

Development never widens production, and the placeholder is mandatory: if it is missing the plugin
throws instead of emitting a page without a policy. The smoke run asserts both directions — the
built `dist/renderer/index.html` stays strict, the served dev page carries the dev policy.

## Troubleshooting

| Symptom                                                           | Cause / fix                                                                                                                                   |
| ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `Process failed to launch!` from the smoke run                    | `ELECTRON_RUN_AS_NODE=1` is set in the shell (some agent/CI shells do this) — Electron then runs as plain Node and opens no window. Unset it. |
| Window is blank, `runtime-status` says `error: ...`               | The preload is missing or stale: rebuild with `pnpm --filter @auralide/desktop build` (`preload.cjs` must exist next to `main.js`).           |
| A second `pnpm start` seems to do nothing                         | `app.requestSingleInstanceLock()` focuses the running instance instead of opening a second one.                                               |
| `error during build: Rolldown failed to resolve "@auralide/core"` | `@auralide/core` was not built. Build it first, or build through turbo (`pnpm build`), which orders dependencies.                             |
| `vite` fails with "port already in use"                           | `strictPort: true` on purpose: another dev server is running. Stop it or change the port **and** the dev CSP together.                        |

## Formal Shell and persistence acceptance

```powershell
# from the repository root after pnpm build
node apps/desktop/test/persistence.electron.mjs
node apps/desktop/test/shell.electron.mjs
```

The shell suite tests two content sizes and both themes, System following, real disk failure/cancel/
conflict, text drafts, keyboard focus, native Aura overlay hiding and escape, and an actual process
restart/reopen/preview. Native dialog choices are stubbed; Core, IPC and disk are real. CI runs both
suites and smoke on Windows x64 and native macOS ARM64. Evidence is under `test-artifacts/`.

## Aura workspace

Choose 「Aura 预览」 to replace the central canvas with a native WebContentsView for the current
slide. Left panels, selection and drafts stay in place. The controlled HTML Lab example remains
available; arbitrary HTML/URLs/scripts/assets and Web Research remain disabled. Escape in the native
preview returns focus to the host; 「返回编辑器」 switches workspaces. Shell dialogs hide the native
view before opening. There is no production iframe. See [Aura architecture](../../docs/architecture/aura-browser.md).

CDP renderer screenshots exclude sibling native views: the shell suite records shell and actual
guest PNGs separately. They are labeled separately rather than passed off as a complete native capture.

The unpackaged-only `--auralide-visual-test` argument permits oversized native windows on macOS CI's
small virtual display for the exact 1280×800 / 1440×900 content-size checks. Ordinary launches retain
the OS sizing policy; this does not grant any renderer or guest capabilities. Screen/work-area/scale
metadata is recorded beside the shell results. These captures do not prove physical monitor fit.
