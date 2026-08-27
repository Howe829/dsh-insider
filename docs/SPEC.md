# DSH Insider Product and Engineering Specification

Status: Draft v0.3
Audience: DSH Insider maintainers, DeepSeek Harness contributors, and reviewers
Primary product: an Obsidian-style live network graph of DSH plugins

## 1. Product definition

DSH Insider is a read-only Runtime Explorer for DeepSeek Harness.

Its primary surface is a live network graph that answers:

> How are the plugins in this DSH runtime related through Cordis?

The graph treats plugin runtime instances as the main entities. Cordis concepts
such as services, dependency injection, child-plugin ownership, scopes, and
lifecycle states define the graph's relationships and visual semantics.

The product is not a generic Cordis object browser. It should expose Cordis
concepts only when they help a user understand the plugin network.

## 2. Goals

The product should let a user:

1. See all relevant DSH plugins in one live network graph.
2. Understand which plugin consumes a service and which plugin provides it.
3. Understand which plugin mounted and owns another plugin.
4. See the current lifecycle status of each plugin runtime instance.
5. Diagnose why a plugin is `PENDING`.
6. Focus on the dependency neighbourhood of one selected plugin.
7. Keep a manually arranged graph stable while runtime snapshots refresh.
8. Correlate a selected Agent Turn with involved plugins when reliable
   attribution is available.
9. Inspect the runtime without capturing prompts, model outputs, tool arguments,
   tool results, credentials, or other payload content.
10. Detect Effect growth and lifecycle churn per plugin without turning Effects
    into graph nodes.

## 3. Non-goals

The MVP must not become:

- a plugin configuration editor;
- a visual workflow builder;
- a drag-to-rewire dependency editor;
- a persistent observability database;
- a distributed tracing backend;
- a full OpenTelemetry implementation;
- an arbitrary graph-query system;
- a generic viewer for every Cordis internal object;
- an automatic debugging or code-modification agent;
- a payload inspection tool.

Node dragging changes presentation only. It must never change the DSH runtime.

## 4. Cordis concepts in the graph

The product maps Cordis concepts as follows:

| Cordis concept | Product representation |
| --- | --- |
| Plugin definition | Node name and module metadata |
| Fiber | On-demand node for one live plugin runtime instance |
| Service | Label and semantics of an injection relationship |
| `inject` | Consumer-to-provider dependency edge |
| `ctx.plugin(child)` | Owner-to-child `mounts` edge |
| Context / Scope | Graph grouping, breadcrumb, or filter |
| Fiber lifecycle | Node status and appearance |
| Effect | Overview activity and selected-plugin detail, not a graph node |
| Event | Optional runtime activity overlay or trace data |
| Agent Turn | Separate timeline plus an optional active-path overlay |

Context must not be rendered as a hub connected to every node. Effects and
events must not be promoted into graph nodes by default.

## 5. Primary graph model

### 5.1 Primary node

The default graph contains Loader-entry plugin nodes. Fiber instances are
projected as separate nodes only when a plugin is selected, a Fiber is selected,
or the user enters a Fiber status/category view. This keeps the ordinary graph
readable while preserving exact runtime-instance diagnosis.

```ts
interface RuntimePluginNode {
  id: string
  logicalKey: string

  entryId?: string
  fiberId?: string
  runtimeId?: string

  moduleName: string
  label: string

  parentFiberId?: string
  scopeId?: string

  status: RuntimePluginStatus
  enabled: boolean

  injects: string[]
  provides: string[]
  missing: string[]

  effectCount: number
}
```

`logicalKey` identifies the logical plugin placement and is used for saved UI
layout. `fiberId` identifies the current runtime instance and must not be reused
for a replacement Fiber.

Multiple Fibers created from the same plugin definition must be representable as
separate nodes. Each Fiber node retains its owner Loader entry, optional parent
Fiber, lifecycle state, services, missing injections, and Effect count.

### 5.2 Product-facing status

The graph and filters expose exactly four product-facing states:

```ts
type RuntimePluginStatus =
  | 'PENDING'
  | 'ACTIVE'
  | 'DISPOSED'
  | 'FAILED'
```

