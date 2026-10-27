# dsh-win-approval-notify

DeepSeek Harness（DSH）桌面版插件：在**需要你授权**、**等你回答/审阅**、**一轮任务结束**时发送 **Windows 原生 Toast 通知**，通知里带完整原因；所有开关在 DSH 的 **插件** 页里图形化配置，保存即生效，无需重启。

- 通知通道：Windows PowerShell 5.1 的 WinRT Toast，来源显示 **DeepSeek Harness**（AUMID `com.deepseek.dsh`），进 Windows 通知中心。
- 通知里的「会话」显示**会话标题**（没有标题时用工作区目录名），不显示 session id。
- 只读监听会话事件，不注册 `approval/request` / `user-questions/request` waterfall，不参与审批和作答。
- 任何一个场景都能单独关闭；审批类还能按工具名白名单过滤。

## 环境要求

- Windows 10/11，且存在 `C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe`（WinRT Toast 投影只在 PowerShell 5.1 里可用）。
- **DSH 桌面版**，profile `desktop`，运行时 `0.2.x`（在 `0.2.1-rc.3` 上开发）。
- Windows **设置 → 系统 → 通知** 里允许 “DeepSeek Harness”，并关闭专注助手/勿扰（Win11 的“全屏时自动开启请勿打扰”也建议取消）。

## 安装

从 npm 安装（推荐），在普通 PowerShell（不是 DSH 内部的沙箱终端）里执行：

```powershell
& "<DSH 安装目录>\resources\runtime\cli\bin\dsh.cmd" plugin --profile desktop add dsh-win-approval-notify
```

本地开发时用 link 指向 clone 下来的目录：

```powershell
& "<DSH 安装目录>\resources\runtime\cli\bin\dsh.cmd" plugin --profile desktop add "link:E:/codeDir/ds_tools/dsh-approval-notify"
```

然后**完全退出并重启 DeepSeek Harness**（会话记录不丢）。`dsh plugin add` 会把依赖装进 profile，并把这个包加入 `dsh.profile.bundles`。

本地 link 安装时，依赖（`@deepseek-ai/schemastery`、`@deepseek-ai/cosmokit`）需要在本目录先 `pnpm install`；从 npm 安装时会自动带上。

验证是否加载：侧栏 **插件 → 已安装 → dsh-win-approval-notify → 行 approval-notify**，行详情里应出现 **配置** 按钮。

## 配置

**插件 → dsh-win-approval-notify → 行 approval-notify → 配置**。页面分四组：

| 分组 | 内容 |
| --- | --- |
| 通知哪些情况 | 审批（+ 工具白名单）、提问、计划审阅、任务完成/出错/被拦截/被中断/达到上限（8 个独立开关） |
| 触发与节奏 | 同会话冷却、延迟合并、并发通知上限 |
| 通知外观 | 停留时长、静音、标题前缀、AUMID、是否带完整原因/题目文本 |
| 诊断 | 按场景发送测试通知、最近结果、日志路径、调试日志 |

页面只在你点 **保存** 时写入；写入落到当前 profile 的 Cordis patch，并通过 volatile 配置引用立即生效（无需重启）。**恢复默认** 只重置草稿，仍需点保存。

配置默认值同时写在 `cordis.patch.yml` 里，即使没有打开过设置页也能工作。

## 自测

1. 打开设置页 → 诊断 → 选择场景 → **发送测试通知**：应弹出对应样式的通知，页面显示成功/失败原因。
2. 真实场景：让 agent 执行一次需要升级权限的操作（例如写工作区外的文件）→ 审批面板出现约 0.5 秒后收到通知。
3. 也可以不用 DSH，直接验证通道（普通 PowerShell）：

```powershell
$ps = "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe"
$task = Join-Path $env:TEMP "dsh-toast-test.json"
'{"title":"测试","body":"通道正常","appId":"com.deepseek.dsh","duration":"long","silent":false}' | Set-Content $task -Encoding UTF8
& $ps -NoProfile -ExecutionPolicy Bypass `
  -File "$env:USERPROFILE\.dsh\profiles\desktop\node_modules\dsh-win-approval-notify\lib\toast.ps1" `
  -TaskFile $task
```

> 注意：在 DSH 的沙箱终端里跑 PowerShell 时进程是 Low integrity，WinRT Toast 会被系统拒绝（`0x80073D54`）。**通道自测请在普通 PowerShell 窗口里做**。

## 排查

- **完全没通知**：确认设置页总开关和对应场景开关都开着；Windows 通知总开关、专注助手；应用是否已重启（安装后第一次必须重启）。
- **通知中心里有、但没有横幅弹出来**：Windows 设置 → 系统 → 通知 → 找到「DeepSeek Harness」→ 把「显示通知横幅」关一下再打开。这一步会重新把应用的横幅开关写进系统，实测能修好「通知进了中心但不弹横幅」。
- **日志**：`%TEMP%\dsh-win-approval-notify\notify.log`，记录投递/跳过/失败；Toast 自身失败时 `%TEMP%\dsh-win-approval-notify\toast-error.log` 记录 HRESULT；`%TEMP%\dsh-win-approval-notify\diag.log` 记录系统对这个应用返回的通知状态（`Enabled` / 空），排查横幅问题用。
- **Toast 被拒**：日志出现 `toast rejected`，插件会尝试弹一个原生置顶卡片兜底；多为 AUMID 未注册或系统通知被关，可在设置页把 AUMID 留空（用默认）或检查 Windows 通知设置。
- **子代理刷屏**：调大冷却；v1 的 `skipSubagentSessions` 仅在会话 meta 带父会话标识时生效。
- **配置页没出现**：确认 profile 已重启、行 `approval-notify` 处于启用状态；旧版 DSH 没有 `plugins.row.config` slot，此时只能改 `cordis.patch.yml`（功能不受影响）。

## 卸载

```powershell
& "E:\azml\deepseek\resources\runtime\cli\bin\dsh.cmd" plugin --profile desktop remove dsh-win-approval-notify
```

然后重启应用。插件是独立的 bundle 行，删除不影响其它插件；设置页写入的覆盖值会随行一起失效。

## 安全

- 不发起网络请求，不读凭据；除 `%TEMP%\dsh-win-approval-notify\` 下的任务单/日志外不写文件。
- 通知文案只经 UTF-8 JSON 任务单传给 PowerShell，从不拼进命令行。
- 日志只记录事件类型、会话短 id、工具名和结果，**不记录原因/题目全文**。
- 诊断路由只接受 loopback 请求，只回传非敏感状态。

## 许可

MIT

