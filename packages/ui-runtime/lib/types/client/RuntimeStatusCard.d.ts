/** Shared lifecycle summary and Recharts Type by Status card. */
import type { RuntimeCollectionOverview, RuntimeOverviewStatus, RuntimePluginCategory, RuntimeServiceOverview } from '@deepseek-ai/dsh-api-remotes/client';
import type { RuntimeLocaleKey } from './locales.ts';
type Translate = (key: RuntimeLocaleKey) => string;
export declare function RuntimeStatusCard({ kind, title, unit, chartTitle, breakdown, t, onInspect, }: {
    kind: 'plugin' | 'fiber' | 'service';
    title: string;
    unit: string;
    chartTitle: string;
    breakdown: RuntimeCollectionOverview | RuntimeServiceOverview;
    t: Translate;
    onInspect: ((kind: 'plugin' | 'fiber' | 'service', category: RuntimePluginCategory | undefined, status: RuntimeOverviewStatus) => void) | undefined;
}): import("react").JSX.Element;
export {};
//# sourceMappingURL=RuntimeStatusCard.d.ts.map