Detailed Cordis transition states are collapsed for the primary graph:

| Cordis state | Product state |
| --- | --- |
| `PENDING`, `LOADING` | `PENDING` |
| `ACTIVE` | `ACTIVE` |
| `UNLOADING`, no live Fiber | `DISPOSED` |
| `FAILED` | `FAILED` |

The transport must serialize named states. It must not expose numeric Cordis
enum ordinals as the public protocol.

### 5.3 Primary edges

The graph has two primary edge types:

```ts
type RuntimeRelation = 'injects' | 'mounts'

interface RuntimePluginEdge {
  id: string
  type: RuntimeRelation
  source: string
  target: string
  services?: string[]
}
```

Direction is semantic and stable:

```text
Consumer Plugin -- injects: service --> Provider Plugin
Owner Plugin    -- mounts -----------> Child Plugin
```

Multiple injected services resolved by the same provider may be aggregated on
one edge and displayed as edge labels.

### 5.4 Service expansion

Services are not first-class nodes in the default graph. This keeps a large DSH
runtime readable and makes the graph primarily about plugin relationships.

A service may be expanded into a temporary diagnostic node when:

- a selected plugin is `PENDING` because the service has no provider;
- the user explicitly enables a service-detail layer;
- multiple providers or an ambiguous resolution need explanation.

Example:

```text
agent -- injects --> Service: llm -- NO PROVIDER
```

This diagnostic expansion does not change the canonical plugin graph.

### 5.5 Scope

Scope is graph metadata, not a normal node. It may appear as:

- a visual cluster or boundary;
- a breadcrumb in the inspector;
- a scope filter;
- a colour or badge;
- an optional nested graph group.

The collector must not claim a service resolution scope unless the runtime
provides enough evidence to determine it.

## 6. Graph interaction

The Runtime Graph must support:

- wheel or trackpad zoom;
- explicit zoom-in and zoom-out controls;
- fit-to-screen;
- reset view;
- canvas panning;
- node dragging;
- node pinning;
- node click and hover;
- search by plugin, module, entry, or service name;
- filtering by the four product-facing states;
- filtering by relation type;
- optional filtering by scope;
- focus on one node's related subgraph;
- return to the complete graph.

### 6.1 Related-node focus

Selecting a plugin enters focus mode. The graph shows the selected node and its
related plugins rather than leaving unrelated nodes on the canvas.

The relationship depth must be explicit:

```ts
type NeighbourDepth = 1 | 2 | 'all'
```

The initial default is `1`. The user may expand the focus to two hops or the
complete connected component.

Relationships should be visually classified as:

- dependency: a provider required by the selected plugin;
- dependant: a consumer that requires the selected plugin;
- child: a plugin mounted by the selected plugin;
- owner: the plugin that mounted the selected plugin;
- transitive: a relation beyond the first hop.

### 6.2 Obsidian-style layout behaviour

The target interaction model is an Obsidian-style force-directed network graph,
not a static tree or a fixed left-to-right dependency diagram.

The layout must follow these rules:

1. A snapshot that changes status only must not recalculate node positions.
2. A snapshot with unchanged topology must preserve zoom, pan, selection, and
   pinned positions.
3. New nodes should appear close to a related node when possible.
4. Removed nodes may fade out before being removed from the active graph.
5. Dragging a node pins it unless the user explicitly unpins it.
6. Fit-to-screen is user initiated except on the first successful load.
7. Search, filter, or selection changes must not silently reset the viewport.
8. Force simulation must settle and stop consuming continuous CPU.

The graph may begin with a deterministic seed so that the initial layout remains
reproducible across sessions with the same logical topology.

### 6.3 Visual semantics

Recommended node semantics:

| Status | Visual treatment |
| --- | --- |
| `PENDING` | amber, missing-dependency indicator |
| `ACTIVE` | green status indicator |
| `DISPOSED` | muted grey, optionally fading out |
| `FAILED` | red status and error indicator |

Recommended edge semantics:

- `injects`: directed dependency edge labelled by service name;
- `mounts`: visually distinct ownership edge;
- missing dependency: dashed edge ending at a missing-service marker;
- current Agent Turn path: temporary highlighted overlay;
- error path: red overlay only when attribution is proven.

