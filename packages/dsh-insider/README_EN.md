# DSH Insider

[中文](README.md) | English

DSH Insider is an independent Runtime Explorer for DeepSeek Harness and Cordis. The package is a
single dual-face DSH Bundle: its Host face projects runtime state and its Web
face renders Runtime Overview, the relationship graph, and request traces.

Install it into a Web profile, then restart that profile:

```sh
dsh plugin --profile web add @howardchan/dsh-insider
```

When upgrading, remove `@howardchan/dsh-runtime` before installing
`@howardchan/dsh-insider`. Saved graph layouts remain compatible.

The `0.1.8` build was verified on DSH Desktop `2.2.0-rc.1` (DSH package family
`0.1.5-rc.1`). It requires the platform-provided `@deepseek-ai/dsh-client-store`;
platforms exposing only the old runtime entry are no longer supported.
