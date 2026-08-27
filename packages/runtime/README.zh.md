# @deepseek-ai/dsh-runtime

[English](README.md) | 中文

“DSH 洞察”的只读 Host 网关。`RuntimeExplorerGateway` 注册 `runtimeExplorer` 服务，并发布直接 Remote `runtimeExplorer/snapshot`。每份快照都会携带 CLI 启动器或 Desktop profile 服务精确发布的 profile，并将当前 Cordis Loader 条目投影为插件节点，同时枚举其根 Fiber 与非 Loader 子 Fiber。Fiber 投影包含实例 uid、归属 Loader 条目、可观测的父 Fiber、阶段、提供与注入的服务、未满足的注入及 Effect 数量；插件投影继续提供服务关系和有界 Effect 活动。两种宿主事实均不存在时返回 `null`；网关不会从文件或进程参数中猜测。

网关还会观察 `session/event`，用有界环形窗口保留请求追踪所需的关联元数据。一条记录可包含事件类型、时间、序号、会话 id、turn、step、call id、工具名、结果与序列化 payload 的字符数。它不会保留或返回提示词、模型输出、工具参数或工具结果内容。Loader、Fiber 和 Session 仍是生命周期权威；本包只投影它们的实时状态。

Cordis Effect 生命周期通知会进入另一个有界窗口。网关把 Effect 归属到其 Loader 条目，并报告 Current、Created、Disposed、Delta（`Created - Disposed`）、Churn（`Created + Disposed`）、分桶后的当前数量趋势，以及只包含安全标签的最近记录。Current 会在每次快照时从实时 Fiber 状态校准；生命周期变化从本插件激活时开始，并且只存在于当前进程。

## 配置

- `traceLimit` 控制内存中保留的最近事件元数据条数，默认为 `256`，最小为 `1`。
- `effectLimit` 控制每个 Loader 条目返回的 effect 标签上限，默认为 `12`。
- `refreshIntervalMs` 告诉浏览器在探查器打开时多久请求一次快照，默认为 `1500`，最小为 `250`。
- `activityWindowMs` 控制 Effect 活动滚动窗口，默认为 `300000`（五分钟），最小为 `1000`。
- `activityBucketMs` 控制趋势粒度，默认为 `10000`，最小为 `250`，且不能超过 `activityWindowMs`。
- `activityTransitionLimit` 限制保留的 Effect 生命周期记录数，默认为 `4096`，最小为 `1`；发生溢出时，受影响的可见窗口会被标记为不完整。

公开 payload 类型从 `./types` 导出。Typert 生成由 `./typert` 与 `./remote` 暴露的 Host 和 Client Remote 产物；浏览器通过显式的 [`api-remotes`](../../api/remotes/README.md) 组合消费 Client 产物，而不会导入这个 Host 实现。

## 模型体验

无，因为这个只读诊断网关只观察运行时状态，不注册提示词、工具、消息、提供方请求或 Agent loop 修改。

#### KV Cache 影响

无；它从不组装模型输入。

## 已知限制与暂缓事项

- 依赖图是 Loader 条目、当前可枚举 Fiber 与 Cordis 服务归属的当下投影。它不保留持久历史，也不推断绕过 Cordis 注入的依赖或不可观测的父子关系。
- 追踪从这个 Host 插件激活时开始，只存在于当前进程，并会在超过 `traceLimit` 时驱逐旧记录。
- Effect 生命周期历史同样从激活时开始且不持久化。无法归属到 Loader 的 Effect 不进入插件活动表；记录溢出会被明确报告，而不会静默宣称窗口完整。
- `payloadChars` 是在丢弃 payload 之前计算的诊断性大小指标，不是字节数。
- Remote 刻意保持只读：它不能启用、停用、安装、移除或重启插件。
