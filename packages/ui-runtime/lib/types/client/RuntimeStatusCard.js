import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { CheckCircleIcon, ClockIcon, ExclamationTriangleIcon, MinusCircleIcon, } from '@heroicons/react/24/outline';
import { Bar, BarChart, ResponsiveContainer, Tooltip as RechartsTooltip, XAxis, YAxis, } from 'recharts';
import css from './RuntimeExplorer.module.css';
const STATUS_ITEMS = [
    { key: 'pending', label: 'pending', Icon: ClockIcon, color: 'var(--dsw-alias-state-warn-primary)' },
    { key: 'active', label: 'active', Icon: CheckCircleIcon, color: 'var(--dsw-alias-state-success-primary)' },
    { key: 'disposed', label: 'disposed', Icon: MinusCircleIcon, color: 'var(--dsw-alias-label-tertiary)' },
    { key: 'failed', label: 'failed', Icon: ExclamationTriangleIcon, color: 'var(--dsw-alias-state-error-primary)' },
];
const PROVIDER_STATUS_ITEMS = STATUS_ITEMS.filter(status => status.key !== 'disposed');
const CATEGORY_LABELS = {
    core: 'categoryCore',
    agent: 'categoryAgent',
    model: 'categoryModel',
    tool: 'categoryTool',
    session: 'categorySession',
    interface: 'categoryInterface',
    extension: 'categoryExtension',
};
function RuntimeStatusTooltip({ active, payload, t, statusItems = STATUS_ITEMS, }) {
    if (active !== true || payload === undefined || payload.length === 0)
        return null;
    const row = payload[0]?.payload;
    if (row === undefined)
        return null;
    return (_jsxs("div", { className: css.overviewChartTooltip, role: "status", children: [_jsx("strong", { children: row.label }), _jsxs("span", { children: [row.total.toLocaleString(), " ", t('items')] }), _jsx("dl", { children: statusItems.map(status => (_jsxs("div", { "data-status": status.key, children: [_jsxs("dt", { children: [_jsx("i", { style: { background: status.color }, "aria-hidden": true }), t(status.label)] }), _jsx("dd", { children: row[status.key].toLocaleString() })] }, status.key))) })] }));
}
export function RuntimeStatusCard({ kind, title, unit, chartTitle, breakdown, t, onInspect, }) {
    const rows = breakdown.byType.map(row => ({
        ...row,
        label: t(CATEGORY_LABELS[row.category]),
    }));
    const serviceBreakdown = 'implementations' in breakdown ? breakdown : undefined;
    const statusItems = serviceBreakdown === undefined ? STATUS_ITEMS : PROVIDER_STATUS_ITEMS;
    const chartHeight = Math.max(36, rows.length * 30);
    return (_jsxs("article", { className: css.overviewDistributionCard, "aria-label": title, children: [_jsxs("header", { children: [_jsx("h3", { children: title }), _jsxs("p", { children: [_jsx("strong", { children: breakdown.total.toLocaleString() }), " ", unit] })] }), serviceBreakdown !== undefined && _jsx("h4", { className: css.overviewProviderStatusTitle, children: t('providerFiberStatus') }), _jsx("ul", { className: css.overviewStatusSummary, "data-columns": statusItems.length, "aria-label": `${title} ${serviceBreakdown === undefined ? t('statusSummary') : t('providerFiberStatus')}`, children: statusItems.map(({ key, label, Icon, color }) => (_jsx("li", { "data-status": key, children: _jsxs("button", { type: "button", onClick: () => { onInspect?.(kind, undefined, key); }, children: [_jsxs("span", { children: [_jsx(Icon, { width: 15, color: color, "aria-hidden": true }), t(label)] }), _jsx("strong", { children: breakdown.statuses[key].toLocaleString() })] }) }, key))) }), _jsxs("section", { className: css.overviewChartSection, "aria-label": chartTitle, children: [_jsx("h4", { children: chartTitle }), rows.length === 0 ? (_jsx("p", { className: css.overviewChartEmpty, children: t('noRuntimeData') })) : (_jsxs(_Fragment, { children: [_jsxs("div", { className: css.overviewChartLayout, style: { height: chartHeight }, children: [_jsx("div", { className: css.overviewChartLabels, "aria-hidden": true, children: rows.map(row => _jsx("span", { children: row.label }, row.category)) }), _jsx(ResponsiveContainer, { width: "100%", height: "100%", minWidth: 0, children: _jsxs(BarChart, { accessibilityLayer: true, data: rows, layout: "vertical", margin: { top: 2, right: 2, bottom: 2, left: 2 }, barCategoryGap: "34%", children: [_jsx(XAxis, { type: "number", hide: true, domain: [0, 'dataMax'] }), _jsx(YAxis, { type: "category", hide: true, dataKey: "category" }), _jsx(RechartsTooltip, { cursor: { fill: 'var(--dsw-alias-bg-layer-2)' }, content: props => (_jsx(RuntimeStatusTooltip, { active: props.active, payload: props.payload, t: t, statusItems: statusItems })) }), statusItems.map(status => (_jsx(Bar, { dataKey: status.key, name: t(status.label), stackId: "status", fill: status.color, isAnimationActive: false, onClick: (item) => {
                                                        const row = item.payload;
                                                        if (row !== undefined)
                                                            onInspect?.(kind, row.category, status.key);
                                                    } }, status.key)))] }) }), _jsx("div", { className: css.overviewChartTotals, "aria-hidden": true, children: rows.map(row => _jsx("span", { children: row.total.toLocaleString() }, row.category)) })] }), _jsx("ul", { className: css.overviewChartLegend, "aria-label": t('statusLegend'), children: statusItems.map(status => (_jsxs("li", { children: [_jsx("i", { style: { background: status.color }, "aria-hidden": true }), t(status.label)] }, status.key))) })] }))] })] }));
}
//# sourceMappingURL=RuntimeStatusCard.js.map