import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/** G6-backed force graph canvas for plugin-to-plugin Cordis relationships. */
import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowsPointingInIcon, MagnifyingGlassMinusIcon, MagnifyingGlassPlusIcon, } from '@heroicons/react/24/outline';
import { Tooltip } from '@deepseek-ai/dsh-client-ui-primitives';
import { buildRuntimeG6Data, renderRuntimeG6WithBudget, RUNTIME_G6_COLLISION_GAP, runtimeG6DisplayLabel, runtimeG6EdgeMetadata, runtimeG6NodeMetadata, runtimeG6TopologyKey, runtimeG6VisualKey, syncRuntimeG6Data, } from "./g6-graph.js";
import { loadG6 } from "./g6-runtime.js";
import css from './RuntimeExplorer.module.css';
const STATUS_COLORS = {
    pending: '#f3a62b',
    active: '#2bcf72',
    disposed: '#777c88',
    failed: '#ff5964',
    missing: '#ff5964',
};
const RELATION_COLORS = {
    selected: '#6395ff',
    dependency: '#6395ff',
    dependant: '#f3a62b',
    both: '#a88cff',
    related: '#5d626d',
};
const EDGE_LEGEND_COLORS = {
    injects: '#555a64',
    provides: '#22c55e',
    owns: '#5eead4',
    parent: '#5eead4',
    dependency: RELATION_COLORS.dependency,
    dependant: RELATION_COLORS.dependant,
    missing: STATUS_COLORS.missing,
};
const NODE_CATEGORY_COLORS = {
    core: { fill: '#3730a3', stroke: '#a5b4fc' },
    agent: { fill: '#6d28d9', stroke: '#c4b5fd' },
    model: { fill: '#1d4ed8', stroke: '#93c5fd' },
    tool: { fill: '#166534', stroke: '#4ade80' },
    session: { fill: '#b45309', stroke: '#fcd34d' },
    interface: { fill: '#be185d', stroke: '#f9a8d4' },
    extension: { fill: '#334155', stroke: '#94a3b8' },
    fiber: { fill: '#0f766e', stroke: '#5eead4' },
    service: { fill: '#155e75', stroke: '#67e8f9' },
    missing: { fill: '#991b1b', stroke: '#fca5a5' },
};
const NODE_CATEGORY_KEYS = [
    ['core', 'categoryCore'],
    ['agent', 'categoryAgent'],
    ['model', 'categoryModel'],
    ['tool', 'categoryTool'],
    ['session', 'categorySession'],
    ['interface', 'categoryInterface'],
    ['extension', 'categoryExtension'],
    ['fiber', 'fiberNode'],
    ['service', 'serviceNode'],
];
const NODE_CATEGORY_LOCALE_KEYS = {
    core: 'categoryCore',
    agent: 'categoryAgent',
    model: 'categoryModel',
    tool: 'categoryTool',
    session: 'categorySession',
    interface: 'categoryInterface',
    extension: 'categoryExtension',
    fiber: 'fiberNode',
    service: 'serviceNode',
    missing: 'missingService',
};
const EDGE_LEGEND_ITEMS = [
    ['injects', 'edgeInjects'],
    ['provides', 'edgeProvides'],
    ['owns', 'edgeOwns'],
    ['parent', 'edgeParent'],
    ['dependency', 'dependencies'],
    ['dependant', 'dependants'],
    ['missing', 'edgeMissing'],
];
const MIN_ZOOM = 0.3;
const MAX_ZOOM = 2.4;
const ZOOM_STEP = 1.2;
function nodeStyle(datum) {
    const metadata = runtimeG6NodeMetadata(datum);
    const statusColor = STATUS_COLORS[metadata.phase];
    const categoryColor = NODE_CATEGORY_COLORS[metadata.category];
    const relationColor = metadata.relation === undefined
        ? categoryColor.stroke
        : RELATION_COLORS[metadata.relation] ?? statusColor;
    const missing = metadata.kind === 'missing-service';
    const service = metadata.kind === 'service';
    const fiber = metadata.kind === 'fiber';
    return {
        size: metadata.size,
        fill: categoryColor.fill,
        stroke: relationColor,
        lineWidth: metadata.relation === 'selected' ? 3 : 1.5,
        lineDash: missing ? [5, 4] : undefined,
        cursor: missing ? 'default' : service || fiber ? 'pointer' : 'grab',
        shadowColor: metadata.relation === 'selected' ? 'rgba(99, 149, 255, 0.34)' : 'rgba(0, 0, 0, 0.28)',
        shadowBlur: metadata.relation === 'selected' ? 18 : 8,
        zIndex: 2,
        icon: false,
        label: true,
        labelText: runtimeG6DisplayLabel(metadata.label, service || fiber ? 10 : 13),
        labelPlacement: 'center',
        labelFill: '#ffffff',
        labelFontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif',
        labelFontSize: missing ? 9 : service || fiber ? 9 : metadata.size >= 96 ? 11 : 10,
        labelFontWeight: 600,
        labelLineHeight: missing ? 10 : 12,
        labelMaxLines: 3,
        labelMaxWidth: missing ? '72%' : '80%',
        labelWordWrap: false,
        labelTextOverflow: '...',
        labelBackground: false,
        badge: true,
        badges: [{
                text: '●',
                placement: 'right-top',
                offsetX: -18,
                offsetY: 18,
                background: false,
                fill: statusColor,
                fontSize: 8,
            }],
    };
}
function edgeStyle(datum) {
    const metadata = runtimeG6EdgeMetadata(datum);
    const color = metadata.relation === undefined
        ? '#555a64'
        : RELATION_COLORS[metadata.relation] ?? '#555a64';
    const missing = metadata.kind === 'missing';
    const provides = metadata.kind === 'provides';
    const ownership = metadata.kind === 'owns' || metadata.kind === 'parent';
    const lineDash = missing
        ? [6, 4]
        : metadata.relation === 'dependant'
            ? [8, 4]
            : metadata.relation === 'both'
                ? [2, 3]
                : undefined;
    return {
        stroke: missing ? EDGE_LEGEND_COLORS.missing : provides ? EDGE_LEGEND_COLORS.provides : ownership ? EDGE_LEGEND_COLORS.owns : color,
        zIndex: 0,
        lineWidth: metadata.relation === undefined ? 1 : 1.5,
        opacity: metadata.relation === undefined ? 0.38 : 0.74,
        lineDash,
        endArrow: true,
        endArrowFill: missing ? EDGE_LEGEND_COLORS.missing : provides ? EDGE_LEGEND_COLORS.provides : ownership ? EDGE_LEGEND_COLORS.owns : color,
        endArrowSize: 5,
        lineCap: 'round',
    };
}
function tooltipPill(text, className) {
    const pill = document.createElement('span');
    pill.className = className;
    pill.textContent = text;
    return pill;
}
function tooltipContent(items, t) {
    const element = document.createElement('div');
    element.className = 'dsh-insider-g6-tooltip';
    const item = items[0];
    if (item === undefined)
        return element;
    if (typeof item.source === 'string') {
        const metadata = runtimeG6EdgeMetadata(item);
        element.dataset.kind = metadata.kind;
        element.style.setProperty('--runtime-tooltip-accent', metadata.kind === 'missing' ? STATUS_COLORS.missing : '#6395ff');
        const accent = document.createElement('i');
        accent.className = 'dsh-insider-g6-tooltip__accent';
        accent.setAttribute('aria-hidden', 'true');
        const eyebrow = document.createElement('div');
        eyebrow.className = 'dsh-insider-g6-tooltip__eyebrow';
        eyebrow.append(tooltipPill(t('edgeTypes'), 'dsh-insider-g6-tooltip__category'));
        const title = document.createElement('strong');
        title.className = 'dsh-insider-g6-tooltip__title';
        title.textContent = metadata.kind === 'missing'
            ? t('edgeMissing')
            : metadata.kind === 'provides'
                ? t('edgeProvides')
                : metadata.kind === 'owns'
                    ? t('edgeOwns')
                    : metadata.kind === 'parent' ? t('edgeParent') : t('edgeInjects');
        const services = document.createElement('span');
        services.className = 'dsh-insider-g6-tooltip__module';
        services.textContent = metadata.services.join(' · ');
        element.append(accent, eyebrow, title, services);
        return element;
    }
    const metadata = runtimeG6NodeMetadata(item);
    const categoryColor = NODE_CATEGORY_COLORS[metadata.category];
    element.dataset.kind = metadata.kind;
    element.dataset.phase = metadata.phase;
    element.style.setProperty('--runtime-tooltip-accent', categoryColor.stroke);
    const accent = document.createElement('i');
    accent.className = 'dsh-insider-g6-tooltip__accent';
    accent.setAttribute('aria-hidden', 'true');
    const eyebrow = document.createElement('div');
    eyebrow.className = 'dsh-insider-g6-tooltip__eyebrow';
    eyebrow.append(tooltipPill(t(NODE_CATEGORY_LOCALE_KEYS[metadata.category]), 'dsh-insider-g6-tooltip__category'), tooltipPill(metadata.kind === 'missing-service' ? t('missingService') : t(metadata.phase), 'dsh-insider-g6-tooltip__phase'));
    const title = document.createElement('strong');
    title.className = 'dsh-insider-g6-tooltip__title';
    title.textContent = metadata.label;
    const moduleName = document.createElement('span');
    moduleName.className = 'dsh-insider-g6-tooltip__module';
    moduleName.textContent = metadata.kind === 'missing-service'
        ? metadata.service ?? metadata.label
        : metadata.kind === 'service'
            ? `${t('provider')}: ${metadata.providerEntryId ?? t('unavailable')}`
            : metadata.kind === 'fiber'
                ? `${t('ownerPlugin')}: ${metadata.ownerEntryId ?? t('unavailable')}`
                : metadata.moduleName ?? metadata.label;
    element.append(accent, eyebrow, title, moduleName);
    if (metadata.kind === 'plugin' || metadata.kind === 'fiber') {
        const stats = document.createElement('dl');
        stats.className = 'dsh-insider-g6-tooltip__stats';
        const values = [
            ['provides', metadata.provides.length],
            ['injects', metadata.injects.length],
            ['missing', metadata.missing.length],
        ];
        for (const [key, value] of values) {
            const stat = document.createElement('div');
            stat.className = 'dsh-insider-g6-tooltip__stat';
            const count = document.createElement('dd');
            count.textContent = String(value);
            const label = document.createElement('dt');
            label.textContent = t(key);
            stat.append(count, label);
            stats.append(stat);
        }
        element.append(stats);
    }
    else if (metadata.kind === 'service') {
        const stats = document.createElement('dl');
        stats.className = 'dsh-insider-g6-tooltip__stats';
        for (const [label, value] of [[t('providers'), 1], [t('consumers'), metadata.consumerCount ?? 0]]) {
            const stat = document.createElement('div');
            stat.className = 'dsh-insider-g6-tooltip__stat';
            const count = document.createElement('dd');
            count.textContent = String(value);
            const title = document.createElement('dt');
            title.textContent = label;
            stat.append(count, title);
            stats.append(stat);
        }
        element.append(stats);
    }
    return element;
}
function graphOptions(container, data, onDragFinish, t) {
    return {
        container,
        data,
        autoResize: true,
        padding: 76,
        zoomRange: [MIN_ZOOM, MAX_ZOOM],
        node: {
            type: 'circle',
            style: nodeStyle,
            state: {
                selected: {
                    lineWidth: 3.5,
                    stroke: RELATION_COLORS.selected,
                    shadowColor: 'rgba(99, 149, 255, 0.48)',
                    shadowBlur: 22,
                },
            },
            animation: false,
        },
        edge: {
            // G6 clips line endpoints against circle boundaries. Opaque nodes stay above
            // the edge layer so relationship lines never render through node bodies.
            type: 'line',
            style: edgeStyle,
            state: {},
            animation: false,
        },
        layout: {
            type: 'd3-force',
            alpha: 0.9,
            alphaMin: 0.08,
            alphaDecay: 0.12,
            alphaTarget: 0,
            velocityDecay: 0.5,
            link: { distance: 178, strength: 0.66 },
            manyBody: { strength: -340 },
            center: { strength: 0.045 },
            // Use G6's computed node size instead of reading the layout adapter's
            // wrapper datum. This keeps collision radii correct for large hubs.
            preventOverlap: true,
            nodeSpacing: RUNTIME_G6_COLLISION_GAP * 2,
            collideStrength: 1,
            collideIterations: 5,
        },
        behaviors: [
            { type: 'drag-canvas', key: 'drag-canvas' },
            { type: 'zoom-canvas', key: 'zoom-canvas', sensitivity: 1 },
            {
                // The force instance is deliberately released after the bounded initial
                // layout. Plain element dragging remains available after that release.
                type: 'drag-element', key: 'drag-element', animation: false, hideEdge: 'none',
                onFinish: (ids) => { onDragFinish(ids); },
            },
            { type: 'auto-adapt-label', key: 'auto-adapt-label' },
            { type: 'optimize-viewport-transform', key: 'optimize-viewport-transform', debounce: 120 },
        ],
        plugins: [
            {
                type: 'tooltip', key: 'runtime-tooltip', trigger: 'hover',
                style: {
                    '.tooltip': {
                        padding: 0,
                        backgroundColor: 'transparent',
                        boxShadow: 'none',
                        borderRadius: '12px',
                        color: 'inherit',
                        fontFamily: 'inherit',
                    },
                },
                getContent: (_event, items) => tooltipContent(items, t),
                onOpenChange: () => undefined,
            },
        ],
    };
}
function runtimeG6Layers(graph) {
    return Object.values(graph.getCanvas().getLayers());
}
function renderRuntimeG6Frame(graph) {
    for (const layer of runtimeG6Layers(graph))
        layer.render();
}
function suspendRuntimeG6AutoRendering(graph) {
    const canvas = graph.getCanvas();
    const layers = Object.keys(canvas.getLayers());
    for (const layer of layers) {
        canvas.getRenderer(layer).setConfig({
            enableAutoRendering: false,
            enableDirtyCheck: true,
            enableRenderingOptimization: true,
        });
    }
    // @antv/g starts a perpetual requestAnimationFrame loop before G6 exposes the
    // canvas. Disabling the renderer option prevents future loops, while cancelling
    // the already-scheduled frame makes a settled graph genuinely idle.
    for (const layer of runtimeG6Layers(graph)) {
        if (layer.frameId !== undefined) {
            layer.cancelAnimationFrame(layer.frameId);
            layer.frameId = undefined;
        }
    }
}
export function RuntimeGraphCanvas({ nodes, edges, fibers, services, serviceRelations, relations, focus, savedPositions, graphLabel, phaseLabel, onSelect, onPositionsChange, onResetPositions, categoryFilter, onCategoryFilterChange, t, }) {
    const containerRef = useRef(null);
    const graphRef = useRef();
    const topologyRef = useRef();
    const visualRef = useRef();
    const focusKey = focus === undefined ? undefined : `${focus.kind}:${focus.id}`;
    const selectedRef = useRef(focusKey);
    const callbacksRef = useRef({ onSelect, onPositionsChange });
    const dataRef = useRef();
    const nodesRef = useRef(nodes);
    const savedPositionsRef = useRef(savedPositions);
    const [zoom, setZoom] = useState(1);
    const [rendererFailed, setRendererFailed] = useState(false);
    callbacksRef.current = { onSelect, onPositionsChange };
    nodesRef.current = nodes;
    savedPositionsRef.current = savedPositions;
    const data = useMemo(() => buildRuntimeG6Data(nodes, edges, fibers, services, serviceRelations, relations, focus, savedPositions, categoryFilter === 'service'), [categoryFilter, edges, fibers, focus, nodes, relations, savedPositions, serviceRelations, services]);
    dataRef.current = data;
    useEffect(() => {
        const container = containerRef.current;
        if (container === null)
            return;
        let disposed = false;
        const handleDragFinish = (ids) => {
            const graph = graphRef.current;
            if (graph === undefined)
                return;
            const next = { ...savedPositionsRef.current };
            for (const id of ids) {
                const node = nodesRef.current.find(item => item.id === id);
                if (node === undefined)
                    continue;
                const position = graph.getElementPosition(id);
                const x = position[0] ?? 0;
                const y = position[1] ?? 0;
                next[node.logicalKey] = { x, y, pinned: true };
            }
            callbacksRef.current.onPositionsChange(next);
        };
        void loadG6().then(async ({ Graph: G6Graph }) => {
            if (disposed || dataRef.current === undefined)
                return;
            const graph = new G6Graph(graphOptions(container, dataRef.current, handleDragFinish, t));
            graphRef.current = graph;
            graph.on('node:click', (event) => {
                const id = String(event.target.id);
                if (id.startsWith('missing:'))
                    return;
                if (id.startsWith('service:')) {
                    callbacksRef.current.onSelect({ kind: 'service', id: id.slice('service:'.length) });
                    return;
                }
                if (id.startsWith('fiber:')) {
                    callbacksRef.current.onSelect({ kind: 'fiber', id: id.slice('fiber:'.length) });
                    return;
                }
                callbacksRef.current.onSelect({ kind: 'plugin', id });
            });
            const hideRuntimeTooltip = () => {
                const tooltip = graph.getPluginInstance('runtime-tooltip');
                tooltip?.hide?.();
            };
            graph.on('node:pointerleave', hideRuntimeTooltip);
            graph.on('edge:pointerleave', hideRuntimeTooltip);
            graph.on('canvas:pointerleave', hideRuntimeTooltip);
            graph.on('aftertransform', () => {
                if (disposed || graphRef.current !== graph)
                    return;
                renderRuntimeG6Frame(graph);
                // G6 can emit while its viewport controller is still being initialized.
                try {
                    setZoom(graph.getZoom());
                }
                catch { /* wait for the next transform */ }
            });
            graph.on('node:drag', () => { renderRuntimeG6Frame(graph); });
            graph.on('node:dragend', () => { renderRuntimeG6Frame(graph); });
            try {
                await renderRuntimeG6WithBudget(graph);
                if (disposed)
                    return;
                topologyRef.current = runtimeG6TopologyKey(dataRef.current);
                visualRef.current = runtimeG6VisualKey(dataRef.current);
                await graph.fitView({ when: 'always', direction: 'both' }, false);
                suspendRuntimeG6AutoRendering(graph);
                renderRuntimeG6Frame(graph);
                if (!disposed && graphRef.current === graph)
                    setZoom(graph.getZoom());
            }
            catch {
                if (!disposed)
                    setRendererFailed(true);
            }
        }).catch(() => { if (!disposed)
            setRendererFailed(true); });
        return () => {
            disposed = true;
            graphRef.current?.destroy();
            graphRef.current = undefined;
            topologyRef.current = undefined;
            visualRef.current = undefined;
        };
    }, []);
    useEffect(() => {
        const graph = graphRef.current;
        if (graph === undefined)
            return;
        let disposed = false;
        const topology = runtimeG6TopologyKey(data);
        const selectionChanged = selectedRef.current !== focusKey;
        selectedRef.current = focusKey;
        void syncRuntimeG6Data(graph, data, topologyRef.current, visualRef.current).then(async () => {
            if (disposed)
                return;
            topologyRef.current = topology;
            visualRef.current = runtimeG6VisualKey(data);
            renderRuntimeG6Frame(graph);
            if (selectionChanged && focusKey !== undefined) {
                // The inspector is mounted in the same commit and narrows the graph
                // column. Synchronize G6's canvas dimensions before calculating the
                // first focused viewport so it does not center against the old width.
                graph.resize();
                // syncRuntimeG6Data already runs the configured layout exactly once for
                // structural changes. Reusing this Graph instance avoids a second force
                // simulation and preserves stable coordinates for lifecycle-only draws.
                await graph.fitView({ when: 'always', direction: 'both' }, { duration: 220, easing: 'ease-out' });
                // The inspector changes the canvas width in the same commit. Let its
                // ResizeObserver settle, then fit once more so the selected hub and
                // newly materialized Service satellites remain fully visible.
                await new Promise(resolve => window.setTimeout(resolve, 180));
                if (disposed)
                    return;
                graph.resize();
                await graph.fitView({ when: 'always', direction: 'both' }, { duration: 180, easing: 'ease-out' });
                if (!disposed) {
                    renderRuntimeG6Frame(graph);
                    setZoom(graph.getZoom());
                }
            }
        }).catch(() => { if (!disposed)
            setRendererFailed(true); });
        return () => { disposed = true; };
    }, [data, focusKey]);
    const zoomTo = async (next) => {
        const graph = graphRef.current;
        if (graph === undefined)
            return;
        await graph.zoomTo(Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, next)), { duration: 160, easing: 'ease-out' });
        renderRuntimeG6Frame(graph);
        setZoom(graph.getZoom());
    };
    const fitView = async () => {
        const graph = graphRef.current;
        if (graph === undefined)
            return;
        graph.resize();
        await graph.fitView({ when: 'always', direction: 'both' }, { duration: 220, easing: 'ease-out' });
        renderRuntimeG6Frame(graph);
        setZoom(graph.getZoom());
    };
    const reset = () => {
        onResetPositions();
    };
    return (_jsxs("div", { className: css.graphCanvasShell, children: [_jsx("div", { ref: containerRef, className: css.graphCanvas, role: "img", "aria-label": graphLabel }), rendererFailed && _jsx("div", { className: css.graphRendererError, children: t('graphRendererFailed') }), _jsx("div", { className: css.nodeTypeLegend, "aria-label": t('pluginTypes'), children: NODE_CATEGORY_KEYS.map(([category, key]) => (_jsxs("button", { type: "button", "aria-pressed": categoryFilter === category, style: { '--runtime-node-color': NODE_CATEGORY_COLORS[category].stroke }, onClick: () => { onCategoryFilterChange(categoryFilter === category ? 'all' : category); }, children: [_jsx("i", { "aria-hidden": true }), t(key)] }, category))) }), _jsx("div", { className: css.edgeTypeLegend, "aria-label": t('edgeTypes'), children: EDGE_LEGEND_ITEMS.map(([kind, key]) => (_jsxs("span", { "data-edge-kind": kind, style: { '--runtime-edge-color': EDGE_LEGEND_COLORS[kind] }, children: [_jsx("i", { "aria-hidden": true }), t(key)] }, kind))) }), _jsx("ul", { className: css.graphA11yList, "aria-label": graphLabel, children: data.nodes.flatMap((node) => {
                    const metadata = runtimeG6NodeMetadata(node);
                    if (metadata.kind === 'missing-service')
                        return [];
                    const selection = metadata.kind === 'service'
                        ? { kind: 'service', id: String(node.id).slice('service:'.length) }
                        : metadata.kind === 'fiber'
                            ? { kind: 'fiber', id: String(node.id).slice('fiber:'.length) }
                            : { kind: 'plugin', id: String(node.id) };
                    return [_jsx("li", { children: _jsxs("button", { type: "button", onClick: () => { onSelect(selection); }, children: [metadata.label, ", ", phaseLabel(metadata.phase)] }) }, String(node.id))];
                }) }), _jsxs("div", { className: css.zoomControls, role: "group", "aria-label": t('zoomControls'), children: [_jsx(Tooltip, { label: t('zoomOut'), side: "top", delayMs: 400, children: _jsx("button", { type: "button", "aria-label": t('zoomOut'), disabled: zoom <= MIN_ZOOM + 0.01, onClick: () => { void zoomTo(zoom / ZOOM_STEP); }, children: _jsx(MagnifyingGlassMinusIcon, { "aria-hidden": "true", width: 18, height: 18 }) }) }), _jsxs("output", { "aria-label": t('zoomLevel'), "aria-live": "polite", children: [Math.round(zoom * 100), "%"] }), _jsx(Tooltip, { label: t('zoomIn'), side: "top", delayMs: 400, children: _jsx("button", { type: "button", "aria-label": t('zoomIn'), disabled: zoom >= MAX_ZOOM - 0.01, onClick: () => { void zoomTo(zoom * ZOOM_STEP); }, children: _jsx(MagnifyingGlassPlusIcon, { "aria-hidden": "true", width: 18, height: 18 }) }) }), _jsx(Tooltip, { label: t('fitView'), side: "top", delayMs: 400, children: _jsx("button", { type: "button", "aria-label": t('fitView'), onClick: () => { void fitView(); }, children: _jsx(ArrowsPointingInIcon, { "aria-hidden": "true", width: 18, height: 18 }) }) }), _jsx("button", { type: "button", onClick: reset, children: t('resetZoom') })] })] }));
}
//# sourceMappingURL=RuntimeGraphCanvas.js.map