Animation must communicate runtime activity or change. Decorative continuous
animation is not required.

## 7. Plugin inspector

Selecting a plugin opens a detail panel with:

```text
Plugin label
Module name
Entry ID
Fiber ID
Runtime ID
Current status
Owner / parent Fiber
Scope

Injects
Provides
Missing dependencies

Live effect count and safe labels
Recent lifecycle transitions
Recent attributed Agent Turns, when available
```

The panel must distinguish a missing value from a value that the runtime cannot
expose safely or reliably.

## 8. PENDING diagnosis

`PENDING` is a valid Cordis lifecycle state and must not be classified as a
failure by itself.

For a selected `PENDING` plugin, derive:

```ts
interface PendingDiagnosis {
  fiberId?: string
  requiredServices: string[]
  availableServices: string[]
  missingServices: string[]
}
```

The graph should:

1. Highlight injected-service relationships.
2. Identify current providers for available services.
3. Show missing-service markers for unavailable services.
4. Explain that the Fiber is waiting rather than failed.
5. Update automatically when a provider appears or disappears.

The inspector must not invent a last-known provider unless bounded transition
history proves that relationship.

## 9. Runtime identity

The protocol distinguishes configuration identity from runtime identity:

```ts
interface RuntimeIdentity {
  bootId: string
  entryId?: string
  logicalKey: string
  fiberId?: string
  runtimeId?: string
}
```

- `bootId` identifies one Harness process lifetime.
- `entryId` identifies one Loader configuration entry.
- `logicalKey` identifies the logical graph placement for UI layout reuse.
- `fiberId` identifies one Fiber instance inside one process lifetime.
- `runtimeId` identifies a plugin runtime or definition when exposed.

The inspector must assign or retain a Fiber identity before disposal if Cordis
clears its runtime UID during disposal.

HMR replacement creates a new `fiberId`. It must not rewrite the old Fiber's
history as though the same runtime instance continued.

## 10. Runtime snapshot

The UI consumes a normalized, client-safe snapshot rather than private Cordis
objects.

```ts
interface RuntimeExplorerSnapshot {
  schemaVersion: number
  bootId: string
  snapshotSeq: number
  observedAt: number

  profile: string | null
  workspaceKey?: string

  graph: {
    nodes: RuntimePluginNode[]
    edges: RuntimePluginEdge[]
  }

  effectActivity: RuntimeEffectActivitySnapshot

  transitions: FiberStateTransition[]
  trace: RuntimeTraceEvent[]

  capabilities: RuntimeExplorerCapabilities
  limits: RuntimeExplorerLimits
}
```

```ts
interface RuntimeExplorerCapabilities {
  fiberInstances: boolean
  ownershipEdges: boolean
  scopes: boolean
  lifecycleTransitions: boolean
  turnPluginAttribution: boolean
  eventDispatch: 'none' | 'summary' | 'listener'
  payloadCapture: false
}

interface RuntimeExplorerLimits {
  transitionLimit: number
  traceEventLimit: number
}
```

Capabilities make partial but correct instrumentation explicit. The UI must not
simulate unsupported data.

## 11. Live updates and transport

The protocol is independent of its carrier.

```ts
interface RuntimeExplorerTransport {
  snapshot(): Promise<RuntimeExplorerSnapshot>
  subscribe?(listener: (event: RuntimeDelta) => void): () => void
}
```

The current baseline uses the existing DSH typed Remote snapshot call with
visible-only, single-flight polling. This remains acceptable for the MVP.

Incremental events may be added through an existing authenticated DSH transport
when polling proves insufficient. The SPEC does not require a new dedicated
WebSocket, HTTP route, reconnect loop, or trust boundary.

On every new snapshot the client must:

1. Reject or migrate unsupported schema versions.
2. Detect a changed `bootId` and discard process-local runtime history.
3. Diff topology separately from state and metadata.
4. Preserve the viewport and layout when topology is unchanged.
5. Reconcile selection if the selected Fiber disappears.
6. Keep saved logical layout independent from current Fiber identity.

## 12. Data lifecycle and persistence

Runtime truth is ephemeral and snapshot-authoritative.

