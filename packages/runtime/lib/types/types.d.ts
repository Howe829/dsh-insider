/** Client-safe snapshot vocabulary for DSH Insider. @module @deepseek-ai/dsh-runtime/types */
/** Current normalized snapshot contract emitted by DSH Insider. */
export declare const RUNTIME_EXPLORER_SCHEMA_VERSION = 6;
/** Four product-facing lifecycle states shared by overview summaries and filters. */
export type RuntimeOverviewStatus = 'pending' | 'active' | 'disposed' | 'failed';
/** Stable plugin domains used across the overview cards and dependency graph. */
export type RuntimePluginCategory = 'core' | 'agent' | 'model' | 'tool' | 'session' | 'interface' | 'extension';
/** Counts for one complete four-state lifecycle partition. */
export interface RuntimeStatusCounts {
    readonly pending: number;
    readonly active: number;
    readonly disposed: number;
    readonly failed: number;
}
/** One plugin-domain row in a Type by Status stacked chart. */
export interface RuntimeTypeStatusBreakdown extends RuntimeStatusCounts {
    readonly category: RuntimePluginCategory;
    readonly total: number;
}
/** One overview collection whose status and category totals both equal `total`. */
export interface RuntimeCollectionOverview {
    readonly total: number;
    readonly statuses: RuntimeStatusCounts;
    readonly byType: readonly RuntimeTypeStatusBreakdown[];
}
/** Registered service names, concrete scoped implementations, and provider-Fiber health. */
export interface RuntimeServiceOverview extends RuntimeCollectionOverview {
    readonly implementations: number;
}
/** Lifecycle phase of one configured Loader entry's root Fiber. */
export type RuntimeFiberPhase = 'pending' | 'loading' | 'active' | 'failed' | 'unloading' | null;
/** One configured plugin in the current Loader tree. */
export interface RuntimeGraphNode {
    /** Stable snapshot identity derived from the Loader entry id. */
    readonly id: string;
    /** Stable logical placement key used only for presentation layout reuse. */
    readonly logicalKey: string;
    /** Loader-tree entry id, including parent include/group prefixes. */
    readonly entryId: string;
    /** Identity of the current root Fiber inside one Harness boot, when live. */
    readonly fiberId?: string;
    /** Identity shared by Fibers created from the same Cordis plugin runtime. */
    readonly runtimeId?: string;
    /** Exact module specifier imported for this entry. */
    readonly moduleName: string;
    /** Short display label derived from the module specifier. */
    readonly label: string;
    /** Effective Loader enablement, including disabled ancestor groups. */
    readonly enabled: boolean;
    /** Current root Fiber phase, or null when the entry has no live root Fiber. */
    readonly phase: RuntimeFiberPhase;
    /** Services provided by this entry's Fiber subtree. */
    readonly provides: readonly string[];
    /** Services declared by this entry's root Fiber. */
    readonly injects: readonly string[];
    /** Declared services with no live provider in the current context. */
    readonly missing: readonly string[];
    /** First configured number of live effect labels, depth-first. */
    readonly effects: readonly string[];
    /** Total number of live effect labels before the configured projection cap. */
    readonly effectCount: number;
}
/** Service dependency from one Loader entry to another. */
export interface RuntimeGraphEdge {
    /** Stable identity for this aggregated relationship. */
    readonly id: string;
    /** Cordis relation represented by the directed edge. */
    readonly type: 'injects';
    /** Consumer node id. */
    readonly source: string;
    /** Provider node id. */
    readonly target: string;
    /** Injected services resolving through this provider. */
    readonly services: readonly string[];
}
/** One live Cordis Fiber instance, materialized by the client only for focused diagnostics. */
export interface RuntimeGraphFiberNode {
    /** Process-lifetime identity derived from the Harness boot id and Cordis Fiber uid. */
    readonly id: string;
    /** Fiber uid allocated by the current Cordis registry. */
    readonly uid: number;
    /** Human-readable Cordis runtime name inherited by the Fiber. */
    readonly name: string;
    /** Runtime/package name used to classify and search this Fiber. */
    readonly moduleName: string;
    /** Identity shared by Fibers created from the same Cordis plugin runtime. */
    readonly runtimeId?: string;
    /** Loader plugin that owns this Fiber subtree, when one exists. */
    readonly ownerNodeId?: string;
    readonly ownerEntryId?: string;
    /** Parent Fiber identity, absent when the parent is the root Context. */
    readonly parentFiberId?: string;
    /** True when this is the Loader entry's root Fiber represented by the owner plugin node. */
    readonly entryRoot: boolean;
    readonly phase: RuntimeFiberPhase;
    readonly provides: readonly string[];
    readonly injects: readonly string[];
    readonly missing: readonly string[];
    readonly effectCount: number;
}
/** One concrete Cordis service implementation inside its resolved isolation scope. */
export interface RuntimeGraphServiceNode {
    /** Process-lifetime identity of this scoped service implementation. */
    readonly id: string;
    /** Cordis service name exposed to consumers. */
    readonly name: string;
    /** Loader plugin that owns the providing Fiber, absent for a root Context service. */
    readonly providerNodeId?: string;
    readonly providerEntryId?: string;
    /** Current provider-Fiber identity and lifecycle phase. */
    readonly providerFiberId?: string;
    readonly phase: RuntimeFiberPhase;
}
/** Exact scoped resolution from one consuming plugin to one service implementation. */
export interface RuntimeGraphServiceRelation {
    readonly id: string;
    readonly serviceNodeId: string;
    readonly service: string;
    readonly consumerNodeId: string;
    /** Loader provider node, absent when Cordis itself owns the service at the root Context. */
    readonly providerNodeId?: string;
}
/** Read-only dependency graph projected from Loader, Fiber, and service state. */
export interface RuntimeGraphSnapshot {
    readonly nodes: readonly RuntimeGraphNode[];
    readonly edges: readonly RuntimeGraphEdge[];
    /** Live Fiber instances, hidden by default and expanded for Fiber diagnostics. */
    readonly fibers: readonly RuntimeGraphFiberNode[];
    /** Concrete scoped service implementations, materialized by the client only in focus mode. */
    readonly services: readonly RuntimeGraphServiceNode[];
    readonly serviceRelations: readonly RuntimeGraphServiceRelation[];
}
/** Process-lifetime Cordis and Agent counters for the Runtime Overview tab. */
export interface RuntimeOverviewSnapshot {
    readonly status: 'running';
    readonly uptimeMs: number;
    /** Root Context plus one tracked Context for each live plugin Fiber. */
    readonly contexts: number;
    /** Distinct plugin runtimes currently registered with Cordis. */
    readonly plugins: number;
    readonly fibers: number;
    readonly turns: number;
    readonly active: number;
    readonly effects: number;
    readonly events: number;
    readonly errors: number;
    /** Configured Loader entries, including entries without a mounted Fiber. */
    readonly loaderBreakdown: RuntimeCollectionOverview;
    /** Currently registered live Fiber instances. */
    readonly fiberBreakdown: RuntimeCollectionOverview;
    /** Distinct registered service names, classified by their best provider Fiber. */
    readonly serviceBreakdown: RuntimeServiceOverview;
}
/** Instrumentation that the current Host can prove and safely expose. */
export interface RuntimeExplorerCapabilities {
    readonly fiberInstances: boolean;
    readonly ownershipEdges: boolean;
    readonly scopes: boolean;
    readonly lifecycleTransitions: boolean;
    readonly turnPluginAttribution: boolean;
    readonly eventDispatch: 'none' | 'summary' | 'listener';
    readonly payloadCapture: false;
}
/** Explicit upper bounds applied to in-process diagnostic history. */
export interface RuntimeExplorerLimits {
    readonly transitionLimit: number;
    readonly traceEventLimit: number;
}
/** Lifecycle operation captured for one Cordis Effect. */
export type RuntimeEffectAction = 'created' | 'disposed';
/** One time bucket in a plugin's bounded Effect activity window. */
export interface RuntimeActivityPoint {
    readonly time: number;
    readonly current: number;
    readonly created: number;
    readonly disposed: number;
}
/** Privacy-safe lifecycle metadata for one Effect transition. */
export interface RuntimeEffectTransition {
    readonly id: string;
    readonly effectId: string;
    readonly action: RuntimeEffectAction;
    readonly time: number;
    readonly pluginId: string;
    readonly entryId: string;
    readonly moduleName: string;
    readonly pluginLabel: string;
    readonly fiberId?: string;
    readonly effectLabel: string;
    readonly durationMs?: number;
}
/** Current state and bounded-window activity for one Loader plugin entry. */
export interface RuntimePluginEffectActivity {
    readonly pluginId: string;
    readonly entryId: string;
    readonly moduleName: string;
    readonly label: string;
    readonly current: number;
    readonly created: number;
    readonly disposed: number;
    /** Net lifecycle change inside the window: `created - disposed`. */
    readonly delta: number;
    /** Lifecycle turnover inside the window: `created + disposed`. */
    readonly churn: number;
    readonly trend: readonly RuntimeActivityPoint[];
}
/** Process-local, bounded Effect lifecycle model used by Runtime Overview. */
export interface RuntimeEffectActivitySnapshot {
    readonly windowMs: number;
    /** Earliest time for which this gateway could observe transitions. */
    readonly availableSince: number;
    /** False when retained history overflowed inside the visible window. */
    readonly complete: boolean;
    readonly droppedTransitions: number;
    readonly current: number;
    readonly created: number;
    readonly disposed: number;
    readonly delta: number;
    readonly churn: number;
    readonly plugins: readonly RuntimePluginEffectActivity[];
    readonly recent: readonly RuntimeEffectTransition[];
}
/** Stable presentation lane for one captured session event. */
export type RuntimeTraceLane = 'user' | 'agent' | 'llm' | 'tool' | 'session';
/** Privacy-safe metadata for one committed session event. */
export interface RuntimeTraceEvent {
    /** Session id plus event sequence, unique within this process window. */
    readonly id: string;
    readonly sessionId: string;
    readonly type: string;
    readonly seq: number;
    readonly time: number;
    readonly lane: RuntimeTraceLane;
    /** Serialized payload size; the payload itself is never exposed. */
    readonly payloadChars: number;
    readonly turn?: number;
    readonly step?: number;
    readonly callId?: string;
    /** Tool name for tool/call; no arguments or result content is retained. */
    readonly name?: string;
    /** Terminal turn reason kind; no failure message is retained. */
    readonly outcome?: string;
}
/** Point-in-time graph plus the bounded in-process event trace. */
export interface RuntimeExplorerSnapshot {
    /** Version of this client-safe snapshot schema. */
    readonly schemaVersion: typeof RUNTIME_EXPLORER_SCHEMA_VERSION;
    /** Opaque identity shared by snapshots from one Harness process lifetime. */
    readonly bootId: string;
    /** Monotonic sequence allocated on the root Context for every snapshot read. */
    readonly snapshotSeq: number;
    /** Exact profile published by the CLI or Desktop Host, or null when the Host provides no profile fact. */
    readonly profile: string | null;
    readonly observedAt: number;
    readonly refreshIntervalMs: number;
    readonly overview: RuntimeOverviewSnapshot;
    readonly effectActivity: RuntimeEffectActivitySnapshot;
    readonly graph: RuntimeGraphSnapshot;
    readonly trace: readonly RuntimeTraceEvent[];
    readonly capabilities: RuntimeExplorerCapabilities;
    readonly limits: RuntimeExplorerLimits;
}
//# sourceMappingURL=types.d.ts.map