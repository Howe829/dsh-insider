/** Pure G6 projection and update policy for the Runtime Explorer graph canvas. */
import type { EdgeData, GraphData, NodeData } from '@antv/g6';
import type { RuntimeGraphEdge, RuntimeGraphNode, RuntimeGraphServiceNode, RuntimeGraphServiceRelation, RuntimeGraphSnapshot } from '@deepseek-ai/dsh-api-remotes/client';
import type { RuntimeGraphRelations, RuntimeGraphSavedPositions } from './graph.ts';
import { runtimeLifecycleStatus } from './graph.ts';
type RuntimeGraphFiberNode = RuntimeGraphSnapshot['fibers'][number];
export type RuntimeG6NodeKind = 'plugin' | 'fiber' | 'service' | 'missing-service';
/** Visual role inferred from the plugin package name and its runtime label. */
export type RuntimeG6NodeCategory = 'core' | 'agent' | 'model' | 'tool' | 'session' | 'interface' | 'extension' | 'fiber' | 'service' | 'missing';
export interface RuntimeG6NodeMetadata {
    readonly kind: RuntimeG6NodeKind;
    readonly label: string;
    readonly logicalKey?: string;
    readonly moduleName?: string;
    readonly phase: ReturnType<typeof runtimeLifecycleStatus> | 'missing';
    readonly category: RuntimeG6NodeCategory;
    readonly relation?: string;
    readonly size: number;
    readonly pinned: boolean;
    readonly provides: readonly string[];
    readonly injects: readonly string[];
    readonly missing: readonly string[];
    readonly effectCount: number;
    readonly service?: string;
    readonly providerNodeId?: string;
    readonly providerEntryId?: string;
    readonly ownerNodeId?: string;
    readonly ownerEntryId?: string;
    readonly parentFiberId?: string;
    readonly fiberUid?: number;
    readonly entryRoot?: boolean;
    readonly consumerCount?: number;
    readonly order?: number;
}
export interface RuntimeG6EdgeMetadata {
    readonly kind: 'injects' | 'provides' | 'owns' | 'parent' | 'missing';
    readonly relation?: string;
    readonly services: readonly string[];
}
export interface RuntimeG6GraphData extends GraphData {
    readonly nodes: NodeData[];
    readonly edges: EdgeData[];
}
/** The graph focus can be a Loader plugin, Fiber instance, or exact scoped Service implementation. */
export type RuntimeG6Focus = {
    readonly kind: 'plugin';
    readonly id: string;
} | {
    readonly kind: 'fiber';
    readonly id: string;
} | {
    readonly kind: 'service';
    readonly id: string;
};
export declare const RUNTIME_G6_COLLISION_GAP = 24;
/**
 * Infer a stable, explainable visual category from DSH package conventions.
 * The fallback deliberately stays neutral for third-party plugins.
 */
export declare function runtimeG6NodeCategory(moduleName: string, label: string): Exclude<RuntimeG6NodeCategory, 'fiber' | 'service' | 'missing'>;
/** Keep the exact plugin name while preferring semantic line breaks inside circles. */
export declare function runtimeG6DisplayLabel(label: string, maxLineLength?: number): string;
/** Scale hubs without allowing high-degree plugins to dominate the canvas. */
export declare function runtimeG6NodeSize(degree: number, selected?: boolean, label?: string): number;
/** Collision radius passed to G6, including label-safe whitespace around each circle. */
export declare function runtimeG6CollisionRadius(size: number): number;
/** Safely read the metadata placed on a G6 node datum by this adapter. */
export declare function runtimeG6NodeMetadata(node: NodeData): RuntimeG6NodeMetadata;
/** Safely read the metadata placed on a G6 edge datum by this adapter. */
export declare function runtimeG6EdgeMetadata(edge: EdgeData): RuntimeG6EdgeMetadata;
/**
 * Project the Host graph into G6 data while keeping product state out of the renderer.
 * Missing Cordis providers become explicit satellite nodes only around the selected plugin.
 */
export declare function buildRuntimeG6Data(nodes: readonly RuntimeGraphNode[], edges: readonly RuntimeGraphEdge[], fibers: readonly RuntimeGraphFiberNode[], services: readonly RuntimeGraphServiceNode[], serviceRelations: readonly RuntimeGraphServiceRelation[], relations: RuntimeGraphRelations, focus: RuntimeG6Focus | undefined, savedPositions: RuntimeGraphSavedPositions, showAllServices?: boolean): RuntimeG6GraphData;
/** Count concrete scoped Service nodes currently materialized in focus mode. */
export declare function runtimeG6VisibleServiceCount(data: RuntimeG6GraphData): number;
/** Topology identity used to distinguish live status refreshes from structural changes. */
export declare function runtimeG6TopologyKey(data: RuntimeG6GraphData): string;
/** Renderer-visible identity; tooltip-only metadata does not require a canvas redraw. */
export declare function runtimeG6VisualKey(data: RuntimeG6GraphData): string;
export interface RuntimeG6GraphPort {
    setData: (data: GraphData) => void;
    render: () => unknown | Promise<unknown>;
    draw: () => unknown | Promise<unknown>;
    stopLayout?: () => void;
    getElementPosition?: (id: string) => ArrayLike<number>;
}
export declare const RUNTIME_G6_LAYOUT_BUDGET_MS = 800;
/** Bound a force layout even when the renderer's completion promise never settles. */
export declare function renderRuntimeG6WithBudget(graph: RuntimeG6GraphPort): Promise<void>;
/**
 * Structural changes run layout; lifecycle-only refreshes draw in place so the viewport never jumps.
 */
export declare function syncRuntimeG6Data(graph: RuntimeG6GraphPort, data: RuntimeG6GraphData, previousTopology: string | undefined, previousVisual: string | undefined): Promise<'render' | 'draw' | 'data'>;
export {};
//# sourceMappingURL=g6-graph.d.ts.map