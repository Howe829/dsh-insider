import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
/** Runtime graph, request trace, filters, and metadata inspector. */
import { useEffect, useMemo, useRef, useState } from 'react';
import clsx from 'clsx';
import { ArrowLeftIcon, ChevronRightIcon, Squares2X2Icon } from '@heroicons/react/24/outline';
import { IconBranchOutline16, IconCloseOutline16, IconCordisPluginOutline14, IconDataOutline16, IconRefreshOutline16, IconSearchOutline16, Tooltip, } from '@deepseek-ai/dsh-client-ui-primitives';
import { focusRuntimeGraph, runtimeGraphRelations, runtimeLifecycleStatus } from "./graph.js";
import { RuntimeGraphCanvas } from "./RuntimeGraphCanvas.js";
import { RuntimeOverview } from "./RuntimeOverview.js";
import { runtimeG6NodeCategory } from "./g6-graph.js";
import { pruneGraphLayout, readGraphPresentation, writeGraphLayout } from "./graph-persistence.js";
import { filterRuntimeTrace, groupRuntimeTrace } from "./trace.js";
import css from './RuntimeExplorer.module.css';
const STATUS_LABELS = {
    pending: 'pending',
    active: 'active',
    disposed: 'disposed',
    failed: 'failed',
};
const CATEGORY_LABELS = {
    core: 'categoryCore',
    agent: 'categoryAgent',
    model: 'categoryModel',
    tool: 'categoryTool',
    session: 'categorySession',
    interface: 'categoryInterface',
    extension: 'categoryExtension',
    fiber: 'fiberNode',
    service: 'serviceNode',
};
const LANE_LABELS = {
    user: 'laneUser',
    agent: 'laneAgent',
    llm: 'laneLlm',
    tool: 'laneTool',
    session: 'laneSession',
};
const TURN_STATUS_LABELS = {
    running: 'turnRunning',
    completed: 'turnCompleted',
    failed: 'turnFailed',
    stopped: 'turnStopped',
    incomplete: 'turnIncomplete',
};
function statusKey(phase) {
    return runtimeLifecycleStatus(phase);
}
function includesNode(node, query) {
    if (query === '')
        return true;
    const text = [node.label, node.moduleName, node.entryId, ...node.provides, ...node.injects].join('\n').toLowerCase();
    return text.includes(query);
}
function includesService(service, query) {
    if (query === '')
        return true;
    return [service.name, service.id, service.providerEntryId, service.providerFiberId]
        .filter(value => value !== undefined)
        .join('\n').toLowerCase().includes(query);
}
function includesFiber(fiber, query) {
    if (query === '')
        return true;
    return [
        fiber.name, fiber.moduleName, fiber.id, fiber.ownerEntryId, fiber.parentFiberId,
        ...fiber.provides, ...fiber.injects, ...fiber.missing,
    ].filter(value => value !== undefined).join('\n').toLowerCase().includes(query);
}
function includesEvent(event, query) {
    if (query === '')
        return true;
    return [event.type, event.sessionId, event.name, event.callId, event.outcome]
        .filter(value => value !== undefined)
        .join('\n').toLowerCase().includes(query);
}
function shortSessionId(sessionId) {
    if (sessionId.length <= 18)
        return sessionId;
    return `${sessionId.slice(0, 10)}…${sessionId.slice(-4)}`;
}
function formatDuration(durationMs) {
    if (durationMs < 1000)
        return `${durationMs} ms`;
    if (durationMs < 10_000)
        return `${(durationMs / 1000).toFixed(1)} s`;
    return `${Math.round(durationMs / 1000)} s`;
}
function graphEdgesFor(nodes, edges) {
    const ids = new Set(nodes.map(node => node.id));
    return edges.filter(edge => ids.has(edge.source) && ids.has(edge.target));
}
function MetadataList({ values, empty }) {
    if (values.length === 0)
        return _jsx("span", { className: css.emptyValue, children: empty });
    return _jsx("div", { className: css.chips, children: values.map(value => _jsx("code", { children: value }, value)) });
}
function GraphView({ nodes, allNodes, edges, allEdges, fibers, allFibers, services, serviceRelations, totalNodes, totalFibers, totalServices, graphFocus, focusLabel, onSelect, onClearSelection, categoryFilter, onCategoryFilterChange, empty, graphLabel, phaseLabel, profile, t, }) {
    const initialPresentation = useRef(readGraphPresentation(profile));
    const [savedPositions, setSavedPositions] = useState(initialPresentation.current.positions);
    const [neighbourDepth, setNeighbourDepth] = useState(initialPresentation.current.neighbourDepth);
    const [canvasRevision, setCanvasRevision] = useState(0);
    const layoutScopeKey = allNodes.map(node => node.logicalKey).sort().join('|');
    const selectedPluginId = graphFocus?.kind === 'plugin' ? graphFocus.id : undefined;
    const selectedFiberId = graphFocus?.kind === 'fiber' ? graphFocus.id : undefined;
    const selectedServiceId = graphFocus?.kind === 'service' ? graphFocus.id : undefined;
    const selectedFiberOwnerId = selectedFiberId === undefined
        ? undefined
        : allFibers.find(fiber => fiber.id === selectedFiberId)?.ownerNodeId;
    const selectedService = selectedServiceId === undefined
        ? undefined
        : services.find(service => service.id === selectedServiceId);
    const selectedServiceRelations = useMemo(() => selectedServiceId === undefined
        ? []
        : serviceRelations.filter(relation => relation.serviceNodeId === selectedServiceId), [selectedServiceId, serviceRelations]);
    const focus = useMemo(() => {
        if (selectedFiberId !== undefined) {
            const ownerNodes = selectedFiberOwnerId === undefined
                ? []
                : allNodes.filter(node => node.id === selectedFiberOwnerId);
            return { nodes: ownerNodes, edges: [] };
        }
        if (selectedService === undefined) {
            const sourceNodes = selectedPluginId === undefined ? nodes : allNodes;
            const sourceEdges = selectedPluginId === undefined ? edges : allEdges;
            return focusRuntimeGraph(sourceNodes, sourceEdges, selectedPluginId, neighbourDepth);
        }
        const relatedIds = new Set([
            ...(selectedService.providerNodeId === undefined ? [] : [selectedService.providerNodeId]),
            ...selectedServiceRelations.map(relation => relation.consumerNodeId),
        ]);
        const relatedNodes = allNodes.filter(node => relatedIds.has(node.id));
        return { nodes: relatedNodes, edges: graphEdgesFor(relatedNodes, allEdges) };
    }, [
        allEdges, allNodes, edges, neighbourDepth, nodes, selectedFiberId, selectedFiberOwnerId,
        selectedPluginId, selectedService, selectedServiceRelations,
    ]);
    const visibleFibers = useMemo(() => {
        if (selectedPluginId !== undefined)
            return allFibers.filter(fiber => fiber.ownerNodeId === selectedPluginId);
        if (selectedFiberId !== undefined) {
            const selected = allFibers.find(fiber => fiber.id === selectedFiberId);
            return selected === undefined
                ? []
                : selected.ownerNodeId === undefined
                    ? [selected]
                    : allFibers.filter(fiber => fiber.ownerNodeId === selected.ownerNodeId);
        }
        if (categoryFilter === 'fiber')
            return fibers;
        return [];
    }, [allFibers, categoryFilter, fibers, selectedFiberId, selectedPluginId]);
    const relations = useMemo(() => {
        if (selectedService === undefined) {
            return runtimeGraphRelations(focus.nodes, focus.edges, selectedPluginId);
        }
        const nodeRelations = new Map();
        if (selectedService.providerNodeId !== undefined) {
            nodeRelations.set(selectedService.providerNodeId, 'dependency');
        }
        for (const relation of selectedServiceRelations) {
            const current = nodeRelations.get(relation.consumerNodeId);
            nodeRelations.set(relation.consumerNodeId, current === 'dependency' ? 'both' : 'dependant');
        }
        return { nodes: nodeRelations, edges: new Map() };
    }, [focus.edges, focus.nodes, selectedPluginId, selectedService, selectedServiceRelations]);
    const visibleNodeIds = useMemo(() => new Set(focus.nodes.map(node => node.id)), [focus.nodes]);
    const visibleServiceCount = useMemo(() => {
        if (selectedService !== undefined)
            return 1;
        if (selectedPluginId === undefined)
            return 0;
        return new Set(serviceRelations
            .filter((relation) => {
            const related = relation.consumerNodeId === selectedPluginId || relation.providerNodeId === selectedPluginId;
            const providerVisible = relation.providerNodeId === undefined || visibleNodeIds.has(relation.providerNodeId);
            return related && visibleNodeIds.has(relation.consumerNodeId) && providerVisible;
        })
            .map(relation => relation.serviceNodeId)).size;
    }, [selectedPluginId, selectedService, serviceRelations, visibleNodeIds]);
    useEffect(() => {
        const presentation = readGraphPresentation(profile);
        const pruned = pruneGraphLayout(presentation.positions, allNodes);
        setSavedPositions(pruned);
        setNeighbourDepth(presentation.neighbourDepth);
        writeGraphLayout(profile, pruned, presentation.neighbourDepth);
        setCanvasRevision(current => current + 1);
    }, [profile, layoutScopeKey]);
    const persistPositions = (positions) => {
        setSavedPositions(positions);
        writeGraphLayout(profile, positions, neighbourDepth);
    };
    const changeNeighbourDepth = (next) => {
        setNeighbourDepth(next);
        writeGraphLayout(profile, savedPositions, next);
    };
    const resetGraph = () => {
        setSavedPositions({});
        setNeighbourDepth(1);
        writeGraphLayout(profile, {}, 1);
        setCanvasRevision(current => current + 1);
    };
    const filteredItemCount = categoryFilter === 'service'
        ? services.length
        : categoryFilter === 'fiber' ? fibers.length : nodes.length;
    const totalItemCount = categoryFilter === 'service'
        ? totalServices
        : categoryFilter === 'fiber' ? totalFibers : totalNodes;
    const hasVisibleItems = categoryFilter === 'service'
        ? services.length > 0
        : categoryFilter === 'fiber' ? visibleFibers.length > 0 : focus.nodes.length > 0;
    return (_jsxs("div", { className: css.graphView, children: [graphFocus !== undefined && focusLabel !== undefined && (_jsxs("div", { className: css.focusBar, role: "status", "aria-live": "polite", children: [_jsxs("span", { className: css.focusIdentity, children: [_jsx("span", { children: t(graphFocus.kind === 'service'
                                    ? 'focusedService'
                                    : graphFocus.kind === 'fiber' ? 'focusedFiber' : 'focusedNode') }), _jsx("strong", { children: focusLabel })] }), _jsxs("span", { className: css.focusCount, children: [t('relatedPlugins'), " ", _jsx("strong", { children: focus.nodes.length }), " / ", totalNodes] }), _jsxs("span", { className: css.focusCount, children: [t('relatedServices'), " ", _jsx("strong", { children: visibleServiceCount }), " / ", totalServices] }), _jsxs("span", { className: css.focusCount, children: [t('relatedFibers'), " ", _jsx("strong", { children: visibleFibers.length }), " / ", totalFibers] }), graphFocus.kind === 'plugin' && _jsxs("label", { className: css.depthFilter, children: [_jsx("span", { children: t('relationDepth') }), _jsxs("select", { "aria-label": t('relationDepth'), value: String(neighbourDepth), onChange: (event) => {
                                    const value = event.target.value;
                                    changeNeighbourDepth(value === 'all' ? 'all' : value === '2' ? 2 : 1);
                                }, children: [_jsx("option", { value: "1", children: t('oneHop') }), _jsx("option", { value: "2", children: t('twoHops') }), _jsx("option", { value: "all", children: t('connectedGraph') })] })] }), _jsx("button", { type: "button", className: css.showAll, onClick: onClearSelection, children: t('showAll') })] })), graphFocus === undefined && categoryFilter !== 'all' && (_jsxs("div", { className: css.focusBar, role: "status", "aria-live": "polite", children: [_jsxs("span", { className: css.focusIdentity, children: [_jsx("span", { children: t('filteredType') }), _jsx("strong", { children: t(CATEGORY_LABELS[categoryFilter]) })] }), _jsxs("span", { className: css.focusCount, children: [t(categoryFilter === 'fiber' ? 'visibleFibers' : 'visiblePlugins'), " ", _jsx("strong", { children: filteredItemCount }), " / ", totalItemCount] }), _jsx("button", { type: "button", className: css.showAll, onClick: () => { onCategoryFilterChange('all'); }, children: t('clearTypeFilter') })] })), !hasVisibleItems ? _jsx("div", { className: css.emptyState, children: empty }) : (_jsx(RuntimeGraphCanvas, { nodes: focus.nodes, edges: focus.edges, fibers: visibleFibers, services: services, serviceRelations: serviceRelations, relations: relations, focus: graphFocus, savedPositions: savedPositions, graphLabel: graphLabel, phaseLabel: phaseLabel, onSelect: onSelect, onPositionsChange: persistPositions, onResetPositions: resetGraph, categoryFilter: categoryFilter, onCategoryFilterChange: onCategoryFilterChange, t: t }, `${profile ?? 'unknown'}:${canvasRevision}`))] }));
}
function TraceTimeline({ turn, events, selectedId, onSelect, onBack, empty, laneLabel, timeLabel, t, }) {
    return (_jsxs("div", { className: css.traceDetail, children: [_jsxs("header", { className: css.traceDetailHeader, children: [_jsxs("button", { type: "button", className: css.traceBack, onClick: onBack, children: [_jsx(ArrowLeftIcon, { "aria-hidden": "true", width: 16, height: 16 }), t('backToTurns')] }), _jsxs("div", { className: css.traceDetailIdentity, children: [_jsx("code", { title: turn.sessionId, children: shortSessionId(turn.sessionId) }), _jsx("span", { "aria-hidden": "true", children: "/" }), _jsxs("strong", { children: [t('turn'), " #", turn.turn] }), _jsx("span", { className: css.turnStatus, "data-status": turn.status, children: t(TURN_STATUS_LABELS[turn.status]) })] }), _jsxs("dl", { className: css.turnMetrics, children: [_jsxs("div", { children: [_jsx("dt", { children: t('duration') }), _jsx("dd", { children: formatDuration(turn.durationMs) })] }), _jsxs("div", { children: [_jsx("dt", { children: t('events') }), _jsx("dd", { children: turn.eventCount })] }), _jsxs("div", { children: [_jsx("dt", { children: t('steps') }), _jsx("dd", { children: turn.stepCount })] }), _jsxs("div", { children: [_jsx("dt", { children: t('toolCalls') }), _jsx("dd", { children: turn.toolCallCount })] })] })] }), events.length === 0
                ? _jsx("div", { className: css.emptyState, children: empty })
                : _jsx("div", { className: css.traceScroller, children: _jsxs("div", { className: css.traceGrid, children: [_jsx("div", { className: css.traceCorner, children: timeLabel }), Object.keys(LANE_LABELS).map(lane => (_jsx("div", { className: css.traceLane, children: laneLabel(lane) }, lane))), events.map(event => (_jsxs("div", { className: css.traceRow, children: [_jsx("time", { dateTime: new Date(event.time).toISOString(), children: new Date(event.time).toLocaleTimeString([], { hour12: false }) }), _jsxs("button", { type: "button", className: css.traceEvent, "data-lane": event.lane, "data-selected": selectedId === event.id || undefined, onClick: () => { onSelect(event.id); }, children: [_jsx("span", { children: event.type }), _jsx("small", { children: event.name ?? `#${event.seq}` })] })] }, event.id)))] }) })] }));
}
function TraceDirectory({ sessions, onSelect, empty, t, }) {
    const turnCount = sessions.reduce((count, session) => count + session.turns.length, 0);
    if (turnCount === 0)
        return _jsx("div", { className: css.emptyState, children: empty });
    const runningCount = sessions.reduce((count, session) => count + session.turns.filter(turn => turn.status === 'running').length, 0);
    return (_jsxs("div", { className: css.traceDirectory, children: [_jsxs("dl", { className: css.traceSummary, "aria-label": t('traceSummary'), children: [_jsxs("div", { children: [_jsx("dt", { children: t('sessions') }), _jsx("dd", { children: sessions.length })] }), _jsxs("div", { children: [_jsx("dt", { children: t('agentTurns') }), _jsx("dd", { children: turnCount })] }), _jsxs("div", { children: [_jsx("dt", { children: t('runningTurns') }), _jsx("dd", { children: runningCount })] })] }), _jsx("div", { className: css.traceSessions, children: sessions.map(session => (_jsxs("section", { className: css.traceSession, children: [_jsxs("header", { children: [_jsxs("div", { children: [_jsx("span", { children: t('session') }), _jsx("code", { title: session.sessionId, children: shortSessionId(session.sessionId) })] }), _jsxs("small", { children: [session.turns.length, " ", t('turns'), " \u00B7 ", session.eventCount, " ", t('events')] })] }), _jsxs("div", { className: css.turnList, children: [session.turns.map(turn => (_jsxs("button", { type: "button", className: css.turnRow, "aria-label": `${t('turn')} ${turn.turn}, ${t(TURN_STATUS_LABELS[turn.status])}`, onClick: () => { onSelect(turn.key); }, children: [_jsxs("div", { className: css.turnIdentity, children: [_jsxs("strong", { children: [t('turn'), " #", turn.turn] }), _jsx("time", { dateTime: new Date(turn.startedAt).toISOString(), children: new Date(turn.startedAt).toLocaleTimeString([], { hour12: false }) })] }), _jsx("span", { className: css.turnStatus, "data-status": turn.status, children: t(TURN_STATUS_LABELS[turn.status]) }), _jsxs("dl", { className: css.turnMetrics, children: [_jsxs("div", { children: [_jsx("dt", { children: t('duration') }), _jsx("dd", { children: formatDuration(turn.durationMs) })] }), _jsxs("div", { children: [_jsx("dt", { children: t('events') }), _jsx("dd", { children: turn.eventCount })] }), _jsxs("div", { children: [_jsx("dt", { children: t('steps') }), _jsx("dd", { children: turn.stepCount })] }), _jsxs("div", { children: [_jsx("dt", { children: t('toolCalls') }), _jsx("dd", { children: turn.toolCallCount })] })] }), _jsx(ChevronRightIcon, { "aria-hidden": "true", width: 17, height: 17 })] }, turn.key))), session.sessionEvents.length > 0 && (_jsxs("p", { className: css.sessionEvents, children: [t('sessionEvents'), ": ", session.sessionEvents.length] }))] })] }, session.sessionId))) })] }));
}
function PluginInspector({ node, t }) {
    const lifecycle = statusKey(node.phase);
    const lifecycleLabel = t(STATUS_LABELS[lifecycle]);
    const rows = [
        ['module', node.moduleName],
        ['entry', node.entryId],
        ['fiber', node.fiberId],
        ['runtimeIdentity', node.runtimeId],
    ];
    return (_jsxs(_Fragment, { children: [_jsxs("div", { className: css.inspectorTitle, "data-kind": "plugin", children: [_jsx("span", { className: css.inspectorIcon, children: _jsx(IconCordisPluginOutline14, { size: 18 }) }), _jsxs("div", { children: [_jsx("strong", { children: node.label }), _jsxs("span", { className: css.inspectorSubtitle, children: [_jsx("small", { children: t('selectedPlugin') }), _jsxs("span", { className: css.inspectorStatus, "data-state": lifecycle, "aria-label": `${t('status')}: ${lifecycleLabel}`, children: [_jsx("i", { "aria-hidden": "true" }), lifecycleLabel] })] })] })] }), _jsx("dl", { className: css.metadata, children: rows.map(([label, value]) => (_jsxs("div", { children: [_jsx("dt", { children: t(label) }), _jsx("dd", { children: value ?? _jsx("span", { className: css.emptyValue, children: t('unavailable') }) })] }, label))) }), lifecycle === 'pending' && (_jsxs("section", { className: css.pendingDiagnosis, "data-missing": node.missing.length > 0 || undefined, children: [_jsx("h3", { children: t('pendingDiagnosis') }), _jsx("p", { children: t(node.missing.length > 0 ? 'waitingForServices' : 'waitingForRuntime') }), node.missing.length > 0 && _jsx(MetadataList, { values: node.missing, empty: t('noItems') })] })), _jsxs("section", { className: css.inspectorSection, children: [_jsx("h3", { children: t('provides') }), _jsx(MetadataList, { values: node.provides, empty: t('noItems') })] }), _jsxs("section", { className: css.inspectorSection, children: [_jsx("h3", { children: t('injects') }), _jsx(MetadataList, { values: node.injects, empty: t('noItems') })] }), node.missing.length > 0 && _jsxs("section", { className: css.inspectorSection, "data-warning": true, children: [_jsx("h3", { children: t('missing') }), _jsx(MetadataList, { values: node.missing, empty: t('noItems') })] }), _jsxs("section", { className: css.inspectorSection, children: [_jsxs("h3", { children: [t('effects'), " ", _jsx("span", { children: node.effectCount })] }), _jsx(MetadataList, { values: node.effects, empty: t('noItems') })] })] }));
}
function FiberInspector({ fiber, t }) {
    const lifecycle = statusKey(fiber.phase);
    const lifecycleLabel = t(STATUS_LABELS[lifecycle]);
    const rows = [
        ['fiberUid', fiber.uid],
        ['fiber', fiber.id],
        ['module', fiber.moduleName],
        ['ownerPlugin', fiber.ownerEntryId],
        ['parentFiber', fiber.parentFiberId],
        ['runtimeIdentity', fiber.runtimeId],
        ['entryRoot', t(fiber.entryRoot ? 'yes' : 'no')],
    ];
    return (_jsxs(_Fragment, { children: [_jsxs("div", { className: css.inspectorTitle, "data-kind": "fiber", children: [_jsx("span", { className: css.inspectorIcon, children: _jsx(IconBranchOutline16, { size: 18 }) }), _jsxs("div", { children: [_jsxs("strong", { children: ["#", fiber.uid, " ", fiber.name] }), _jsxs("span", { className: css.inspectorSubtitle, children: [_jsx("small", { children: t('selectedFiber') }), _jsxs("span", { className: css.inspectorStatus, "data-state": lifecycle, "aria-label": `${t('status')}: ${lifecycleLabel}`, children: [_jsx("i", { "aria-hidden": "true" }), lifecycleLabel] })] })] })] }), _jsx("dl", { className: css.metadata, children: rows.map(([label, value]) => (_jsxs("div", { children: [_jsx("dt", { children: t(label) }), _jsx("dd", { children: value ?? _jsx("span", { className: css.emptyValue, children: t('unavailable') }) })] }, label))) }), lifecycle === 'pending' && (_jsxs("section", { className: css.pendingDiagnosis, "data-missing": fiber.missing.length > 0 || undefined, children: [_jsx("h3", { children: t('pendingDiagnosis') }), _jsx("p", { children: t(fiber.missing.length > 0 ? 'waitingForServices' : 'waitingForRuntime') }), fiber.missing.length > 0 && _jsx(MetadataList, { values: fiber.missing, empty: t('noItems') })] })), _jsxs("section", { className: css.inspectorSection, children: [_jsx("h3", { children: t('provides') }), _jsx(MetadataList, { values: fiber.provides, empty: t('noItems') })] }), _jsxs("section", { className: css.inspectorSection, children: [_jsx("h3", { children: t('injects') }), _jsx(MetadataList, { values: fiber.injects, empty: t('noItems') })] }), fiber.missing.length > 0 && _jsxs("section", { className: css.inspectorSection, "data-warning": true, children: [_jsx("h3", { children: t('missing') }), _jsx(MetadataList, { values: fiber.missing, empty: t('noItems') })] }), _jsx("section", { className: css.inspectorSection, children: _jsxs("h3", { children: [t('effects'), " ", _jsx("span", { children: fiber.effectCount })] }) })] }));
}
function ServiceInspector({ service, serviceRelations, nodes, t, }) {
    const nodeById = new Map(nodes.map(node => [node.id, node]));
    const provider = service.providerNodeId === undefined ? undefined : nodeById.get(service.providerNodeId);
    const consumerIds = [...new Set(serviceRelations
            .filter(relation => relation.serviceNodeId === service.id)
            .map(relation => relation.consumerNodeId))];
    const consumers = consumerIds
        .map(id => nodeById.get(id))
        .filter((node) => node !== undefined);
    const pluginLabel = (node) => `${node.label} · ${node.moduleName}`;
    const lifecycle = statusKey(service.phase);
    const lifecycleLabel = t(STATUS_LABELS[lifecycle]);
    const rows = [
        ['serviceName', service.name],
        ['serviceIdentity', service.id],
        ['entry', service.providerEntryId ?? t('rootContext')],
        ['fiber', service.providerFiberId],
    ];
    return (_jsxs(_Fragment, { children: [_jsxs("div", { className: css.inspectorTitle, "data-kind": "service", children: [_jsx("span", { className: css.inspectorIcon, children: _jsx(IconDataOutline16, { size: 18 }) }), _jsxs("div", { children: [_jsx("strong", { children: service.name }), _jsxs("span", { className: css.inspectorSubtitle, children: [_jsx("small", { children: t('selectedService') }), _jsxs("span", { className: css.inspectorStatus, "data-state": lifecycle, "aria-label": `${t('status')}: ${lifecycleLabel}`, children: [_jsx("i", { "aria-hidden": "true" }), lifecycleLabel] })] })] })] }), _jsx("dl", { className: css.metadata, children: rows.map(([label, value]) => (_jsxs("div", { children: [_jsx("dt", { children: t(label) }), _jsx("dd", { children: value ?? _jsx("span", { className: css.emptyValue, children: t('unavailable') }) })] }, label))) }), _jsxs("section", { className: css.inspectorSection, children: [_jsxs("h3", { children: [t('providerPlugins'), " ", _jsx("span", { children: provider === undefined ? 0 : 1 })] }), _jsx(MetadataList, { values: provider === undefined ? [] : [pluginLabel(provider)], empty: t('noProvider') })] }), _jsxs("section", { className: css.inspectorSection, children: [_jsxs("h3", { children: [t('consumerPlugins'), " ", _jsx("span", { children: consumers.length })] }), _jsx(MetadataList, { values: consumers.map(pluginLabel), empty: t('noItems') })] })] }));
}
function EventInspector({ event, t }) {
    const rows = [
        ['session', event.sessionId],
        ['event', event.type],
        ['sequence', event.seq],
        ['payload', event.payloadChars],
        ['turn', event.turn],
        ['step', event.step],
        ['callId', event.callId],
        ['tool', event.name],
        ['outcome', event.outcome],
    ];
    return (_jsxs(_Fragment, { children: [_jsxs("div", { className: css.inspectorTitle, children: [_jsx("span", { className: css.inspectorIcon, children: _jsx(IconDataOutline16, { size: 18 }) }), _jsxs("div", { children: [_jsx("strong", { children: event.type }), _jsx("small", { children: t('selectedEvent') })] })] }), _jsx("dl", { className: css.metadata, children: rows.filter(([, value]) => value !== undefined).map(([label, value]) => (_jsxs("div", { children: [_jsx("dt", { children: t(label) }), _jsx("dd", { children: String(value) })] }, label))) }), _jsx("p", { className: css.privacy, children: t('privacy') })] }));
}
/** Render the frame overlay and keep Remote polling bound to its visible lifetime. */
export function RuntimeExplorer({ useStore, useRuntime, actions, onVisibilityChange, onRefresh, t, }) {
    const state = useStore(current => current);
    const remote = useRuntime(current => current);
    useEffect(() => {
        if (!state.open)
            return;
        onVisibilityChange(true);
        return () => { onVisibilityChange(false); };
    }, [onVisibilityChange, state.open]);
    const query = state.query.trim().toLowerCase();
    const data = remote.data;
    const traceSessions = useMemo(() => groupRuntimeTrace(data?.trace ?? []), [data?.trace]);
    const visibleTraceSessions = useMemo(() => filterRuntimeTrace(traceSessions, query), [query, traceSessions]);
    const observedBootId = useRef();
    useEffect(() => {
        if (!state.open || data === undefined)
            return;
        const processRestarted = observedBootId.current !== undefined && observedBootId.current !== data.bootId;
        observedBootId.current = data.bootId;
        if (processRestarted) {
            actions.select(undefined);
            actions.selectTraceTurn(undefined);
            return;
        }
        const selectionExists = state.selection === undefined
            || (state.selection.kind === 'node' && data.graph.nodes.some(node => node.id === state.selection?.id))
            || (state.selection.kind === 'fiber' && data.graph.fibers.some(fiber => fiber.id === state.selection?.id))
            || (state.selection.kind === 'service' && data.graph.services.some(service => service.id === state.selection?.id))
            || (state.selection.kind === 'event' && data.trace.some(event => event.id === state.selection?.id));
        if (!selectionExists)
            actions.select(undefined);
        if (state.traceTurnKey !== undefined && !traceSessions.some(session => (session.turns.some(turn => turn.key === state.traceTurnKey)))) {
            actions.selectTraceTurn(undefined);
        }
    }, [actions, data, state.open, state.selection, state.traceTurnKey, traceSessions]);
    const graphFibers = useMemo(() => data?.graph.fibers.filter(fiber => (includesFiber(fiber, query)
        && (state.phase === 'all' || statusKey(fiber.phase) === state.phase)
        && (state.fiberCategory === 'all'
            || runtimeG6NodeCategory(fiber.moduleName, fiber.name) === state.fiberCategory))) ?? [], [data?.graph.fibers, query, state.fiberCategory, state.phase]);
    const fiberOwnerIds = useMemo(() => new Set(graphFibers.flatMap(fiber => fiber.ownerNodeId === undefined ? [] : [fiber.ownerNodeId])), [graphFibers]);
    const graphNodes = useMemo(() => state.category === 'service'
        ? []
        : state.category === 'fiber'
            ? data?.graph.nodes.filter(node => fiberOwnerIds.has(node.id)) ?? []
            : data?.graph.nodes.filter(node => (includesNode(node, query)
                && (state.phase === 'all' || statusKey(node.phase) === state.phase)
                && (state.category === 'all' || runtimeG6NodeCategory(node.moduleName, node.label) === state.category))) ?? [], [data?.graph.nodes, fiberOwnerIds, query, state.category, state.phase]);
    const graphServices = useMemo(() => data === undefined
        ? []
        : state.category === 'service'
            ? data.graph.services.filter(service => (includesService(service, query)
                && (state.phase === 'all' || statusKey(service.phase) === state.phase)))
            : data.graph.services, [data?.graph.services, query, state.category, state.phase]);
    const graphEdges = useMemo(() => data === undefined ? [] : graphEdgesFor(graphNodes, data.graph.edges), [data?.graph.edges, graphNodes]);
    if (!state.open)
        return null;
    const selectedTurn = traceSessions.flatMap(session => session.turns)
        .find(turn => turn.key === state.traceTurnKey);
    const traceEvents = selectedTurn?.events.filter(event => includesEvent(event, query)) ?? [];
    const selectedNode = state.selection?.kind === 'node'
        ? data?.graph.nodes.find(node => node.id === state.selection?.id)
        : undefined;
    const selectedFiber = state.selection?.kind === 'fiber'
        ? data?.graph.fibers.find(fiber => fiber.id === state.selection?.id)
        : undefined;
    const selectedService = state.selection?.kind === 'service'
        ? data?.graph.services.find(service => service.id === state.selection?.id)
        : undefined;
    const selectedEvent = state.selection?.kind === 'event'
        ? data?.trace.find(event => event.id === state.selection?.id)
        : undefined;
    const close = () => {
        actions.setOpen(false);
        onVisibilityChange(false);
    };
    return (_jsxs("section", { className: css.surface, style: { left: state.sidebarOffset }, "aria-label": t('title'), children: [_jsxs("header", { className: css.header, children: [_jsx("div", { className: css.brandIcon, children: _jsx(IconBranchOutline16, { size: 20 }) }), _jsxs("div", { className: css.heading, children: [_jsxs("div", { className: css.titleRow, children: [_jsx("h1", { children: t('title') }), _jsxs("span", { className: css.liveBadge, children: [_jsx("i", { "aria-hidden": true }), t('live')] })] }), _jsxs("span", { className: css.profileBadge, "aria-label": `${t('currentProfile')}: ${data?.profile ?? t('unavailable')}`, children: [_jsx("span", { children: t('profile') }), _jsx("code", { children: data?.profile ?? '—' })] })] }), _jsxs("div", { className: css.headerActions, children: [_jsx("span", { className: css.updated, children: t('updated') }), _jsx(Tooltip, { label: t('refresh'), side: "bottom", delayMs: 400, children: _jsx("button", { type: "button", className: css.iconButton, "aria-label": t('refresh'), onClick: onRefresh, children: _jsx(IconRefreshOutline16, { size: 16 }) }) }), _jsx(Tooltip, { label: t('close'), side: "bottom", delayMs: 400, children: _jsx("button", { type: "button", className: css.iconButton, "aria-label": t('close'), onClick: close, children: _jsx(IconCloseOutline16, { size: 16 }) }) })] })] }), _jsxs("div", { className: css.toolbar, children: [_jsxs("div", { className: css.tabs, children: [_jsxs("button", { type: "button", "data-active": state.tab === 'overview' || undefined, onClick: () => { actions.setTab('overview'); }, children: [_jsx(Squares2X2Icon, { width: 15 }), t('overviewTab')] }), _jsxs("button", { type: "button", "data-active": state.tab === 'graph' || undefined, onClick: () => { actions.setTab('graph'); }, children: [_jsx(IconBranchOutline16, { size: 15 }), t('graphTab')] }), _jsxs("button", { type: "button", "data-active": state.tab === 'trace' || undefined, onClick: () => { actions.setTab('trace'); }, children: [_jsx(IconDataOutline16, { size: 15 }), t('traceTab')] })] }), state.tab !== 'overview' && _jsxs("label", { className: css.search, children: [_jsx(IconSearchOutline16, { size: 16 }), _jsx("input", { value: state.query, placeholder: t(state.tab === 'graph'
                                    ? 'searchGraph'
                                    : selectedTurn === undefined ? 'searchTrace' : 'searchTurnTrace'), onChange: (event) => { actions.setQuery(event.target.value); } })] }), state.tab === 'graph' && (_jsxs("select", { className: css.phaseFilter, "aria-label": t('allStates'), value: state.phase, onChange: (event) => { actions.setPhase(event.target.value); }, children: [_jsx("option", { value: "all", children: t('allStates') }), Object.keys(STATUS_LABELS).map(status => (_jsx("option", { value: status, children: t(STATUS_LABELS[status]) }, status)))] }))] }), _jsxs("div", { className: clsx(css.body, (selectedNode !== undefined || selectedFiber !== undefined || selectedService !== undefined || selectedEvent !== undefined) && css.withInspector), children: [_jsxs("main", { className: css.canvas, children: [remote.loading && data === undefined && _jsx("div", { className: css.emptyState, children: t('loadingSnapshot') }), remote.error !== undefined && data === undefined && (_jsxs("div", { className: css.emptyState, children: [_jsx("p", { children: t('loadFailed') }), _jsx("button", { type: "button", onClick: onRefresh, children: t('retry') })] })), data !== undefined && state.tab === 'overview' && (_jsx(RuntimeOverview, { overview: data.overview, activity: data.effectActivity, t: t, onInspect: (kind, category, status) => {
                                    actions.setTab('graph');
                                    actions.setPhase(status);
                                    if (kind === 'fiber') {
                                        actions.setCategory('fiber');
                                        actions.setFiberCategory(category ?? 'all');
                                    }
                                    else if (kind === 'service') {
                                        actions.setCategory('service');
                                    }
                                    else {
                                        actions.setCategory(category ?? 'all');
                                    }
                                } })), data !== undefined && state.tab === 'graph' && (_jsx(GraphView, { nodes: graphNodes, allNodes: data.graph.nodes, edges: graphEdges, allEdges: data.graph.edges, fibers: graphFibers, allFibers: data.graph.fibers, services: graphServices, serviceRelations: data.graph.serviceRelations, totalNodes: data.graph.nodes.length, totalFibers: data.graph.fibers.length, totalServices: data.overview.serviceBreakdown.total, graphFocus: selectedNode === undefined
                                    ? selectedFiber === undefined
                                        ? selectedService === undefined ? undefined : { kind: 'service', id: selectedService.id }
                                        : { kind: 'fiber', id: selectedFiber.id }
                                    : { kind: 'plugin', id: selectedNode.id }, focusLabel: selectedNode?.label ?? (selectedFiber === undefined
                                    ? selectedService?.name
                                    : `#${selectedFiber.uid} ${selectedFiber.name}`), profile: data.profile, empty: t('emptyGraph'), graphLabel: t('graphLabel'), phaseLabel: phase => t(STATUS_LABELS[statusKey(phase)]), categoryFilter: state.category, t: t, onSelect: (focus) => {
                                    actions.select({
                                        kind: focus.kind === 'plugin' ? 'node' : focus.kind,
                                        id: focus.id,
                                    });
                                }, onClearSelection: () => { actions.select(undefined); }, onCategoryFilterChange: (category) => { actions.setCategory(category); } })), data !== undefined && state.tab === 'trace' && (selectedTurn === undefined
                                ? _jsx(TraceDirectory, { sessions: visibleTraceSessions, empty: t(query === '' ? 'emptyTurns' : 'emptyTrace'), t: t, onSelect: (key) => { actions.selectTraceTurn(key); } })
                                : _jsx(TraceTimeline, { turn: selectedTurn, events: traceEvents, selectedId: selectedEvent?.id, empty: t('emptyTurnTrace'), laneLabel: lane => t(LANE_LABELS[lane]), timeLabel: t('time'), t: t, onBack: () => { actions.selectTraceTurn(undefined); }, onSelect: (id) => { actions.select({ kind: 'event', id }); } }))] }), (selectedNode !== undefined || selectedFiber !== undefined || selectedService !== undefined || selectedEvent !== undefined) && (_jsxs("aside", { className: css.inspector, children: [_jsx("button", { type: "button", className: css.inspectorClose, "aria-label": t('closeInspector'), onClick: () => { actions.select(undefined); }, children: _jsx(IconCloseOutline16, { size: 16 }) }), selectedNode !== undefined && _jsx(PluginInspector, { node: selectedNode, t: t }), selectedFiber !== undefined && _jsx(FiberInspector, { fiber: selectedFiber, t: t }), selectedService !== undefined && _jsx(ServiceInspector, { service: selectedService, serviceRelations: data?.graph.serviceRelations ?? [], nodes: data?.graph.nodes ?? [], t: t }), selectedEvent !== undefined && _jsx(EventInspector, { event: selectedEvent, t: t })] }))] })] }));
}
//# sourceMappingURL=RuntimeExplorer.js.map