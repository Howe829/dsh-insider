# DSH Insider

中文 | [English](README_EN.md)

“DSH 洞察”（DSH Insider）是面向 DeepSeek Harness 与 Cordis 的独立 Runtime Explorer。这个 npm 包是一份
双端 DSH Bundle：Host 端投影运行时状态，Web 端提供运行时总览、关系图谱和请求追踪。

安装到 Web profile 后重启该 profile：

```sh
dsh plugin --profile web add @howardchan/dsh-insider
```

从旧包升级时，请先移除 `@howardchan/dsh-runtime`，再安装
`@howardchan/dsh-insider`；已保存的图谱布局会继续复用。

当前 `0.1.6` 构建面向 DSH `0.1.0-rc.8` 包族。