### 12.1 Data that is not persisted

The MVP does not persist the following across Harness restarts:

- current Fiber state;
- current service availability;
- runtime dependency topology;
- lifecycle transition history;
- Agent Turn trace events;
- errors or effect metadata;
- Effect lifecycle activity and recent transition metadata.

Transitions and trace events are kept in bounded in-process ring buffers. A new
`bootId` starts a new observation window.

### 12.2 Data that may be persisted locally

The browser may persist presentation preferences:

```ts
interface SavedGraphLayout {
  schemaVersion: number
  profile: string | null
  workspaceKey?: string
  updatedAt: number

  positions: Record<string, {
    x: number
    y: number
    pinned: boolean
  }>

  neighbourDepth: NeighbourDepth
  relationFilters: RuntimeRelation[]
}
```

Saved positions are keyed by `logicalKey`, not `fiberId`. They must be scoped by
profile and workspace when those values are available. Unknown and expired keys
should be pruned without affecting the runtime.

### 12.3 Export

Historical diagnosis is opt-in through an explicit sanitized export. Export is
not required for the first graph MVP. If added, it must remain metadata-only and
must include its schema version, `bootId`, observation range, and truncation
limits.

## 13. Agent Turn trace

Request Trace remains a separate primary tab because chronological execution
and runtime topology answer different questions.

Its directory is organized as:

```text
Session
  Agent Turn
    chronological trace events
```

The runtime may project a selected Turn back onto the graph as an active-path
overlay only when events can be attributed to plugin/Fiber identities.

The overlay must not create permanent graph edges. It is an observation over the
canonical plugin network.

The MVP retains the existing metadata-only trace. Listener-level Cordis event
dispatch tracing, waterfall continuation, inputs, outputs, and payload capture
are not requirements for the graph MVP.

## 14. Lifecycle transitions

Recent state transitions may be retained in memory:

```ts
interface FiberStateTransition {
  fiberId: string
  from?: RuntimePluginStatus
  to: RuntimePluginStatus
  timestamp: number
  reason?: {
    code: string
    source: 'runtime' | 'derived' | 'unknown'
    confidence: 'certain' | 'probable'
  }
}
```

A reason must be omitted or marked unknown when instrumentation cannot prove it.
The UI must not infer HMR, explicit disposal, parent disposal, configuration
disablement, or dependency restoration from timing alone.

### 14.1 Effect activity model

Effect observability is grouped by the owning Loader plugin. Effects created by
non-Loader child Fibers are attributed to the nearest ancestor Loader entry, so
the plugin total represents the complete live subtree rather than only the
entry's root Fiber.

For each plugin the runtime projects:

```ts
interface RuntimePluginEffectActivity {
  pluginId: string
  current: number
  created: number
  disposed: number
  delta: number
  churn: number
  trend: Array<{
    time: number
    current: number
    created: number
    disposed: number
  }>
}
```

The metrics have distinct meanings:

- `current` is the point-in-time number of live Effects, reconciled from all
  current Fibers owned by the plugin;
- `created` and `disposed` are lifecycle transitions observed inside the
  configured activity window;
- `delta = created - disposed` is the net change inside that window;
- `churn = created + disposed` measures lifecycle activity even when net change
  is zero;
- `trend` is the bucketed reconstruction of current Effect count over the
  retained window.

The overview shows a compact Plugin Activity list with `current`, `delta`,
`churn`, and a sparkline. Selecting a row opens the plugin's detailed metrics,
window trend, and bounded recent Effect transitions.

Activity history begins when the runtime gateway becomes active. It is
process-local, bounded by both time and transition count, and is cleared on a
new `bootId`. If the count bound truncates transitions still inside the visible
window, the snapshot must mark the window incomplete and the UI must disclose
that limitation. `Current` remains authoritative even when history is
incomplete; derived window metrics do not.

## 15. Instrumentation boundary

The runtime package is a dedicated read-only inspector adapter.

It should use stable public APIs where practical and isolate unavoidable Cordis
internal access behind small, tested projection functions.

The following require explicit capability reporting:

