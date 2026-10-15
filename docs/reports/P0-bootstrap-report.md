# Auralide P0 基础设施实施报告

> **语言说明**：本报告是交付给项目所有者的中文实施报告；仓库内其余文档（`README.md`、`AGENTS.md`、`CONTRIBUTING.md`、`docs/**`、ADR）均以英文撰写，本报告不改变这一点。
>
> | 元信息       | 值                                                                                                                                          |
> | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
> | 报告日期     | 2026-10-15（Asia/Shanghai）                                                                                                                 |
> | 执行者       | Lead Engineering Agent（DSH）                                                                                                               |
> | 撰写 / 修订  | teammate `report-drafter`（仅写入本文件）                                                                                                   |
> | 事实快照时间 | **2026-10-15 16:49 +08:00**（P0 收尾时点；Git / CI / GitHub 事实均以该时点实测为准）                                                        |
> | 项目 / 仓库  | Auralide — AI-Native HTML Presentation Editor（P0 Infrastructure Bootstrap）· `D:\01_Projects\01_MyProjects\Auralide Dev`                   |
> | 当前 main    | `5f3ad2e36fda1d1a37e6659e41d870a32ae383e9`（PR #2 merge commit），本地与 `origin/main` 一致                                                 |
> | 报告所在 PR  | [PR #3](https://github.com/Jimqiu1003/auralide/pull/3)，分支 `docs/p0-report-and-corrections` @ `ad69300`，**本 PR 即交付本报告，尚未合并** |

## 1. 概述

**一句话结论**：P0 基础设施已完成并收敛——三项 PR（#1 硬化、#2 Windows 长路径删除修复、#3 本报告与文档修正）中 #1/#2 已合并且 5 次 CI 全绿，worktree `remove` 的致命缺陷已在最终 main 上复测通过，许可证与密钥审计完成；但**桌面应用仍未启动验证、无 E2E**；分支保护曾因 Free 计划不可用，**已随同日公开而启用，见 §14 后记**。

P0 范围（依据 `AGENTS.md` §2）：**只做基础设施，不实现产品功能**，交付物是"能让 P1 安全开始"的工程底座而非编辑器能力。

### 1.1 状态总览：成功验证

以下每一项都有可复现的执行证据（命令见 §9）。

| 项                     | 证据                                                                                                                                                                                              | 证据来源                                                                                                          |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| 三项提交已收敛到 main  | `97530e6` → `55637b0`（PR #1 合并）→ `5f3ad2e`（PR #2 合并）= 当前 `origin/main`；本地 `main` 与远程一致、工作树干净                                                                              | 本报告作者复跑 `git log`/`git status`                                                                             |
| CI 5 次 run 全绿       | `38703672735` 49s、`38706529383` 36s、`38706839916` 45s、`38707513532` 48s、`38707655187` 53s，结论全部 success                                                                                   | 本报告作者复跑 `gh run view`（逐 run 计算）                                                                       |
| CI job 结构            | job `verify`（ubuntu-latest）每次 **14 个 step** = 1 个平台 `Set up job` + 9 个业务 step + 4 个 post/complete，全部 success                                                                       | 本报告作者复跑（5 个 run 逐个核对）                                                                               |
| 全量本地校验           | `pnpm verify` 退出码 0（format:check → lint → typecheck → test → build）                                                                                                                          | Lead 实测；冷缓存证据见下条                                                                                       |
| 冷缓存复跑证据         | CI 每次都是全新 clone（无 Turbo 远端缓存），另有本机 `turbo run … --force` 复跑通过                                                                                                               | qa-verifier 提出缓存重放风险，Lead 补跑（§9 说明）                                                                |
| 类型检查 / 构建覆盖    | typecheck 10/10 成功；build 9/9 成功（含 Vite renderer 打包，18 modules，219.93 kB）                                                                                                              | Lead 实测（turbo 汇总）                                                                                           |
| 单元测试               | 10 个通过（`@auralide/core` 5 + `@auralide/cli` 5），用例确有断言                                                                                                                                 | Lead 实测执行；用例数由本报告作者读源文件核对                                                                     |
| PR #1 修复项           | worktree 脚本标量索引 bug（`status` 打印 `m @ 9`、`remove` 恒报 "48 个未合并提交"）+ main 推送本地防护                                                                                            | 已 MERGED（`55637b0`），合并后复测通过                                                                            |
| PR #2 修复项           | Windows 长路径下 worktree 删除不可靠（exit 0 却残留文件；`Filename too long`）                                                                                                                    | 已 MERGED（`5f3ad2e`），**在最终 main 上以 264 字符路径实测**：创建 → install → check → remove → 目录与分支均消失 |
| 许可证审计             | 146 个不同包名 / 149 个实例：MIT 112、Apache-2.0 15、BSD-2 7、ISC 7、BSD-3 2、MPL-2.0 2、BlueOak 1；无 GPL/AGPL/LGPL/SSPL/UNLICENSED、无缺失字段；`pnpm audit` → `No known vulnerabilities found` | license-auditor（本 PR 记录于 §5.1 与 `docs/architecture/security.md`）                                           |
| 密钥扫描               | 11 类密钥模式 × 78 个跟踪文件 × 全历史 3 个提交 → **0 命中**                                                                                                                                      | license-auditor                                                                                                   |
| 文档过度声明已修正     | `CONTRIBUTING.md` 去掉 "main is protected"；`docs/architecture/security.md` 许可证分布改为审计事实并记录批准决定；`docs/reports/` 报告入库消除引用死链                                            | 本 PR（差异已核对，见 §10.2-7）                                                                                   |
| CLI 端到端             | `--version` / `--version --json` / `--help` / `--bogus` 四项行为与退出码符合预期                                                                                                                  | 本报告作者复跑                                                                                                    |
| 本地 main 推送防护行为 | hermetic 三例（main → exit 1、功能分支 → exit 0、覆盖变量 → exit 0）+ 端到端 `git push --dry-run origin HEAD:main` → exit 1                                                                       | Lead 实测 + 本报告作者 hermetic 复跑                                                                              |
| 远程仓库事实           | `private`、默认分支 `main`、License 识别 Apache-2.0、owner `Jimqiu1003`                                                                                                                           | 本报告作者复跑 `gh repo view` / repo-verifier 交叉核实                                                            |
| Electron 依赖形态      | 已安装 `electron@44.7.2`，其 `package.json` **无 `scripts` 字段**，无 `dist/`、无 `path.txt`（二进制未下载）                                                                                      | 本报告作者复跑（`npm view … hasInstallScript` 为空）                                                              |

### 1.2 状态总览：已配置但未验证

"配置存在或约束已记录，但缺少运行时 / 端到端证据"。

| 项                            | 已配置的事实                                                                                                                                                                   | 缺什么证据                                                                      |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------- |
| Vite dev server 与 CSP        | `apps/desktop/src/renderer/index.html` 的严格 CSP 与 Vite 注入的内联 React Refresh preamble 冲突已定位；处理方向（dev 放宽 `script-src` 或改由 main 进程下发响应头 CSP）已明确 | **未运行 `pnpm dev`**，放宽方案未实测                                           |
| `pnpm audit` 进 CI            | 本次为**手动执行**，结果 0 漏洞                                                                                                                                                | workflow 中无该步骤，无持续保证                                                 |
| preload / IPC 通道            | 仅有架构约束（`docs/architecture/security.md` 规定不给不可信渲染代码无限制 Node/FS 访问）                                                                                      | **桥未实现**，无任何可验证行为（按事实清单归位于此，与"未完成"重叠，见 §13-12） |
| worktree 脚本 `sync` 子命令   | 脚本已实现（fetch → 表格 → `worktree prune --verbose`）                                                                                                                        | 无实测记录（`new/check/remove/status` 已实测）                                  |
| `pnpm hooks:install` 脚本路径 | `package.json` 已含该脚本；`core.hooksPath=.githooks` 已生效                                                                                                                   | 该脚本本身未被观测到执行过（等价命令先行生效）                                  |

### 1.3 状态总览：未完成

| 项                           | 现状                                                                                                                               | 影响                            |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| 桌面应用启动验证             | Electron 二进制未下载（v44 取消 postinstall，改为首次运行按需下载）；`pnpm --filter @auralide/desktop start` 未运行                | 窗口能否打开**未知**            |
| Playwright E2E               | 未引入（仅选型审计），**未做任何 E2E**                                                                                             | 无浏览器级回归防线              |
| dev server                   | 见 §1.2；dev 模式目前不可用                                                                                                        | 开发体验受限                    |
| Dependabot / secret scanning | 漏洞告警 API 返回 404 `Vulnerability alerts are disabled`；`security_and_analysis: null`；无 GHAS                                  | 无供应链自动告警                |
| GitHub 侧分支保护            | Free 计划 + private 仓库不支持（`POST/PUT/GET` 全部 403，`branches/main` → `protected: false`）                                    | 只能依赖本地钩子 + 纪律         |
| 6 个 layer 包的实现          | `renderer`/`canvas`/`editor-ui`/`html-bridge`/`agent`/`exporters` 只导出 `layer` 常量，**无任何业务逻辑**（P0 有意为之的边界占位） | P0 不产生产品价值，符合既定范围 |
| TypeScript 7.x               | 未升级（`typescript-eslint@8.71.2` peer 上限 `<6.1.0`）                                                                            | 停留在 TS 6.0.3                 |
| Electron 打包 / 签名         | 未开始（含 Chromium/Node 声明随附问题）                                                                                            | 无分发物                        |
| PR #3                        | 分支 `docs/p0-report-and-corrections` @ `ad69300` 尚未合并（PR #3 已创建，等待 CI 通过后合并）                                     | 报告与文档修正尚未进入 main     |
| `docs/reports` 之外的 P1 项  | 见 §12                                                                                                                             | —                               |

### 1.4 独立验证（teammate 角色与处置）

P0 收尾阶段引入独立角色交叉验证，结论与处置如下：

| 角色              | 职责                       | 结论                                                                                                                                                                                                        | 处置                                                                                  |
| ----------------- | -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `qa-verifier`     | 独立复验本地交付物         | **PARTIAL**：lockfile 可复现、TS strict 真实生效（注入 TS7006/TS2322 后 typecheck exit 1）、CLI 退出码契约、测试确有断言 → PASS；worktree `remove` → **FAIL**；另提出 `pnpm verify` 可能全是 Turbo 缓存重放 | FAIL 项即 §10.2-3/4，由 PR #1/#2 修复并在最终 main 上复测通过；缓存提醒写入 §9 与 §11 |
| `gap-auditor`     | 对 P0.1–P0.11 做对抗性审计 | MET：P0.1/P0.2/P0.3/P0.7/P0.10；PARTIAL：P0.4/P0.5/P0.6/P0.8/P0.9/P0.11                                                                                                                                     | 查出的过度声明与死链即 §10.2-7，本 PR 修正                                            |
| `license-auditor` | 许可证 / 供应链 / 密钥     | 见 §5.1；另确认：`allowBuilds` 无实项、`pendingBuilds: []`、149 个实例 0 个有 install 脚本、lockfile 与 10 个 importer 的 29 条声明依赖完全一致                                                             | 批准决定记录进 `security.md`，白名单加入 BlueOak                                      |
| `repo-verifier`   | 远端核实                   | 仓库 private、默认分支 main、License 识别 Apache-2.0、首次提交 77 blob 与本地一致；403 证据；并指出 `.githooks` 在本地 main 快进前不生效                                                                    | 已在合并后 main 上解决（见 §6）                                                       |
| `report-drafter`  | 本报告草稿与恢复           | 报告草稿因收尾操作失误被误删后原样重建（322 行 / 54,151 字节）                                                                                                                                              | 见 §10.2-8                                                                            |

## 2. 已完成事项（按 P0.1–P0.11 分组）

> 编号沿用 P0 任务书的定义：工作区审计 → 环境审计 → Git/GitHub → Monorepo → 版本控制策略 → Worktree → 多 Agent → GitHub 设施 → 安全与依赖 → 架构文档 → 最终验证。状态列为实测/独立审计结论。

| 编号  | 事项            | 交付物与证据                                                                                                                                                                                                                                                                                                                           | 状态                                    |
| ----- | --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| P0.1  | 工作区审计      | 路径存在且仅有 `AGENT.md`（无嵌套 Git、无未提交内容、11 类敏感模式 0 命中）；`AGENT.md` → `AGENTS.md` 为规范化重命名，重命名前后 SHA256 均为 `455B086F7D489856901A58535E81D72B5CD2E60FD51CBCAC92E3DECD36B07206`（内容零丢失）                                                                                                          | MET                                     |
| P0.2  | 开发环境审计    | §4 版本表；Git 身份 `Jim <jimqiu1003@gmail.com>`；`gh` 已登录 `Jimqiu1003`（scope `repo`/`workflow`）；Node 24.21.0 为 Active LTS；npm registry 可达；Git 因全局 `http.https://github.com.proxy` 指向失效代理而失败 → 以仓库级空值覆盖解决，**未改全局配置**                                                                           | MET                                     |
| P0.3  | Git 与 GitHub   | `git init -b main`；`origin` = <https://github.com/Jimqiu1003/auralide>（Private）；首次提交 `97530e6` 已推送，本地与远程一致（`git ls-remote` 复验）                                                                                                                                                                                  | MET                                     |
| P0.4  | Monorepo 脚手架 | workspace/turbo/tsconfig.base/ESLint/Prettier/EditorConfig；`apps/{desktop,cli}`、`packages/{core,renderer,canvas,editor-ui,html-bridge,agent,exporters}`、`docs/*`、`scripts/dev`、`tests/fixtures` 全部存在；`pnpm install --frozen-lockfile` 与 lint/typecheck/test/build 真实可执行（冷缓存证据见 §9）；本 PR 补齐 `docs/reports/` | MET（本 PR 后闭环）                     |
| P0.5  | 版本控制策略    | 分支命名与 Conventional Commits 落地（`97530e6`/`38f84e1`/`522f96c` 均合规，worktree 脚本强制前缀）；GitHub 侧保护**不可用**（4 个 API 全 403，`protected: false`），补偿控制 `.githooks/pre-push`（hermetic 三例 + `git push --dry-run origin HEAD:main` → exit 1）                                                                   | PARTIAL（平台限制，已如实记录）         |
| P0.6  | Worktree 管理   | `scripts/dev/worktree.ps1`：status/list/new/check/remove/sync + 三类安全拒绝 + `-DryRun`；PR #1 修标量索引 bug、PR #2 修 Windows 长路径删除；在最终 main 上以 264 字符路径实测「创建 → install → check → remove → 目录与分支均消失」                                                                                                   | MET                                     |
| P0.7  | 多 Agent 协作   | `docs/agents/{COLLABORATION.md,TASK-PROTOCOL.md,WORKTREE-GUIDE.md}`：角色、单文件串行、独立 worktree、交付含验证、禁改 main、禁删他人工作区全部成文；P0 收尾以 5 个独立 teammate 实际演练（§1.4）                                                                                                                                      | MET                                     |
| P0.8  | GitHub 协作设施 | Issue 模板（bug/feature/config）、PR 模板、`CONTRIBUTING.md`（本 PR 补 Labels 清单与重建命令）、**16 个 Labels**（10 默认 + 6 项目标签）、CI workflow 真实执行 5/5 全绿（§8）                                                                                                                                                          | MET                                     |
| P0.9  | 安全与依赖      | secrets 不入库（11 类模式 × 78 文件 × 全历史 0 命中）；`.env*`/密钥/产物/缓存均忽略（本 PR 增补 `*.crt` 等与 `.npmrc`）；lockfile 已提交且 `--frozen-lockfile` 可用；许可证审计 146 包名（无 GPL/AGPL，MPL-2.0 与 BlueOak 已记录批准决定）；HTML 沙箱与「不给不可信代码 Node/FS 权限」约束成文且落到 `main.ts` 实际配置                | PARTIAL（审计完成；自动告警/门禁留 P1） |
| P0.10 | 架构文档        | `docs/architecture/{overview.md,repository-structure.md,security.md}`；`docs/decisions/ADR-0001-foundation.md` 覆盖全部 8 项决策（独立 Apache-2.0 仓库、TS/React/Electron、pnpm Monorepo、Local-first、Core 与 UI 解耦、HTML-first Renderer、结构化文档模型、Agent 与用户共享统一命令层）                                              | MET                                     |
| P0.11 | 最终验证与报告  | 12 项逐条见 §9；本报告 `docs/reports/P0-bootstrap-report.md` 随本 PR 交付                                                                                                                                                                                                                                                              | MET（待本 PR 合并）                     |

## 3. 目录结构（基于仓库实际内容）

```text
Auralide Dev/                       # 主仓库（HEAD 5f3ad2e，main，工作树干净）
├─ .github/
│  ├─ ISSUE_TEMPLATE/{bug_report.yml, config.yml, feature_request.yml}
│  ├─ pull_request_template.md
│  └─ workflows/ci.yml
├─ apps/
│  ├─ cli/       src/{index.ts, args.ts, args.test.ts, version.ts}；dist/ 未入 Git
│  └─ desktop/   src/main/main.ts（Electron 主进程）、src/renderer/{index.html, main.tsx, styles.css}、vite.config.ts；dist/ 未入 Git
├─ packages/                        # 7 个架构层包（每个含 package.json + tsconfig{,.build}.json）
│  ├─ core/src/{index.ts, layer.ts, result.ts, result.test.ts}   # 唯一有实现与测试的包
│  ├─ renderer/src/index.ts         # 仅 `export const layer: Layer = 'renderer'`
│  ├─ canvas/src/index.ts           # 仅 layer 声明
│  ├─ editor-ui/src/index.ts        # 仅 layer 声明
│  ├─ html-bridge/src/index.ts      # 仅 layer 声明
│  ├─ agent/src/index.ts            # 仅 layer 声明
│  └─ exporters/src/index.ts        # 仅 layer 声明
├─ scripts/dev/worktree.ps1         # PR #2 后含长路径删除与校验逻辑
├─ tests/fixtures/README.md         # 占位说明，尚无 fixture
├─ docs/
│  ├─ architecture/{overview.md, repository-structure.md, security.md}   # security.md 含审计后许可证分布
│  ├─ agents/{COLLABORATION.md, TASK-PROTOCOL.md, WORKTREE-GUIDE.md}
│  ├─ decisions/ADR-0001-foundation.md
│  └─ reports/P0-bootstrap-report.md     # ← 本文件（PR #3 新增）
├─ .editorconfig  .env.example  .gitattributes  .gitignore  .prettierignore  .prettierrc.json
├─ eslint.config.js  AGENTS.md  README.md  CONTRIBUTING.md  LICENSE  NOTICE
├─ package.json  pnpm-lock.yaml  pnpm-workspace.yaml  tsconfig.base.json  turbo.json
└─ .githooks/pre-push              # PR #1 入库；主工作区已快进到 5f3ad2e，钩子本地已生效
```

Git 跟踪文件总数 **77**（实测），与首次提交的 "77 files changed" 一致；`docs/reports/P0-bootstrap-report.md` 随 PR #3 新增后成为第 78 个跟踪文件。

## 4. 工具版本表

| 工具                 | 版本                                         | 备注                                                                                                            |
| -------------------- | -------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Windows              | 11 专业版，build 26300（Win32NT 10.0.26300） | 实测                                                                                                            |
| PowerShell           | 7.6.6                                        | 实测                                                                                                            |
| Git                  | 2.55.0.windows.5                             | 实测                                                                                                            |
| GitHub CLI           | 2.102.0                                      | 实测                                                                                                            |
| Node.js              | 24.21.0                                      | Active LTS 线；当前最新 LTS 24.22.0，**未升级**                                                                 |
| npm                  | 11.19.0                                      | 实测                                                                                                            |
| pnpm                 | 12.11.2                                      | Corepack 0.36.0                                                                                                 |
| Corepack             | 0.36.0                                       | `corepack enable` 因需写 `C:\Program Files\nodejs` 而 EPERM 失败，改用 `npm install -g pnpm@12.11.2` 用户级安装 |
| TypeScript           | 6.0.3                                        | `typescript-eslint@8.71.2` 的 peer 上限为 `typescript <6.1.0`，故未采用 TS 7.0.2                                |
| Turborepo            | 2.11.8                                       | —                                                                                                               |
| ESLint               | 10.12.0                                      | —                                                                                                               |
| typescript-eslint    | 8.71.2                                       | —                                                                                                               |
| Prettier             | 3.9.10                                       | —                                                                                                               |
| Vitest               | 5.0.4                                        | —                                                                                                               |
| Vite                 | 8.3.4                                        | —                                                                                                               |
| @vitejs/plugin-react | 6.1.2                                        | —                                                                                                               |
| React                | 19.3.1                                       | 在 `minimumReleaseAge` 窗口内，已显式白名单                                                                     |
| Electron             | 44.7.2                                       | 二进制未下载（v44 取消 postinstall，见 §10.2-6）；桌面应用未启动验证                                            |
| Zod                  | 4.6.7                                        | —                                                                                                               |
| Python               | 3.12.10                                      | 实测                                                                                                            |
| VS Code              | 1.141.0                                      | —                                                                                                               |
| Codex CLI            | 0.159.3                                      | —                                                                                                               |

## 5. GitHub 仓库信息

| 项                  | 值                                                                                                                                                                                                               |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| URL                 | <https://github.com/Jimqiu1003/auralide>                                                                                                                                                                         |
| 可见性              | **Private**                                                                                                                                                                                                      |
| 默认分支            | `main`（`branches/main` → `protected: false`）                                                                                                                                                                   |
| 账号 / Owner        | `Jimqiu1003`（个人账号，**P0 未创建任何 Organization**，也未改动账号全局设置；`gh api user/orgs` 返回 `The-Finilo-Project`、`Industrial-Miracles` 两个**与本项目无关**的既有组织）                               |
| License             | Apache-2.0（GitHub 识别）                                                                                                                                                                                        |
| 创建时间 / 认证     | 2026-10-15 08:09:15 UTC；GitHub CLI keyring，scope `gist`, `read:org`, `repo`, `workflow`                                                                                                                        |
| PR #1               | `chore(infra): harden worktree tooling and guard main pushes`，`chore/p0-hardening` @ `38f84e1` → **MERGED**（merge `55637b0`），CI run `38706529383` success 36s                                                |
| PR #2               | `fix(worktree): delete worktrees reliably on Windows long paths`，`fix/worktree-long-path-removal` @ `522f96c` → **MERGED**（merge `5f3ad2e`），CI run `38707513532` success 48s                                 |
| PR #3               | `docs(report): add the P0 bootstrap report and correct overstated docs`（[PR #3](https://github.com/Jimqiu1003/auralide/pull/3)），`docs/p0-report-and-corrections` @ `ad69300` → **OPEN**（本报告随该 PR 交付） |
| 分支保护 / Rulesets | 快照时**不可用**（4 个 API 全 403）；**已于同日随公开启用，见 §14 后记**                                                                                                                                         |
| 漏洞告警 / 高级安全 | 快照时未启用（`/vulnerability-alerts` → 404、`security_and_analysis: null`）；**现已启用 Dependabot 漏洞告警 + secret scanning + push protection，见 §14 后记**                                                  |

> ⚠️ **禁止表述**："分支保护已生效"。当前补偿控制是仓库内的 `.githooks/pre-push`：它是**本地钩子**，**不随 clone 分发**、**可用 `git push --no-verify` 绕过**，**不是安全边界**，也不能约束他人。CI 在每个 PR 上运行，但**不阻断**合并。
>
> 验证方式：① 无网络 hermetic 三例（main → 拒绝 exit 1、功能分支 → 放行 exit 0、`AURALIDE_ALLOW_MAIN_PUSH=1` → 放行）；② 端到端 `git push --dry-run origin HEAD:main` → exit 1。

网络备注：Git 全局配置了 `http.https://github.com.proxy=http://127.0.0.1:7897`（期间该代理时通时不通）；本仓库设置仓库级空值覆盖以直连（`git config --local 'http.https://github.com.proxy' ''`），**全局配置未修改**。首次推送与后续推送期间各出现过一次连接重置/超时，重试后成功。npm registry 可访问，部分拉取很慢（30–50 KiB/s 告警）。

### 5.1 许可证与供应链审计（license-auditor 结论）

**全树分布**：146 个不同包名 / 149 个实例（3 个包各有 2 个版本）。

| License       | 包数 | 示例                                                               |
| ------------- | ---- | ------------------------------------------------------------------ |
| MIT           | 112  | `react`, `react-dom`, `zod`, `electron`, `vite`, `eslint`          |
| Apache-2.0    | 15   | `typescript`, `@eslint/core`, `detect-libc`                        |
| BSD-2-Clause  | 7    | `espree`, `eslint-scope`, `@electron-internal/extract-zip`         |
| ISC           | 7    | `semver`, `glob-parent`, `graceful-fs`                             |
| BSD-3-Clause  | 2    | `esquery`, `source-map-js`                                         |
| MPL-2.0       | 2    | `lightningcss`, `lightningcss-win32-x64-msvc`（dev-only，经 Vite） |
| BlueOak-1.0.0 | 1    | `minimatch`（lint 工具链）                                         |

- **无 GPL / AGPL / LGPL / SSPL / UNLICENSED，无缺失 license 字段**；`pnpm audit` → `No known vulnerabilities found`（手动执行，尚未进 CI）。
- **口径陷阱（务必注意）**：`pnpm licenses list` 按 importer 生效，只在仓库根运行会漏掉 `react`/`react-dom`/`electron`/`zod` 等 **16 个包**（根只有 130 个）。
- **产物闭包**（实际随桌面应用分发）：`react`/`react-dom`/`scheduler`/`zod`（全 MIT）+ `electron`（MIT；其二进制内含 Chromium（BSD-3-Clause）与 Node（MIT）声明，**打包时需随附**）。MPL-2.0 仅在 dev 工具链，**不进入产物**（实测产物 bundle 内 `lightningcss` 命中 0，React runtime 命中存在）。
- **批准决定**（已记录进 `docs/architecture/security.md`）：MPL-2.0（dev-only，file-level copyleft，不传染本项目文件）与 BlueOak-1.0.0（permissive，加入白名单）。
- 供应链配置：`pnpm-workspace.yaml` 显式声明 `minimumReleaseAge: 1440`（与 pnpm 内建默认一致，避免随版本漂移；`minimumReleaseAgeStrict` 保持默认 false）；`.gitignore` 补 `*.crt`/`*.cer`/`*.der`/`*.jks`/`*.p8` 与 `.npmrc`。

## 6. 分支与 Worktree 状态

**观测快照：2026-10-15 16:49 +08:00**。

| 分支                             | 本地 SHA  | 上游                                                | 状态                                                                                                |
| -------------------------------- | --------- | --------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `main`                           | `5f3ad2e` | `origin/main` = `5f3ad2e`                           | 主工作区；**本地与远程一致，工作树干净**                                                            |
| `docs/p0-report-and-corrections` | `5f3ad2e` | 无 upstream                                         | linked worktree 中活动（PR #3，本报告所在）                                                         |
| `chore/p0-hardening`             | `38f84e1` | 已删除（本地分支）                                  | 已随 PR #1 合并；`git merge-base --is-ancestor 38f84e1 main` → exit 0 后以 `git branch -d` 安全删除 |
| `fix/worktree-long-path-removal` | 已删除    | `origin/fix/worktree-long-path-removal` = `522f96c` | 已随 PR #2 合并，本地分支已删除                                                                     |

| worktree 路径                                                                    | HEAD      | 分支                             |
| -------------------------------------------------------------------------------- | --------- | -------------------------------- |
| `D:\01_Projects\01_MyProjects\Auralide Dev`                                      | `5f3ad2e` | `main`（干净）                   |
| `D:\01_Projects\01_MyProjects\Auralide Worktrees\docs-p0-report-and-corrections` | `5f3ad2e` | `docs/p0-report-and-corrections` |

**历史时间序（问题已随 PR 收敛，保留以便追溯）**：16:36 仍注册残缺的 `chore-p0-hardening` worktree 目录（缺 `.git`/`.github`/`docs`/`.githooks`）→ 16:37 该残留目录被删除 → 16:39 出现 `test/qa-independence`、`fix-worktree-long-path-removal` 等工作树 → PR #2 修复长路径删除后，worktree 列表已收敛为上述 2 条，残留目录不再存在。

`.githooks/pre-push` 的可达性：随 PR #1 进入 main；主工作区已快进到 `5f3ad2e`，`.git/config` 的 `core.hooksPath=.githooks` 因此**在本地真实生效**（旧版报告记录的"主工作区不生效"已随 fast-forward 解决）。

## 7. Git Commit SHA

| 提交           | SHA                                        | 内容                                                                                           |
| -------------- | ------------------------------------------ | ---------------------------------------------------------------------------------------------- |
| main 首次提交  | `97530e6f25bb53ba8a90d263dd89afca1bc331b4` | `chore(repo): bootstrap Auralide P0 infrastructure`，77 files，+4900                           |
| P0 硬化提交    | `38f84e1a10fd1ea53caa17ca13c3397700973a94` | `chore(infra): harden worktree tooling and guard main pushes`（PR #1 head；3 files，+76 / −6） |
| PR #1 合并提交 | `55637b0831f9745f3fa983193dd99ddf858e270f` | `Merge pull request #1 from Jimqiu1003/chore/p0-hardening`                                     |
| 长路径修复提交 | `522f96cff4f081d7765c49f56b3ec7488c2ed4c8` | `fix(worktree): delete worktrees reliably on Windows long paths`（PR #2 head）                 |
| **当前 main**  | `5f3ad2e36fda1d1a37e6659e41d870a32ae383e9` | `Merge pull request #2 from Jimqiu1003/fix/worktree-long-path-removal`（PR #2 merge commit）   |

## 8. CI 运行结果

| run id        | 事件           | 分支                             | headSha   | 结论        | 耗时 | URL                                                               |
| ------------- | -------------- | -------------------------------- | --------- | ----------- | ---- | ----------------------------------------------------------------- |
| `38703672735` | `push`         | `main`                           | `97530e6` | **success** | 49s  | <https://github.com/Jimqiu1003/auralide/actions/runs/38703672735> |
| `38706529383` | `pull_request` | `chore/p0-hardening`             | `38f84e1` | **success** | 36s  | <https://github.com/Jimqiu1003/auralide/actions/runs/38706529383> |
| `38706839916` | `push`         | `main`                           | `55637b0` | **success** | 45s  | <https://github.com/Jimqiu1003/auralide/actions/runs/38706839916> |
| `38707513532` | `pull_request` | `fix/worktree-long-path-removal` | `522f96c` | **success** | 48s  | <https://github.com/Jimqiu1003/auralide/actions/runs/38707513532> |
| `38707655187` | `push`         | `main`                           | `5f3ad2e` | **success** | 53s  | <https://github.com/Jimqiu1003/auralide/actions/runs/38707655187> |

**step 数修正**：job `verify`（`ubuntu-latest`，`timeout-minutes: 20`）每次运行共 **14 个 step** = 1 个平台 `Set up job` + **9 个业务 step** + 4 个 post/complete；5 个 run 实测均为 14 且全部 success。旧版报告的"10 个步骤"说法已作废。

| #   | 业务 step                                                | 结论    |
| --- | -------------------------------------------------------- | ------- |
| 1   | Checkout                                                 | success |
| 2   | Set up pnpm                                              | success |
| 3   | Set up Node.js（node-version 24，cache pnpm）            | success |
| 4   | Install dependencies（`pnpm install --frozen-lockfile`） | success |
| 5   | Check formatting（`pnpm format:check`）                  | success |
| 6   | Lint（`pnpm lint`）                                      | success |
| 7   | Typecheck（`pnpm typecheck`）                            | success |
| 8   | Test（`pnpm test`）                                      | success |
| 9   | Build（`pnpm build`）                                    | success |

另有 1 个平台 step（`Set up job`）与 4 个 post/complete step（Post Set up Node.js / Post set up pnpm / Post Checkout / Complete job），同样 success。

## 9. 实际执行的测试与检查

| #   | 命令                                                                                                                  | 观测结果                                                                                                                       | 来源                                                                                                |
| --- | --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------- |
| 1   | `pnpm verify`                                                                                                         | 退出码 0（format:check → lint → typecheck → test → build 全链通过）                                                            | Lead 实测                                                                                           |
| 2   | `turbo run typecheck`                                                                                                 | 10/10 任务成功                                                                                                                 | Lead 实测                                                                                           |
| 3   | `turbo run build`                                                                                                     | 9/9 任务成功，含 Vite renderer 打包（18 modules，219.93 kB）                                                                   | Lead 实测；本报告作者核对产物 `index--0bZ5Ep1.js` = 219,930 B                                       |
| 4   | `turbo run test`                                                                                                      | 10 个用例通过：`@auralide/core` 5、`@auralide/cli` 5                                                                           | Lead 实测执行；用例数本报告作者读源文件核对                                                         |
| 5   | `node apps/cli/dist/index.js --version`                                                                               | 输出 `0.0.0`，exit 0                                                                                                           | 本报告作者复跑                                                                                      |
| 6   | `node apps/cli/dist/index.js --version --json`                                                                        | 输出 `{"name":"auralide","version":"0.0.0"}`，exit 0                                                                           | 本报告作者复跑                                                                                      |
| 7   | `node apps/cli/dist/index.js --help`                                                                                  | 输出 Usage/Options 帮助文本，exit 0                                                                                            | 本报告作者复跑                                                                                      |
| 8   | `node apps/cli/dist/index.js --bogus`                                                                                 | stderr `Unknown option: --bogus` + 帮助文本，**exit 2**                                                                        | 本报告作者复跑                                                                                      |
| 9   | `pnpm verify` 的缓存口径核查                                                                                          | 首次运行显示 `FULL TURBO`、日志时间戳早于本次 → 本地"通过"可能全是 Turbo 缓存重放                                              | qa-verifier 提出；冷缓存证据取 CI（全新 clone，无 Turbo 远端缓存）与 `turbo run … --force` 本机复跑 |
| 10  | 注入 TS7006 / TS2322 后 `pnpm typecheck`                                                                              | exit 1（TS strict 真实生效，不是空跑）                                                                                         | qa-verifier                                                                                         |
| 11  | `pnpm licenses list --json`（**逐 importer** 运行）                                                                   | 146 包名 / 149 实例；分布见 §5.1；root-only 运行会少 16 个包                                                                   | license-auditor                                                                                     |
| 12  | `pnpm audit`                                                                                                          | `No known vulnerabilities found`（手动执行，未进 CI）                                                                          | license-auditor                                                                                     |
| 13  | 密钥模式扫描（11 类 × 78 跟踪文件 × 全历史 3 个提交）                                                                 | 0 命中                                                                                                                         | license-auditor                                                                                     |
| 14  | 264 字符路径 worktree 全生命周期                                                                                      | create → install → check → remove → **目录与分支均消失**（在最终 main 上）                                                     | Lead / PR #2 验证                                                                                   |
| 15  | `git push --dry-run origin HEAD:main`                                                                                 | **exit 1**（pre-push 拒绝）                                                                                                    | Lead 实测                                                                                           |
| 16  | 合成 refs 输入调用 `.githooks/pre-push`（main / 特性分支 / `AURALIDE_ALLOW_MAIN_PUSH=1`）                             | exit 1 / exit 0 / exit 0，覆盖提示语正确                                                                                       | 本报告作者 hermetic 复跑                                                                            |
| 17  | `git log` / `git status` / `git worktree list` / `git branch -a -vv`                                                  | main = `5f3ad2e` = `origin/main`，工作树干净，worktree 共 2 条                                                                 | 本报告作者复跑                                                                                      |
| 18  | `gh run view`（5 个 run）                                                                                             | 全部 `completed/success`；逐 run 计算耗时 49/36/45/48/53s；step 数均为 14                                                      | 本报告作者复跑                                                                                      |
| 19  | `gh repo view`、`gh api …/branches/main`、`…/rulesets`、`…/vulnerability-alerts`、`user/orgs`                         | private、`protected: false`、403、404（告警未启用）、2 个无关组织                                                              | 本报告作者复跑                                                                                      |
| 20  | `node -v`、`pnpm -v`、`npm -v`、`git --version`、`gh --version`、`corepack -v`、`python --version`、`$PSVersionTable` | 与 §4 版本表一致                                                                                                               | 本报告作者复跑                                                                                      |
| 21  | `git diff` / `git grep` 核对本 PR 的文档修正                                                                          | `.gitignore`、`CONTRIBUTING.md`、`docs/architecture/security.md`、`pnpm-workspace.yaml` 四处修改；`docs/reports` 引用实测 4 处 | 本报告作者复跑                                                                                      |

方法学提醒（qa-verifier，必须保留）：`pnpm verify` 在本地**可能全是 Turbo 缓存重放**，因此"lint/typecheck/test/build 通过"的**冷缓存证据是 CI**（每次全新 clone，无 Turbo 远端缓存），另有本机 `turbo run … --force` 复跑作为补充。

本报告作者未复跑 `pnpm verify` / `turbo`（复跑会写入 `.turbo/`、`dist/`，超出"只写报告文件"的写入范围），第 1–4 项以 Lead 实测与 CI 冷缓存为证。另：hermetic 钩子测试直接调用 `sh.exe`，PATH 中没有 Git 的 `usr/bin`，钩子里的 `cat` 报 `command not found`，故拒绝提示的后半段文本未打印，**退出码仍为 1**；真实 `git push` 由 Git 提供 exec 路径，`cat` 可用。

## 10. 失败项目 / 未完成项目

### 10.1 未完成 / 未验证清单

| 项                | 如实描述                                                                                                                                            |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| 桌面应用启动      | Electron 二进制未下载（`electron@44.7.2` 无 `dist/`、无 `path.txt`）；未运行 `pnpm --filter @auralide/desktop start`；**窗口能否打开未验证**        |
| Vite dev server   | `pnpm dev` 未运行验证；已知严格 CSP 与 Vite 内联 React Refresh preamble 冲突，dev 需放宽 `script-src`（或改由 main 进程下发响应头 CSP）             |
| E2E               | Playwright 未引入（仅审计），**未做任何 E2E**                                                                                                       |
| preload / IPC 桥  | 未实现（P1 实现，需做权限白名单评审）                                                                                                               |
| 供应链自动告警    | Dependabot 漏洞告警未启用（API 404）、无 secret scanning、无 GHAS                                                                                   |
| layer 包业务逻辑  | `renderer`/`canvas`/`editor-ui`/`html-bridge`/`agent`/`exporters` 只声明 layer 身份，**无任何业务逻辑**——这是 P0 **有意为之的边界占位**，不构成功效 |
| GitHub 侧分支保护 | Free 计划 + private 仓库限制，未启用任何保护                                                                                                        |
| 许可证 / 漏洞门禁 | `pnpm audit` 与许可证扫描**尚未进 CI**（本次为手动执行）                                                                                            |
| PR #3             | 本报告与文档修正尚未合并（PR #3 已创建，等待 CI 通过后合并）                                                                                        |
| 打包 / 签名       | Electron 打包与签名未开始（含 Chromium/Node 声明随附）                                                                                              |

### 10.2 问题记录与已修复缺陷

| #   | 现象                                                                                                                                                                                                                           | 根因                                                                                                                                                                                        | 修复                                                                                                                                                                                                                   | 验证                                                                                                                |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| 1   | 消费包 `tsc` 报 **TS6059（rootDir）**，且 core 的编译产物被误写到 `packages/core/src/` 旁边                                                                                                                                    | TS `paths` 指向 `packages/*/src` 与 `rootDir` 冲突（跨包源码直引）                                                                                                                          | 去掉 `paths`，改为经 `dist/*.d.ts` 解析；`typecheck`/`test`/`build` 均 `dependsOn: ["^build"]`                                                                                                                         | 清理生成物后本地与 CI 复测通过                                                                                      |
| 2   | typecheck 失败                                                                                                                                                                                                                 | `apps/desktop/vite.config.ts` 不在 `rootDir: src` 下                                                                                                                                        | 把 `rootDir` 移入 `tsconfig.build.json`                                                                                                                                                                                | typecheck 通过（10/10）                                                                                             |
| 3   | worktree 脚本 `status` 打印 `m @ 9`；`remove` 恒报 "48 个未合并提交"                                                                                                                                                           | 单行输出被 PowerShell 展开为字符串，`'0'[0]` → ASCII 48（标量索引 bug）                                                                                                                     | PR #1：`Get-CommitDistance` + `[int]::TryParse` 统一解析提交距离                                                                                                                                                       | **qa-verifier 独立复现并判定该项 FAIL**；修复后在合并后的 main 上复测 `check`/`remove` 通过                         |
| 4   | Windows 长路径下 worktree 删除不可靠：263–266 字符路径时 `git worktree remove` **exit 0 却残留 643 个文件**；`gh pr merge --delete-branch` 报 `Filename too long` 并跳过本地分支删除；shell CWD 在被删目录内时 `rmdir` exit 32 | Windows `MAX_PATH=260` 限制 + git 未启用长路径 + 删除后未校验文件系统 + CWD 占用                                                                                                            | PR #2：每次 git 调用带 `-c core.longpaths=true`；`remove` 后**校验文件系统**，必要时 `\\?\` 直删 + `git worktree prune`；检测并退出被删目录；错误信息点名"有进程占用"                                                  | 在最终 main 上以 **264 字符路径实测**：创建 → install → check → remove → 目录与分支均消失                           |
| 5   | `onlyBuiltDependencies` 设置不生效                                                                                                                                                                                             | pnpm ≥ 11 已改名 **`allowBuilds`**（官方文档 + 实测）                                                                                                                                       | 改为不列任何 `allowBuilds` 条目（`strictDepBuilds` 默认 true，遇到未审查脚本直接失败）                                                                                                                                 | 安装与 CI 均通过；license-auditor 复核无实项、`pendingBuilds: []`                                                   |
| 6   | 依赖审计结论反复                                                                                                                                                                                                               | `electron@44` **已取消 postinstall**（registry `hasInstallScript` 空、`package.json` 无 `scripts`），改为首次运行时 `index.js` 按需下载二进制                                               | 无需 build 审批；记录该行为                                                                                                                                                                                            | 本报告作者复核：`electron@44.7.2` 的 `package.json` 确无 `scripts` 字段；**桌面应用未启动验证**                     |
| 7   | 文档过度声明与死链（gap-auditor 审计发现）                                                                                                                                                                                     | `CONTRIBUTING.md` 写 "main is protected"（实际 GitHub 侧无保护）；`security.md` 写 "all permissively licensed"（实际含 MPL-2.0 ×2、BlueOak ×1）；`docs/reports/` 未入库导致报告引用无法解析 | 本 PR：`CONTRIBUTING.md` 改为 "integration-only + 本地钩子 + CI 不阻断合并" 的准确表述并补 Labels 清单与 `gh label create` 命令；`security.md` 改为审计后的真实分布并记录 MPL-2.0/BlueOak 批准决定；提交本报告消除死链 | 差异逐条核对（`.gitignore`/`CONTRIBUTING.md`/`security.md`/`pnpm-workspace.yaml` 四处修改）；引用随本 PR 入库可解析 |
| 8   | 收尾阶段操作失误：报告草稿被误删且无备份                                                                                                                                                                                       | 把报告从主工作区移入 docs 工作树时，复制因目标目录不存在而失败，**随后的删除仍执行**                                                                                                        | 由 `report-drafter` 依据其上下文**原样重建**（322 行 / 54,151 字节，与删除前一致）                                                                                                                                     | 重建后 prettier `--check` 通过；因无备份**无法做字节级比对**，此为已知限制                                          |
| 9   | 本地"全绿"可能是缓存幻觉                                                                                                                                                                                                       | `pnpm verify` 可能全是 Turbo 缓存重放（首次显示 `FULL TURBO`、日志时间戳早于本次）                                                                                                          | 明确冷缓存证据来源：CI（全新 clone、无 Turbo 远端缓存）+ 本机 `turbo run … --force`                                                                                                                                    | qa-verifier 提出；结论写入 §9 与本表                                                                                |

## 11. 遗留风险

| 风险                                         | 等级 | 说明                                                                                                                                               | 缓解                                                                               |
| -------------------------------------------- | ---- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| 无 GitHub 侧分支保护                         | 高   | Free 计划 + private 仓库不支持 rulesets/branch protection（4 个 API 全 403，`protected: false`）；本地钩子可被 `--no-verify` 绕过、不随 clone 分发 | `.githooks/pre-push` + PR 流程 + CI 兜底；升级计划或改可见性需所有者决定           |
| 本地"通过"可能是缓存重放                     | 中   | `pnpm verify` 可能全为 Turbo 缓存命中；仅看本地输出不足以证明冷跑通过                                                                              | 以 CI 与 `--force` 复跑为准（§9 方法学提醒）；P1 可在 CI 显式 `--force` 或关闭缓存 |
| 桌面应用零运行验证                           | 高   | Electron 未下载、未启动；主进程与 renderer 接线只经过 typecheck/build                                                                              | P1 首先做一次真实启动冒烟                                                          |
| dev 模式 CSP 冲突                            | 中   | 严格 CSP 与 Vite 内联 preamble 冲突，dev server 不可用                                                                                             | P1 放宽 dev `script-src` 或改由 main 进程下发响应头 CSP                            |
| 无 E2E                                       | 中   | 无浏览器级回归防线，UI 回归只能靠构建                                                                                                              | P1 引入 Playwright 冒烟                                                            |
| 无 preload/IPC 白名单                        | 高   | 渲染进程需要主进程能力时缺少受控通道与权限评审基线                                                                                                 | P1 实现 preload + IPC 白名单并评审                                                 |
| 供应链无自动告警与门禁                       | 中   | Dependabot 未启用、无 secret scanning；`pnpm audit` 与许可证扫描未进 CI                                                                            | P1 纳入 CI（含 per-importer 许可证扫描）                                           |
| Windows 长路径                               | 中   | PR #2 已修 worktree 删除路径，但其他工具链（安装、打包）仍可能触碰 MAX_PATH                                                                        | 保持 `core.longpaths`，打包阶段单独验证                                            |
| TypeScript 6.0.3 滞后                        | 低   | 受 `typescript-eslint` peer 上限约束，无法升 TS 7.x                                                                                                | 跟踪上游支持后再评估                                                               |
| 6 个 layer 包为空                            | 低   | 有意占位，但容易被误读为"已实现"                                                                                                                   | 各包注释写明 "P0 intentionally ships no product logic"；§1.3/§10.1 明确标注        |
| worktree 脚本 `sync` 未实测、ERROR 走 stdout | 低   | `sync` 无实测记录；顶层错误用 `Write-Output` 输出到 stdout 而非 stderr                                                                             | P1 为 `sync` 与错误流各补一次实测/调整                                             |

## 12. P1 建议

1. **core 文档 schema 与命令分发器**：在 `packages/core` 落地 Zod schema、命令接口与首个真实测试（替换当前 `Result`/`layer` 的最小占位之外的能力）。
2. **preload / IPC 白名单 + 响应头 CSP**：定义受控通道与权限白名单并评审；把 CSP 改为 main 进程下发响应头，同时解决 dev 模式冲突。
3. **Playwright E2E 冒烟**：至少覆盖"应用能启动 + 一个文档能打开/保存"的端到端路径（`pnpm dev` 的 CSP 问题须先解决）。
4. **CI 补门禁**：`pnpm audit`、per-importer 许可证扫描（含 MPL/BlueOak 白名单校验）、Dependabot 与 secret scanning；可选 `turbo run --force` 冷跑。
5. **分支保护**：计划升级到支持私有仓库 rulesets 的 GitHub 计划；若保持现状，须在文档中固化"本地钩子≠安全边界、CI 不阻断合并"的结论（本 PR 已在 `CONTRIBUTING.md` 记录）。
6. **TypeScript 升级评估**：等 `typescript-eslint` 支持 TS 7.x 后再升级，避免 peer 冲突。
7. **Electron 打包 / 签名策略**：明确打包目标、签名与更新通道，并在打包产物中随附 Chromium（BSD-3-Clause）与 Node（MIT）声明。
8. **收尾**：合并 PR #3；保留脚本的"未合并拒绝"保护，定期用 `worktree.ps1 sync` 清理 stale worktree 记录。

## 13. 事实核对差异（已随 PR 收敛）

旧版报告写于 16:39 快照；以下差异均已由 PR #1 / #2 / #3 收敛，保留对照以便追溯。

| #   | 旧版（16:39 快照）的说法                                            | 最终事实                                                                                                                                                               | 收敛方式                                                                          |
| --- | ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| 1   | main 停在 `97530e6`/`55637b0`，主工作区 `behind 2`                  | main = `5f3ad2e`，本地与 `origin/main` 一致，工作树干净                                                                                                                | PR #2 合并（`5f3ad2e`）后 fast-forward                                            |
| 2   | worktree 列表仍有残留、`chore-p0-hardening` 目录残缺                | 仅 2 个 worktree（主仓库 + `docs-p0-report-and-corrections`），残留目录已不存在                                                                                        | PR #2 修好长路径删除后清理完成                                                    |
| 3   | "PR #1 的 CI 结果待定"                                              | run `38706529383`，success 36s                                                                                                                                         | 已有结论（§8）                                                                    |
| 4   | CI 共 3 次 run                                                      | 共 **5 次** run 全 success：49 / 36 / 45 / 48 / 53s                                                                                                                    | PR #2 追加 `38707513532`、`38707655187`（§8）                                     |
| 5   | job `verify` "10 个步骤"                                            | 每次 **14 个 step** = 1 平台 + 9 业务 + 4 post/complete                                                                                                                | §8 已修正（旧说法作废）                                                           |
| 6   | `.githooks` 在主工作区不生效                                        | 主工作区已快进到 `5f3ad2e`，钩子在本地真实生效                                                                                                                         | fast-forward 解决（§6）                                                           |
| 7   | worktree 脚本"实测由 Lead 声明"，`sync` 未实测                      | `remove` 曾被 qa-verifier 独立复现 **FAIL**（标量索引 bug + 长路径残留 643 文件），PR #1/#2 修复后在最终 main 复测通过                                                 | §10.2-3/4；`sync` 仍未实测（§1.2）                                                |
| 8   | "typecheck 10/10、build 9/9、`pnpm verify` 退出码 0" 仅单方本地实测 | 本地可能是 Turbo 缓存重放；冷缓存证据为 CI + `--force` 复跑                                                                                                            | qa-verifier 指出，§9 方法学提醒                                                   |
| 9   | 未涉及许可证与密钥                                                  | 146/149 许可证分布、无 GPL/AGPL、`pnpm audit` 0 漏洞、密钥扫描 0 命中；root-only 口径会漏 16 个包                                                                      | license-auditor 结论，§5.1 与 `security.md` 记录                                  |
| 10  | 事实清单称 "5 处 `docs/reports` 引用死链"                           | 实测 **4 处**匹配：`README.md:67`、`docs/agents/COLLABORATION.md:87`、`docs/architecture/security.md:87`、`AGENTS.md:59`（目录说明而非链接）                           | 本 PR 提交报告后全部可解析；计数差异如实记录                                      |
| 11  | 事实清单称 PR #2 的 CI 为 44s；PR #3 "尚未合并"                     | 逐 run 实测：`38707513532` = **48s**、`38707655187` = 53s；`gh pr list --state all` 仅返回 #1/#2，**随后已创建 PR #3**（`docs/p0-report-and-corrections` @ `ad69300`） | §8 按实测耗时写；§5 明确标注 PR #3 尚未创建（需推送分支并建 PR 后才成立）         |
| 12  | 事实清单把 preload/IPC 归入"已配置但未验证"                         | 该项**未实现**，仅有架构约束文本                                                                                                                                       | 按事实清单归位到 §1.2，但在表格中明确标注"桥未实现、无可验证行为"（§10.1 亦列出） |

除上述条目外，提交统计、版本号、仓库可见性、403 结论、测试用例数与 CLI 行为均已实测复核，与事实清单一致。

## 14. 后记：仓库转为公开并启用平台保护（2026-10-15，快照之后）

快照（16:49）之后，项目所有者指示将仓库由 Private 改为 **Public**。变更为 2026-10-15 17:17 +08:00 执行并验证。**§1–§13 中"私有仓库 / 保护不可用 / 无 secret scanning / Dependabot 未启用"等表述仅在快照时点成立**，现状如下。

| 项                  | 变更前（快照）              | 变更后（现状）                                                                                                                                                                                                                                             | 证据                                                                                       |
| ------------------- | --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| 可见性              | Private                     | **Public**                                                                                                                                                                                                                                                 | `gh repo view` → `visibility=PUBLIC isPrivate=false`；`gh api repos/...` → `private=false` |
| `main` 分支保护     | 4 个 API 全 403，仅本地钩子 | **规则集 `main-protection` 生效**（id 25150123，`target=branch`，`~DEFAULT_BRANCH`，`bypass_actors=[]`，`current_user_can_bypass=never`）：`deletion` + `non_fast_forward` + `pull_request`（0 个必需批准） + `required_status_checks`（`verify`，strict） | `gh api repos/.../rulesets`；端到端实测见下                                                |
| secret scanning     | 无（私有仓库无 GHAS）       | **enabled** + **push protection enabled**                                                                                                                                                                                                                  | `gh api repos/... --jq .security_and_analysis`                                             |
| Dependabot 漏洞告警 | 404 未启用                  | **已启用**                                                                                                                                                                                                                                                 | `PUT /vulnerability-alerts` → 204；随后 `GET` 成功                                         |
| 自动依赖升级 PR     | —                           | 仍关闭（`dependabot_security_updates=disabled`），需所有者决定                                                                                                                                                                                             | 同上 API 输出                                                                              |

**服务端强制端到端验证**（用 `--no-verify` 绕过本地钩子，确认拒绝来自 GitHub 而非本地脚本）：

```text
$ git push --no-verify origin scratch/protection-probe:main
remote: error: GH013: Repository rule violations found for refs/heads/main.
remote: - Changes must be made through a pull request.
remote: - Required status check "verify" is expected.
[remote rejected]
origin/main 推送前后均为 e40309a（未变动）
```

**公开前检查**（避免不可逆的敏感信息暴露）：79 个跟踪文件 + 全部提交历史，11 类密钥模式扫描 → **0 命中**；唯一的 `.env` 类文件是 `.env.example`（空占位，`ANTHROPIC_API_KEY=` 被注释且为空）；无证书/私钥/大二进制文件。**已知暴露**：提交作者邮箱 `jimqiu1003@gmail.com`（提交元数据与 `NOTICE`）与 15 处本机绝对路径 `D:\01_Projects\...`（仅目录布局，非机密）；若需脱敏需改写历史，由所有者决定。

**结论**：§11 中"无 GitHub 侧分支保护"这一**高风险项已消除**；§12 第 5 条（分支保护）与第 4 条中的"secret scanning/Dependabot"部分已落地。`.githooks/pre-push` 保留为本地预检——可被 `--no-verify` 绕过，但服务端规则不再受影响。
---

**相关文件**：[CI 工作流](.github/workflows/ci.yml)｜[worktree 脚本](scripts/dev/worktree.ps1)｜[ADR-0001](docs/decisions/ADR-0001-foundation.md)｜[协作规程](docs/agents/COLLABORATION.md)｜[安全与许可证策略](docs/architecture/security.md)｜[贡献指南](CONTRIBUTING.md)｜[PR #1](https://github.com/Jimqiu1003/auralide/pull/1)｜[PR #2](https://github.com/Jimqiu1003/auralide/pull/2)
