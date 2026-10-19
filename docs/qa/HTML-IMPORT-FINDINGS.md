# HTML 导入兼容性发现记录

Owner: Compatibility & QA Engineer (`@Lsc-91-69`). 记录范围：`feat/stable-portable`（M2 桌面预览候选）
上的 HTML 导入路径。本文只记录**实测**结论；每条都写了复现方式，未实测的项目明确标注为未验证。

相关：[`../../packages/html-bridge/src/import.ts`](../../packages/html-bridge/src/import.ts)（注入脚本）、
[`../../apps/desktop/src/main/html-import.ts`](../../apps/desktop/src/main/html-import.ts)（主进程隔离窗口）、
[`../../apps/desktop/test/file-io.electron.mjs`](../../apps/desktop/test/file-io.electron.mjs)（CI 守门测试）。

## 1. 复现环境与方法

| 项       | 值                                                                                            |
| -------- | --------------------------------------------------------------------------------------------- |
| 日期     | 2026-10-19（Asia/Shanghai）                                                                   |
| 系统     | Windows 11 (10.0.26200)，x64                                                                  |
| Electron | 44.7.2（仓库锁定版本）                                                                        |
| Node     | 24.14.0                                                                                       |
| 样本     | 7 页、32,505 字节的 AI 生成 HTML 演示文稿（真实用户样本）                                     |
| 窗口配置 | `show:false`、`1280×720`、`useContentSize:true`、`backgroundThrottling:false`（与主进程一致） |

方法：把 `HTML_IMPORT_SCRIPT` **原文**抽出，在一个与
`apps/desktop/src/main/html-import.ts` 逐项对齐的 Electron 主进程脚本里执行（同样的隔离
session、同样的 CSP 与禁动画注入、同样的 `data:` URL 与请求拦截），并在脚本副本里插入计时探针
（产品源码不改）。本机 Electron 只能以 `--no-sandbox` 启动（进程沙箱不允许 Chromium 的命名管道），
该参数不影响渲染、布局、`requestAnimationFrame` 与脚本本身。

## 2. 发现 1 —— 多页 HTML 导入超时（已修复）

**症状**（用户报告）：导入 HTML 演示文稿后编辑器什么都没有。

**实测**：导入**并非失败，而是耗时 10.2 秒**，逼近 `html-import.ts` 的 12 秒上限；一旦超过，
`Import timed out` 被 catch 成 `invalid-document`（"HTML 无法安全转换、超出限制或不包含可编辑内容"），
用户侧表现就是"什么都没导入"。

修复前的逐阶段实测（7 页样本）：

| 阶段                  | 耗时          |
| --------------------- | ------------- |
| 第 1 页（rAF 等待）   | 25 ms         |
| 第 2 页（rAF 等待）   | 31 ms         |
| 第 3–7 页（rAF 等待） | 每页约 2 s    |
| 每页元素抽取          | 每页 1 ms     |
| **合计**              | **10,173 ms** |

**根因**：注入脚本每页都 `await` 两帧 `requestAnimationFrame`，用来"等布局稳定"。但检查窗口是
隐藏窗口（`show:false`），隐藏窗口的 `requestAnimationFrame` 被节流到约 1 Hz，于是从第 3 页起
每页白等约 2 秒。页数越多越慢，7 页已经吃掉 85% 的超时预算；机器稍慢、或页数再多一页就必然超时。
**这不是样本特例**：任何"页数 × 2 帧"超过剩余预算的演示文稿都会复现。

**修复**：用同步强制重排（读取布局属性）替代"等两帧"。读取布局属性本身就会把样式与布局同步算到最新，
这正是那次等待唯一达成的效果；帧等待仍保留为"机会性让出"，但由定时器封顶（50 ms），永不阻塞。

**修复后实测**：同一命令、同一样本，导入 **390 ms**（26×），产出**完全相同**：
`slides=7 elements=134 slideSize={"width":1266,"height":716}`，警告集合不变。

**回归防线**：`apps/desktop/test/file-io.electron.mjs` 增加 8 页样本导入用例（旧代码下约 12 s 会超时），
断言导入成功、页数完整、耗时远低于超时线。CI 已运行该文件，无需改 `package.json` 或 CI 配置。

## 3. 发现 2 —— 画布尺寸漂移（未修复，待 Lead 决策）