- enumeration of non-Loader child Fibers;
- stable Fiber identity through disposal;
- owner-to-child relationships;
- service resolution scope;
- lifecycle transition reasons;
- plugin attribution for Agent Turn events;
- listener-level event-dispatch tracing.

Listener-level Event Flow requires a separate Cordis instrumentation proposal.
It is not part of this SPEC's MVP implementation sequence.

## 16. Privacy and safety

The runtime snapshot must not expose:

- prompt or message content;
- model request or response content;
- tool arguments or tool results;
- failure messages that may contain user data;
- credentials or environment values;
- file contents;
- arbitrary private Cordis objects.

The MVP has no `capturePayloads` switch. Payload capture is structurally disabled:

```ts
payloadCapture: false
```

Safe metadata may include identifiers, event kinds, timestamps, duration,
sequence numbers, status, service names, tool names, payload size, and bounded
effect labels after review.

## 17. Performance budgets

The implementation must define bounded behaviour rather than relying on an
unlimited graph or history.

Initial targets:

- status-only refresh must not restart layout simulation;
- viewport state must survive every successful refresh;
- force simulation must settle or pause when the overlay is hidden;
- transitions and trace events must have configured upper bounds;
- graph rendering must degrade safely when labels or effects are truncated;
- the UI must remain interactive with at least 250 plugin nodes and 1,000 edges;
- hidden or closed UI must not poll or animate continuously;
- layout persistence must not grow without stale-key pruning.

Exact latency and memory thresholds should be established by measurement before
the first release that introduces force-directed layout.

## 18. MVP scope

The MVP is an evolution of the current implementation, not a rewrite.

### Required

1. Existing Runtime Graph and Request Trace remain functional.
2. Plugin nodes are the default graph entities; Fiber nodes are first-class,
   on-demand diagnostic entities.
3. Injected services are represented as consumer-to-provider edges.
4. Parent-child ownership is represented as `mounts` when evidence is available.
5. The four product-facing states are used consistently in summary, graph, and
   filters.
6. Selecting a node shows its related subgraph.
7. Search, lifecycle filtering, pan, zoom, fit, and reset work without losing
   viewport state on refresh.
8. A force-directed layout supports drag and pin without changing runtime state.
9. Saved presentation layout is isolated by profile/workspace and logical key.
10. Missing required services produce an explicit `PENDING` diagnosis.
11. Snapshot identity includes schema, process boot, and sequence information.
12. Runtime data and trace history remain bounded and non-persistent.
13. Payload content remains structurally excluded.
14. The overview exposes per-plugin Effect `current`, `delta`, `churn`, and
    trend, with a drill-down into recent lifecycle transitions.

### After MVP

- scope clusters and scope filtering;
- optional Service expansion layer;
- dedicated Runtime Tree derived from the same Fiber model;
- recent lifecycle transition timeline;
- selected Turn active-path overlay;
- sanitized trace export;
- historical snapshot comparison;
- listener-level Event Flow after a separate instrumentation design.

## 19. Implementation sequence

### Phase 1: protocol and identity

- add schema, boot, sequence, capability, and limit metadata;
- separate Loader entry identity, logical layout identity, and Fiber identity;
- preserve compatibility with the current snapshot while migrating tests.

### Phase 2: relation projection

- retain existing injection edges;
- add ownership edges only when runtime evidence is reliable;
- add bounded PENDING diagnosis;
- test provider removal and restoration.

### Phase 3: graph state reconciliation

- diff topology separately from node state;
- preserve zoom, pan, selection, and positions on status refresh;
- reconcile new, removed, and replaced Fibers;
- detect Harness process restart through `bootId`.

### Phase 4: Obsidian-style layout

- introduce seeded force-directed layout;
- implement drag, pin, unpin, settle, fit, and reset;
- persist only presentation layout;
- test refresh stability and stale-key pruning.

### Phase 5: diagnosis and cross-navigation

- expose missing-service markers and explanations;
- add configurable neighbour depth;
- cross-link a trace event or Turn to a graph node only when attribution is
  supported.

### Phase 6: Effect activity

- capture typed Cordis Effect create/dispose lifecycle metadata;
- reconcile current counts from every owned Fiber on each snapshot;
- expose bounded per-plugin activity windows and overflow completeness;
- render Plugin Activity overview and selected-plugin detail.

