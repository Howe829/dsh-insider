# DeepSeek Harness integration

DSH Insider is an independent Profile Bundle. The package owns all four
integration surfaces: the Host gateway, Web client, generated Remote
contribution, and `cordis.patch.yml` layer.

## Install

After a compatible release is available on npm:

```sh
dsh plugin --profile web add @howardchan/dsh-insider
```

Restart the Web profile after installation. Removing the package withdraws its
Host gateway and Web surface on the next restart.

For a local checkout, assemble and pack the package first, then pass the
resulting tarball to the same `dsh plugin` command. The source repository does
not need to be copied into Harness.

## Compatibility boundary

The current fix was verified in the native DSH Desktop `2.2.0-rc.1` window
(DSH package family `0.1.5-rc.1`). That platform removed
`@deepseek-ai/dsh-client-runtime/client`. The plugin now imports the platform's
`@deepseek-ai/dsh-client-store` and uses Cordis `Context` for client types.
The store is a platform module, not a client plugin: do not add it to
`dsh.client.inject`. This fix requires the new store entry and does not support
platforms exposing only the old runtime entry.

`npm run verify` executes the shipped client module factory and exercises
opening, service selection, switching to tracing, and closing with the real
store engine. Its module table excludes the deleted runtime entry, so the old
bundle fails this regression test.

The Web client mounts its own generated `runtimeExplorer` Remote contribution
when no compatible aggregate has already mounted it. This keeps existing
Harness assemblies working while removing the need to edit
`@deepseek-ai/dsh-api-remotes` for independent installation.