导入画布尺寸为 **1266×716**，而检查窗口是 1280×720。原因是注入脚本把每页强制为
`position:relative`，原本 `position:fixed; inset:0` 的整屏页因此失去视口尺寸，改由内容撑开，
并受滚动条影响（宽度少约 14 px）。当各页高度不一致时还会触发
`各页尺寸不一致，已按第一页画布尺寸换算` 的换算分支，导致各页被按不同比例缩放。

影响：导入结果自洽可读（预览渲染正常），但**不是 1280×720 的原始版面**，与源 HTML 存在系统性比例偏差。
建议方向（需 Lead 决定，我不擅自扩大改动）：测量期间隐藏其它页，使被测页独占视口，从而保留原始
`inset:0` 尺寸。

## 4. 发现 3 —— `opacity:0` 的入场动画元素被丢弃（潜在风险，**本样本未造成可见损失**）

> **更正记录**：本节初版写成"封面标题整段丢失"，**该结论是错的**，已按实测更正。保留更正痕迹是因为
> 把"潜在风险"写成"已确认缺陷"正是本仓库禁止的过度声明。

机制：源 CSS 为 `.cover-title .lt{opacity:0}`，逐字母的 `<span>` 靠 `letterUp` 关键帧动画显示。
导入注入的 `animation:none!important` 使其永久停在 `opacity:0`，而抽取循环对 `Number(css.opacity) === 0`
的元素直接 `continue`，这些 `<span>` 因此不会被抽到。

**实测结果：本样本没有可见损失。** 第 1 页抽到 7 个元素，逐个核对为：

```
text  "TPCASTT · POETRY ANALYSIS"  (432,53,287,17)
text  "First Love"                 (286,88,578,117)   ← 标题在，且是完整一行
text  "A Deep Analysis of …"       (320,215,510,31)
shape 背景色块                      (480,272,190,1)
text  "“Her face it bloomed …"     (439,297,272,61)
text  "By John Clare (1793–1864)…" (430,384,290,18)
text  "Presenter: Danny"           (518,408,114,19)
```

逐页渲染截图也确认封面文字完整（kicker、大标题、副标题、引文、署名齐备）。原因是承载文字的节点本身
有直接文本子节点，被按"整块文本"抽出，逐字母 span 的丢失只损失了动画细节，不损失内容。

**真正会丢文字的条件**（尚未在任何样本上复现，属推断，需构造样本验证）：当标题**只**由 `opacity:0` 的
内联 `<span>` 构成、父节点没有直接文本时，父节点因无直接文本被跳过、子 span 因 `opacity:0` 被跳过 →
文字彻底消失。这是一个**潜在**缺陷，不是已确认缺陷。

建议方向（需 Lead 决策）：抽取前把"已禁用动画但 `opacity:0`"的元素视为可见（或在注入的禁动画样式里
补 `opacity` 归一化），而不是丢弃元素；并可补一个"标题由纯 span 构成"的样本把该风险钉死。

## 5. 发现 4 —— 12 秒超时余量过小（观察）

修复前 7 页样本已用掉 10.2 s / 12 s。超时是必要的安全边界（不可信输入），但当前实现的**耗时随页数线性增长**，
使"边界"事实上变成"页数上限"。修复后耗时与页数基本无关，余量恢复到数量级级别；仍建议后续在此基础上
复核超大文档（接近 100 页上限）的行为。

## 6. 验证状态与未验证项

- 已修复项在**两个首发平台**验证通过：**Windows x64**（本机 Electron 44.7.2 实测）与 **macOS ARM64**（CI）。
  CI run `39186933505` 两个平台的 “HTML import, export, Save As, cancellation and restart” 步骤均 `pass`，
  日志为 `file-io: 44 PASS`，8 页样本导入耗时 **Windows 488 ms / macOS 406 ms**。
- 本机 Electron 需 `--no-sandbox` 才能启动（进程沙箱不允许 Chromium 的命名管道），因此"默认沙箱下的表现"在**本机**
  未验证；该参数不影响本次结论（渲染、布局与 `requestAnimationFrame` 与沙箱无关）。CI runner 未使用该参数且同样
  通过，故默认沙箱下的行为已由 CI 覆盖。
- 发现 2、3、4 只做了定位与最小复现，**未修改**，等待 Lead 决策。