## 20. Acceptance criteria

### 20.1 Dependency graph

Given a provider plugin exposing `greeter` and a consumer injecting `greeter`:

- both plugins appear as separate nodes;
- one directed `injects: greeter` edge points from consumer to provider;
- selecting either node reveals the other within one-hop focus;
- no standalone Service node is required in the default graph.

### 20.2 Missing dependency

When the provider is absent:

- the consumer is shown as `PENDING`;
- `greeter` appears in its missing-service diagnosis;
- a missing-service marker may be shown;
- no provider plugin is invented.

When the provider is mounted:

- the consumer converges to `ACTIVE`;
- the provider edge appears;
- existing user viewport and pinned positions remain unchanged.

When the provider is disposed:

- the consumer returns to `PENDING` or the runtime-observed equivalent;
- the dependency edge is removed or converted into a missing marker;
- the graph does not automatically fit or jump to another position.

### 20.3 Ownership

Given an owner plugin that mounts a child through Cordis:

- the graph shows an owner-to-child `mounts` edge when ownership is observable;
- disposing the owner removes or disposes the child according to runtime truth;
- injection and ownership relationships remain visually distinguishable.

### 20.4 HMR and identity

When HMR replaces a plugin:

- the new Fiber has a distinct `fiberId`;
- the logical node may reuse its saved layout through `logicalKey`;
- old process-local history is not rewritten onto the new Fiber;
- the live graph converges without resetting the viewport.

### 20.5 Persistence

After arranging and pinning nodes, reopening the graph under the same profile and
workspace restores compatible positions. Restarting Harness rebuilds runtime
truth from a new snapshot and does not restore old Fiber states or trace events.

### 20.6 Privacy

Automated tests must demonstrate that snapshot and trace serialization exclude
message content, model content, tool arguments, tool results, and failure text.

### 20.7 Effect activity

Given a plugin with one Effect created and then disposed inside the activity
window:

- `created` increases by one after creation;
- `current` and `delta` increase by one while the Effect is live;
- after disposal, `current` and `delta` return to their prior values;
- `disposed` increases by one and `churn` increases by two;
- the recent list records both transitions without payload content;
- an Effect owned by a child Fiber contributes to the nearest Loader plugin;
- overflow marks the activity window incomplete without corrupting `current`.

## 21. Current baseline and migration rule

The current implementation already provides:

- a Loader-entry-centred dependency graph;
- service-labelled consumer-to-provider edges;
- missing-service metadata;
- four product-facing lifecycle summaries and filters;
- node focus, pan, zoom, fit, and refresh-stable viewport;
- metadata-only Session and Agent Turn trace;
- per-plugin Effect Current, Delta, Churn, trend, and recent transitions;
- an existing typed Remote snapshot carrier.

This work is retained. The implementation should migrate incrementally toward
Fiber-aware identities and Obsidian-style layout rather than replacing the
working graph and trace with a second independent model.

## 22. Design principles

1. Plugin relationships are the product; Cordis internals support the product.
2. Semantic correctness is more important than visual density or animation.
3. The default graph shows plugins and meaningful relationships, not every
   observable runtime object.
4. Runtime truth comes from the current snapshot.
5. Layout state belongs to the user and must survive harmless refreshes.
6. Unsupported instrumentation is reported as unsupported, never inferred.
7. Privacy is structural, not dependent on a default-off UI switch.
8. Every new graph layer must answer a concrete diagnostic question.

## 23. Open decisions

The following require focused prototypes or runtime evidence before they become
normative:

1. Which force-layout engine best fits the DSH client bundle and lifecycle?
2. What stable `logicalKey` can represent repeated, dynamically mounted plugins?
3. Which Cordis API can enumerate child Fibers without broad private access?
4. How should isolated service scopes be represented when resolution boundaries
   differ from Loader groups?
5. What node and edge counts require clustering, label reduction, or a fallback
   layout?
6. What reliable events can attribute an Agent Turn to specific plugin Fibers?

These decisions must be resolved independently. They do not block the core
plugin relationship graph, current metadata-only trace, or PENDING diagnosis.
