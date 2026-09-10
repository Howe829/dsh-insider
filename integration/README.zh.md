# DeepSeek Harness 接入

“DSH 洞察”（DSH Insider）是独立的 Profile Bundle。一个包完整持有四个接入面：Host 网关、
Web 客户端、生成的 Remote contribution 和 `cordis.patch.yml` 配置层。

## 安装

兼容版本发布到 npm 后执行：

```sh
dsh plugin --profile web add @howardchan/dsh-insider
```

安装后重启 Web profile。移除该包后，它的 Host 网关和 Web 界面会在下一次
启动时一并撤出。

本地检出场景先组装并打包，再把生成的 tarball 传给同一条 `dsh plugin`
命令；不需要把源码复制进 Harness。

## 兼容边界

当前修复已在 DSH Desktop `2.2.0-rc.1`（DSH 包族 `0.1.5-rc.1`）的原生窗口验证。
新版已移除 `@deepseek-ai/dsh-client-runtime/client`；状态存储使用平台提供的
`@deepseek-ai/dsh-client-store`，客户端上下文类型使用 Cordis `Context`。
`dsh.client.inject` 仅声明客户端插件，不能把无客户端入口的 store 包加入其中。
此修复需要提供新 store 入口的 DSH，不再支持只有旧 runtime 入口的版本。

`npm run verify` 会执行公开客户端 Bundle 的模块工厂，并使用真实 store 引擎验证
打开、服务选择、切换追踪页和关闭操作。测试模块表不提供已删除的 runtime 入口，
因此旧 Bundle 会在该回归测试中失败。

如果现有聚合层尚未挂载兼容服务，Web 客户端会自行挂载生成的
`runtimeExplorer` Remote contribution。这样既兼容现有 Harness 组装，也不再
要求为独立安装修改 `@deepseek-ai/dsh-api-remotes`。
