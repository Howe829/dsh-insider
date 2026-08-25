import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import css from './RuntimeExplorer.module.css';
import { RuntimeStatusCard } from "./RuntimeStatusCard.js";
import { RuntimeActivity } from "./RuntimeActivity.js";
const METRICS = [
    'effects', 'turns', 'events',
];
/** Format a process duration as an unambiguous hours:minutes:seconds clock. */
export function formatRuntimeUptime(uptimeMs) {
    const totalSeconds = Math.max(0, Math.floor(uptimeMs / 1000));
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    return [hours, minutes, seconds].map(value => String(value).padStart(2, '0')).join(':');
}
export function RuntimeOverview({ overview, activity, t, onInspect, }) {
    const values = {
        turns: overview.turns,
        effects: overview.effects,
        events: overview.events,
    };
    const fiberContexts = Math.max(0, overview.contexts - 1);
    return (_jsxs("section", { className: css.overviewView, "aria-labelledby": "runtime-overview-title", children: [_jsxs("div", { className: css.overviewHeading, children: [_jsxs("div", { children: [_jsx("span", { className: css.overviewEyebrow, children: "DSH \u00B7 Cordis" }), _jsx("h2", { id: "runtime-overview-title", children: t('overviewTitle') }), _jsx("p", { children: t('overviewDescription') })] }), _jsxs("dl", { className: css.overviewStatus, "aria-label": t('runtimeStatus'), children: [_jsxs("div", { "data-status": "running", children: [_jsx("dt", { children: t('runtimeStatus') }), _jsxs("dd", { children: [_jsx("i", { "aria-hidden": true }), t('running')] })] }), _jsxs("div", { children: [_jsx("dt", { children: t('uptime') }), _jsx("dd", { children: _jsx("time", { children: formatRuntimeUptime(overview.uptimeMs) }) })] })] })] }), _jsxs("dl", { className: css.overviewMetrics, "aria-label": t('overviewMetrics'), children: [_jsxs("div", { className: `${css.overviewMetricCard} ${css.overviewContextMetric}`, "data-metric": "contexts", children: [_jsx("dt", { children: t('contexts') }), _jsx("dd", { className: css.overviewContextTotal, children: overview.contexts.toLocaleString() }), _jsx("dd", { className: css.overviewContextMetricBody, children: _jsxs("dl", { className: css.overviewContextBreakdown, "aria-label": t('contextComposition'), children: [_jsxs("div", { children: [_jsx("dt", { children: t('rootContext') }), _jsx("dd", { children: "1" })] }), _jsxs("div", { children: [_jsx("dt", { children: t('fiberContexts') }), _jsx("dd", { children: fiberContexts.toLocaleString() })] })] }) })] }), METRICS.map(key => (_jsxs("div", { className: css.overviewMetricCard, "data-metric": key, children: [_jsx("dt", { children: t(key) }), _jsx("dd", { children: values[key].toLocaleString() })] }, key)))] }), _jsx(RuntimeActivity, { activity: activity, t: t }), _jsxs("div", { className: css.overviewDistributions, children: [_jsx(RuntimeStatusCard, { kind: "plugin", title: t('loaderTitle'), unit: t('pluginsUnit'), chartTitle: t('pluginsByType'), breakdown: overview.loaderBreakdown, t: t, onInspect: onInspect }), _jsx(RuntimeStatusCard, { kind: "fiber", title: t('fibers'), unit: t('fibersUnit'), chartTitle: t('fibersByPluginType'), breakdown: overview.fiberBreakdown, t: t, onInspect: onInspect }), _jsx(RuntimeStatusCard, { kind: "service", title: t('servicesTitle'), unit: t('serviceNamesUnit'), chartTitle: t('servicesByProviderType'), breakdown: overview.serviceBreakdown, t: t, onInspect: onInspect })] })] }));
}
//# sourceMappingURL=RuntimeOverview.js.map