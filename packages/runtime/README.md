# @deepseek-ai/dsh-runtime

English | [中文](README.zh.md)

Read-only Host gateway for DSH Insider. `RuntimeExplorerGateway` registers the `runtimeExplorer` service and publishes the direct Remote `runtimeExplorer/snapshot`. Each snapshot carries the exact profile published by the CLI launcher or Desktop profile service and projects the current Cordis Loader entries into plugin nodes while also enumerating their root and non-Loader child Fibers. Fiber records include instance uid, owning Loader entry, observable parent Fiber, phase, provided and injected services, unresolved injections, and Effect count; plugin records continue to expose service relationships and bounded Effect activity. A Host that provides neither fact reports `null`; the gateway never guesses one from files or process arguments.

The gateway also observes `session/event` and retains a bounded ring of correlation metadata for the request trace. A row can contain the event type, time, sequence, session id, turn, step, call id, tool name, outcome, and serialized payload character count. It never retains or returns prompt text, model output, tool arguments, or tool result content. Loader, Fiber, and Session remain the lifecycle authorities; this package only projects their live state.

Cordis Effect lifecycle notifications feed a second bounded window. It attributes Effects to their owning Loader entry and reports Current, Created, Disposed, Delta (`Created - Disposed`), Churn (`Created + Disposed`), bucketed current-count trends, and recent privacy-safe labels. Current is reconciled from live Fiber state on every snapshot; lifecycle changes start when this plugin activates and remain process-local.

## Configuration

- `traceLimit` controls the number of recent event metadata rows retained in memory. It defaults to `256` and must be at least `1`.
- `effectLimit` controls the maximum number of effect labels returned for each Loader entry. It defaults to `12`.
- `refreshIntervalMs` tells the browser how often to request a snapshot while the explorer is open. It defaults to `1500` and must be at least `250`.
- `activityWindowMs` controls the rolling Effect activity window. It defaults to `300000` (five minutes) and must be at least `1000`.
- `activityBucketMs` controls trend resolution. It defaults to `10000`, must be at least `250`, and cannot exceed `activityWindowMs`.
- `activityTransitionLimit` bounds retained Effect lifecycle rows. It defaults to `4096` and must be at least `1`; overflow marks the affected visible window incomplete.

Public payload types are exported from `./types`. Typert generates the Host and Client Remote artifacts exposed by `./typert` and `./remote`; the browser consumes the latter through the explicit [`api-remotes`](../../api/remotes/README.md) assembly rather than importing this Host implementation.

## Model Experience

None, as this read-only diagnostic gateway observes runtime state without registering a prompt, tool, message, provider request, or Agent-loop mutation.

#### KV Cache effect

None; it never assembles model input.

## Known Limitations and Deferred Work

- The graph is a point-in-time projection of Loader entries, currently enumerable Fibers, and Cordis service ownership. It has no durable history and does not infer dependencies that bypass Cordis injection or parent-child relationships that are not observable.
- The trace begins when this Host plugin activates, is process-local, and evicts older rows at `traceLimit`.
- Effect lifecycle history also begins at activation and is not persisted. Effects without a Loader owner are excluded from per-plugin activity, and transition overflow is reported instead of silently claiming a complete window.
- `payloadChars` is a diagnostic size indicator computed before the payload is discarded; it is not a byte count.
- The Remote is intentionally read-only: it cannot enable, disable, install, remove, or restart plugins.
