# DSH Insider

[中文](README.md) | English

DSH Insider is a read-only Runtime Explorer for DeepSeek Harness. It ships as
one independent, dual-face DSH plugin: the Host face projects Cordis runtime
state and privacy-safe session-event metadata, while the Web face renders the
graph and request trace. The overview also exposes per-plugin Effect activity
as Current, Delta, Churn, trend, and bounded recent lifecycle transitions.

## Screenshots

### Runtime overview

The overview combines process health, Cordis contexts, Effect activity, Agent
turns, events, and per-plugin lifecycle trends.

![Runtime overview and plugin activity](docs/images/runtime-overview-activity.png)

Plugin, Fiber, and Service distributions expose the same runtime state by
status and plugin type.

![Plugin, Fiber, and Service distributions](docs/images/runtime-overview-distributions.png)

### Relationship graph

The graph keeps DSH plugins and Cordis services primary by default instead of
filling the canvas with every runtime instance. Selecting a plugin or filtering
by Fiber status expands the relevant Fibers with ownership, parent, injection,
and missing-provider relationships.

![DSH and Cordis runtime relationship graph](docs/images/runtime-relationship-graph.png)

Select a plugin to inspect its runtime identity, neighborhood, and owned Fibers.
Fiber status cards now locate the exact pending, active, disposed, or failed
instances instead of falling back to a plugin-status filter.

<a href="docs/images/runtime-node-inspector.png"><img src="docs/images/runtime-node-inspector.png" width="49%" alt="Focused plugin node and runtime inspector"></a>
<a href="docs/images/runtime-service-filter.png"><img src="docs/images/runtime-service-filter.png" width="49%" alt="All registered Cordis service nodes"></a>

### Request trace

Request Trace groups captured metadata by Session and Agent Turn before opening
the detailed event flow for a selected turn.

![Session and Agent Turn request trace](docs/images/runtime-request-trace.png)

## Install

Install the public package into a Web profile, then restart that profile:

```sh
dsh plugin --profile web add @howardchan/dsh-insider
```

No Harness source edit or central Remote registry edit is required.

When upgrading from `@howardchan/dsh-runtime`, remove the old package before
installing the new one so both Bundles cannot register the gateway and UI at
the same time. Saved graph layouts remain compatible.

```sh
dsh plugin --profile web remove @howardchan/dsh-runtime
dsh plugin --profile web add @howardchan/dsh-insider
```

## Packages

- `packages/dsh-insider`: the only publishable package, named `@howardchan/dsh-insider`.
- `packages/runtime`: private Host source/build unit.
- `packages/ui-runtime`: private Web source/build unit.

The public package carries the Host gateway, Web UI, generated Remote
contribution, and Bundle patch.

## Current development baseline

Version `0.1.8` was verified in native DSH Desktop `2.2.0-rc.1` (DSH package
family `0.1.5-rc.1`). The client uses the platform-provided
`@deepseek-ai/dsh-client-store`, replacing the removed runtime entry. Older
platforms exposing only that runtime entry are no longer supported. DSH peers
remain optional because the selected profile provides them.

The repository ships prebuilt `lib/` artifacts. Bundle regression tests run
locally; full source builds and browser suites require a matching Harness
workspace. See [integration/README.md](integration/README.md).

## Verification

```sh
npm run verify
npm run pack:dry-run
```

The independent Bundle tests run in this repository. Browser integration tests
are kept with the Web source unit and run in the matching Harness checkout.

## Privacy boundary

The trace stores metadata only: session id, event type, sequence, time, lane,
turn, step, call id, tool name, outcome, and serialized payload size. Prompt
text, model output, tool arguments, tool results, and failure messages are not
exposed by the runtime snapshot.

## License

MIT
