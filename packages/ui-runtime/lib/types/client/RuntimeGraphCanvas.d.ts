/** G6-backed force graph canvas for plugin-to-plugin Cordis relationships. */
import type { RuntimeFiberPhase, RuntimeGraphEdge, RuntimeGraphNode, RuntimeGraphServiceNode, RuntimeGraphServiceRelation, RuntimeGraphSnapshot } from '@deepseek-ai/dsh-api-remotes/client';
import { type RuntimeG6Focus } from './g6-graph.ts';
import type { RuntimeGraphRelations, RuntimeGraphSavedPositions } from './graph.ts';
import type { RuntimeLocaleKey } from './locales.ts';
import type { RuntimeCategoryFilter } from './store.ts';
type RuntimeGraphFiberNode = RuntimeGraphSnapshot['fibers'][number];
export interface RuntimeGraphCanvasProps {
    readonly nodes: readonly RuntimeGraphNode[];
    readonly edges: readonly RuntimeGraphEdge[];
    readonly fibers: readonly RuntimeGraphFiberNode[];
    readonly services: readonly RuntimeGraphServiceNode[];
    readonly serviceRelations: readonly RuntimeGraphServiceRelation[];
    readonly relations: RuntimeGraphRelations;
    readonly focus: RuntimeG6Focus | undefined;
    readonly savedPositions: RuntimeGraphSavedPositions;
    readonly graphLabel: string;
    readonly phaseLabel: (phase: RuntimeFiberPhase) => string;
    readonly onSelect: (focus: RuntimeG6Focus) => void;
    readonly onPositionsChange: (positions: RuntimeGraphSavedPositions) => void;
    readonly onResetPositions: () => void;
    readonly categoryFilter: RuntimeCategoryFilter;
    readonly onCategoryFilterChange: (category: RuntimeCategoryFilter) => void;
    readonly t: (key: RuntimeLocaleKey) => string;
}
export declare function RuntimeGraphCanvas({ nodes, edges, fibers, services, serviceRelations, relations, focus, savedPositions, graphLabel, phaseLabel, onSelect, onPositionsChange, onResetPositions, categoryFilter, onCategoryFilterChange, t, }: RuntimeGraphCanvasProps): import("react").JSX.Element;
export {};
//# sourceMappingURL=RuntimeGraphCanvas.d.ts.map