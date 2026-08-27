/** Pure G6 projection and update policy for the Runtime Explorer graph canvas. */
import { runtimeLifecycleStatus } from "./graph.js";
const MIN_PLUGIN_SIZE = 76;
const MAX_PLUGIN_SIZE = 108;
const MISSING_SERVICE_SIZE = 58;
const SERVICE_SIZE = 72;
const FIBER_SIZE = 64;
export const RUNTIME_G6_COLLISION_GAP = 24;
export const RUNTIME_G6_INITIAL_SPACING = MAX_PLUGIN_SIZE + RUNTIME_G6_COLLISION_GAP * 2;
/**
 * Give the force simulation a deterministic, non-overlapping starting point.
 * G6 otherwise initializes many newly materialized Fiber nodes at the same
 * coordinate, and the bounded layout budget can expire before they separate.
 */
export function seedRuntimeG6Positions(nodes) {
    const pending = nodes
        .filter(node => !Number.isFinite(node.style?.x) || !Number.isFinite(node.style?.y))
        .map(node => String(node.id))
        .sort();
    if (pending.length === 0)
        return [...nodes];
    const columns = Math.ceil(Math.sqrt(pending.length));
    const rows = Math.ceil(pending.length / columns);
    const positionById = new Map(pending.map((id, index) => {
        const column = index % columns;
        const row = Math.floor(index / columns);
        return [id, {
                x: (column - (columns - 1) / 2) * RUNTIME_G6_INITIAL_SPACING,
                y: (row - (rows - 1) / 2) * RUNTIME_G6_INITIAL_SPACING,
            }];
    }));
    return nodes.map((node) => {
        const position = positionById.get(String(node.id));
        return position === undefined ? node : { ...node, style: { ...node.style, ...position } };
    });
}
/**
 * Infer a stable, explainable visual category from DSH package conventions.
 * The fallback deliberately stays neutral for third-party plugins.
 */
export function runtimeG6NodeCategory(moduleName, label) {
    const name = `${moduleName} ${label}`.toLowerCase();
    const short = label.toLowerCase();
    if (name.includes('cordis') || ['runtime', 'loader', 'app-boot', 'boot'].includes(short))
        return 'core';
    if (/^(session|memory|persistence|projection|spill|title)(-|$)/.test(short))
        return 'session';
    if (/^(agent|persona|goal|plan|permission|repeat-tool)(-|$)/.test(short))
        return 'agent';
    if (/^(llm|model|token)(-|$)/.test(short))
        return 'model';
    if (/^(tool|tools|sandbox|attachment|code-runtime|deliverables|modules)(-|$)/.test(short))
        return 'tool';
    if (/^(ui|client|web|cmdline|settings|terminal|api-remotes|apiproxy)(-|$)/.test(short))
        return 'interface';
    return 'extension';
}
/** Keep the exact plugin name while preferring semantic line breaks inside circles. */
export function runtimeG6DisplayLabel(label, maxLineLength = 13) {
    if (label.length <= maxLineLength)
        return label;
    const semanticTokens = label
        .replace(/([a-z0-9])([A-Z])/g, '$1\u0000$2')
        .replace(/([-_.:/])/g, '$1\u0000')
        .split('\u0000')
        .filter(Boolean);
    const tokens = semanticTokens.flatMap((token) => {
        if (token.length <= maxLineLength)
            return [token];
        const chunks = [];
        for (let offset = 0; offset < token.length; offset += maxLineLength) {
            chunks.push(token.slice(offset, offset + maxLineLength));
        }
        return chunks;
    });
    const lines = [];
    let current = '';
    for (const token of tokens) {
        const candidate = `${current}${token}`;
        if (current !== '' && candidate.length > maxLineLength) {
            lines.push(current);
            current = token;
        }
        else {
            current = candidate;
        }
    }
    if (current !== '')
        lines.push(current);
    return lines.join('\n');
}
/** Scale hubs without allowing high-degree plugins to dominate the canvas. */
export function runtimeG6NodeSize(degree, selected = false, label = '') {
    const labelBoost = Math.min(18, Math.max(0, label.length - 8));
    const size = MIN_PLUGIN_SIZE + labelBoost + Math.round(Math.sqrt(Math.max(0, degree)) * 5) + (selected ? 6 : 0);
    return Math.min(MAX_PLUGIN_SIZE, size);
}
/** Collision radius passed to G6, including label-safe whitespace around each circle. */
export function runtimeG6CollisionRadius(size) {
    return Math.max(0, size) / 2 + RUNTIME_G6_COLLISION_GAP;
}
/**
 * Move only the node the user released until it clears its visible neighbours.
 * This deliberately does not restart the force layout: manually placed nodes
 * stay where the user put them, while the released node cannot cover a peer.
 */
export function resolveRuntimeG6DraggedNodePosition(draggedId, target, nodes, positions) {
    const dragged = nodes.find(node => String(node.id) === draggedId);
    const initialX = target[0];
    const initialY = target[1];
    if (dragged === undefined || !Number.isFinite(initialX) || !Number.isFinite(initialY)) {
        return [0, 0];
    }
    const draggedRadius = runtimeG6CollisionRadius(runtimeG6NodeMetadata(dragged).size);
    const blockers = nodes.flatMap((node) => {
        const id = String(node.id);
        if (id === draggedId)
            return [];
        const position = positions.get(id);
        const x = position?.[0];
        const y = position?.[1];
        if (!Number.isFinite(x) || !Number.isFinite(y))
            return [];
        return [{
                id,
                x: Number(x),
                y: Number(y),
                radius: runtimeG6CollisionRadius(runtimeG6NodeMetadata(node).size),
            }];
    });
    let x = Number(initialX);
    let y = Number(initialY);
    for (let iteration = 0; iteration < 12; iteration += 1) {
        let moved = false;
        for (const blocker of blockers) {
            let dx = x - blocker.x;
            let dy = y - blocker.y;
            if (dx === 0 && dy === 0) {
                const seed = [...`${draggedId}:${blocker.id}`].reduce((value, char) => (value * 31 + char.charCodeAt(0)) >>> 0, 0);
                const angle = seed / 0x1_0000_0000 * Math.PI * 2;
                dx = Math.cos(angle);
                dy = Math.sin(angle);
            }
            const distance = Math.max(0.001, Math.hypot(dx, dy));
            const requiredDistance = draggedRadius + blocker.radius;
            if (distance >= requiredDistance)
                continue;
            const offset = requiredDistance - distance + 0.01;
            x += dx / distance * offset;
            y += dy / distance * offset;
            moved = true;
        }
        if (!moved)
            break;
    }
    return [x, y];
}
/** Safely read the metadata placed on a G6 node datum by this adapter. */
export function runtimeG6NodeMetadata(node) {
    return node.data;
}
/** Safely read the metadata placed on a G6 edge datum by this adapter. */
export function runtimeG6EdgeMetadata(edge) {
    return edge.data;
}
/**
 * Project the Host graph into G6 data while keeping product state out of the renderer.
 * Missing Cordis providers become explicit satellite nodes only around the selected plugin.
 */
export function buildRuntimeG6Data(nodes, edges, fibers, services, serviceRelations, relations, focus, savedPositions, showAllServices = false) {
    const selectedPluginId = focus?.kind === 'plugin' ? focus.id : undefined;
    const selectedFiberId = focus?.kind === 'fiber' ? focus.id : undefined;
    const selectedServiceId = focus?.kind === 'service' ? focus.id : undefined;
    const degree = new Map();
    const nodeIds = new Set(nodes.map(node => node.id));
    const validEdges = edges.filter(edge => nodeIds.has(edge.source) && nodeIds.has(edge.target));
    for (const edge of validEdges) {
        degree.set(edge.source, (degree.get(edge.source) ?? 0) + 1);
        degree.set(edge.target, (degree.get(edge.target) ?? 0) + 1);
    }
    const projectedNodes = nodes.map((node) => {
        const saved = savedPositions[node.logicalKey];
        const size = runtimeG6NodeSize(degree.get(node.id) ?? 0, node.id === selectedPluginId, node.label);
        const relation = relations.nodes.get(node.id);
        const metadata = {
            kind: 'plugin',
            label: node.label,
            logicalKey: node.logicalKey,
            moduleName: node.moduleName,
            phase: runtimeLifecycleStatus(node.phase),
            category: runtimeG6NodeCategory(node.moduleName, node.label),
            ...(relation === undefined ? {} : { relation }),
            size,
            pinned: saved?.pinned === true,
            provides: [...node.provides],
            injects: [...node.injects],
            missing: [...node.missing],
            effectCount: node.effectCount,
        };
        return {
            id: node.id,
            size,
            data: metadata,
            ...(saved === undefined ? {} : { style: { x: saved.x, y: saved.y } }),
            states: node.id === selectedPluginId ? ['selected'] : [],
        };
    });
    const focusedServiceRelations = focus === undefined || focus.kind === 'fiber'
        ? []
        : serviceRelations.filter(relation => ((focus.kind === 'service'
            ? relation.serviceNodeId === focus.id
            : relation.consumerNodeId === focus.id || relation.providerNodeId === focus.id)
            && nodeIds.has(relation.consumerNodeId)
            && (relation.providerNodeId === undefined || nodeIds.has(relation.providerNodeId))));
    const expandedPluginEdges = new Set(focusedServiceRelations.flatMap(relation => relation.providerNodeId === undefined
        ? []
        : [`${relation.consumerNodeId}\u0000${relation.providerNodeId}`]));
    const projectedEdges = validEdges.flatMap((edge) => {
        if (expandedPluginEdges.has(`${edge.source}\u0000${edge.target}`))
            return [];
        const relation = relations.edges.get(`${edge.source}:${edge.target}`);
        return [{
                id: edge.id,
                source: edge.source,
                target: edge.target,
                data: {
                    kind: 'injects',
                    ...(relation === undefined ? {} : { relation }),
                    services: [...edge.services],
                },
            }];
    });
    const visibleFiberIds = new Set(fibers.map(fiber => fiber.id));
    for (const fiber of fibers) {
        const id = `fiber:${fiber.id}`;
        const selected = fiber.id === selectedFiberId;
        const size = FIBER_SIZE + (selected ? 8 : 0);
        projectedNodes.push({
            id,
            size,
            data: {
                kind: 'fiber',
                label: `#${fiber.uid} ${fiber.name}`,
                moduleName: fiber.moduleName,
                phase: runtimeLifecycleStatus(fiber.phase),
                category: 'fiber',
                ...(selected ? { relation: 'selected' } : {}),
                size,
                pinned: false,
                provides: [...fiber.provides],
                injects: [...fiber.injects],
                missing: [...fiber.missing],
                effectCount: fiber.effectCount,
                ...(fiber.ownerNodeId === undefined ? {} : { ownerNodeId: fiber.ownerNodeId }),
                ...(fiber.ownerEntryId === undefined ? {} : { ownerEntryId: fiber.ownerEntryId }),
                ...(fiber.parentFiberId === undefined ? {} : { parentFiberId: fiber.parentFiberId }),
                fiberUid: fiber.uid,
                entryRoot: fiber.entryRoot,
            },
            states: selected ? ['selected'] : [],
        });
        if (fiber.ownerNodeId !== undefined && nodeIds.has(fiber.ownerNodeId)) {
            projectedEdges.push({
                id: `owns:${fiber.ownerNodeId}->${fiber.id}`,
                source: fiber.ownerNodeId,
                target: id,
                data: {
                    kind: 'owns',
                    ...(selectedPluginId === fiber.ownerNodeId ? { relation: 'related' } : {}),
                    services: [],
                },
            });
        }
        if (fiber.parentFiberId !== undefined && visibleFiberIds.has(fiber.parentFiberId)) {
            projectedEdges.push({
                id: `parent:${fiber.parentFiberId}->${fiber.id}`,
                source: `fiber:${fiber.parentFiberId}`,
                target: id,
                data: {
                    kind: 'parent',
                    ...(selected ? { relation: 'dependency' } : {}),
                    services: [],
                },
            });
        }
    }
    const serviceById = new Map(services.map(service => [service.id, service]));
    const visibleServiceIds = new Set(showAllServices
        ? services.map(service => service.id)
        : focusedServiceRelations.map(relation => relation.serviceNodeId));
    const consumerCounts = new Map();
    for (const relation of serviceRelations) {
        consumerCounts.set(relation.serviceNodeId, (consumerCounts.get(relation.serviceNodeId) ?? 0) + 1);
    }
    for (const serviceId of visibleServiceIds) {
        const service = serviceById.get(serviceId);
        if (service === undefined)
            continue;
        const id = `service:${service.id}`;
        const serviceSelected = service.id === selectedServiceId;
        const relation = serviceSelected
            ? 'selected'
            : focus?.kind === 'plugin'
                ? service.providerNodeId !== undefined && service.providerNodeId === selectedPluginId
                    ? 'dependant'
                    : 'dependency'
                : undefined;
        projectedNodes.push({
            id,
            size: SERVICE_SIZE + (serviceSelected ? 8 : 0),
            data: {
                kind: 'service',
                label: service.name,
                phase: runtimeLifecycleStatus(service.phase),
                category: 'service',
                ...(relation === undefined ? {} : { relation }),
                size: SERVICE_SIZE + (serviceSelected ? 8 : 0),
                pinned: false,
                provides: [],
                injects: [],
                missing: [],
                effectCount: 0,
                service: service.name,
                ...(service.providerNodeId === undefined ? {} : { providerNodeId: service.providerNodeId }),
                ...(service.providerEntryId === undefined ? {} : { providerEntryId: service.providerEntryId }),
                consumerCount: consumerCounts.get(service.id) ?? 0,
            },
            states: serviceSelected ? ['selected'] : [],
        });
        if (service.providerNodeId !== undefined && nodeIds.has(service.providerNodeId)) {
            projectedEdges.push({
                id: `provides:${service.providerNodeId}->${service.id}`,
                source: service.providerNodeId,
                target: id,
                data: {
                    kind: 'provides',
                    relation: selectedServiceId !== undefined
                        ? 'dependency'
                        : service.providerNodeId === selectedPluginId ? 'dependant' : 'dependency',
                    services: [service.name],
                },
            });
        }
    }
    for (const relation of focusedServiceRelations) {
        if (!nodeIds.has(relation.consumerNodeId))
            continue;
        projectedEdges.push({
            id: `injects:${relation.consumerNodeId}->${relation.serviceNodeId}`,
            source: relation.consumerNodeId,
            target: `service:${relation.serviceNodeId}`,
            data: {
                kind: 'injects',
                relation: selectedServiceId !== undefined
                    ? 'dependant'
                    : relation.consumerNodeId === selectedPluginId ? 'dependency' : 'dependant',
                services: [relation.service],
            },
        });
    }
    const selected = selectedPluginId === undefined ? undefined : nodes.find(node => node.id === selectedPluginId);
    for (const [index, service] of (selected?.missing ?? []).entries()) {
        const selectedId = selected?.id;
        if (selectedId === undefined)
            continue;
        const id = `missing:${selectedId}:${service}`;
        projectedNodes.push({
            id,
            size: MISSING_SERVICE_SIZE,
            data: {
                kind: 'missing-service',
                label: service,
                phase: 'missing',
                category: 'missing',
                relation: 'dependency',
                size: MISSING_SERVICE_SIZE,
                pinned: false,
                provides: [],
                injects: [],
                missing: [service],
                effectCount: 0,
                service,
                order: index,
            },
        });
        projectedEdges.push({
            id: `missing-edge:${selectedId}:${service}`,
            source: selectedId,
            target: id,
            data: {
                kind: 'missing',
                relation: 'dependency',
                services: [service],
            },
        });
    }
    const selectedFiber = selectedFiberId === undefined ? undefined : fibers.find(fiber => fiber.id === selectedFiberId);
    for (const [index, service] of (selectedFiber?.missing ?? []).entries()) {
        const id = `missing:fiber:${selectedFiberId}:${service}`;
        projectedNodes.push({
            id,
            size: MISSING_SERVICE_SIZE,
            data: {
                kind: 'missing-service', label: service, phase: 'missing', category: 'missing', relation: 'dependency',
                size: MISSING_SERVICE_SIZE, pinned: false, provides: [], injects: [], missing: [service], effectCount: 0,
                service, order: index,
            },
        });
        projectedEdges.push({
            id: `missing-edge:fiber:${selectedFiberId}:${service}`,
            source: `fiber:${selectedFiberId}`,
            target: id,
            data: {
                kind: 'missing', relation: 'dependency', services: [service],
            },
        });
    }
    return { nodes: seedRuntimeG6Positions(projectedNodes), edges: projectedEdges };
}
/** Count concrete scoped Service nodes currently materialized in focus mode. */
export function runtimeG6VisibleServiceCount(data) {
    return data.nodes.filter(node => runtimeG6NodeMetadata(node).kind === 'service').length;
}
/** Topology identity used to distinguish live status refreshes from structural changes. */
export function runtimeG6TopologyKey(data) {
    const nodes = data.nodes.map(node => String(node.id)).sort();
    const edges = data.edges.map(edge => `${String(edge.id)}:${edge.source}>${edge.target}`).sort();
    return `${nodes.join('|')}::${edges.join('|')}`;
}
/** Renderer-visible identity; tooltip-only metadata does not require a canvas redraw. */
export function runtimeG6VisualKey(data) {
    const nodes = data.nodes.map((node) => {
        const metadata = runtimeG6NodeMetadata(node);
        return [
            String(node.id), metadata.label, metadata.phase, metadata.category,
            metadata.relation ?? '', metadata.size, metadata.pinned, [...(node.states ?? [])].sort(),
        ];
    }).sort((left, right) => String(left[0]).localeCompare(String(right[0])));
    const edges = data.edges.map((edge) => {
        const metadata = runtimeG6EdgeMetadata(edge);
        return [String(edge.id), metadata.kind, metadata.relation ?? ''];
    }).sort((left, right) => String(left[0]).localeCompare(String(right[0])));
    return JSON.stringify({ nodes, edges });
}
export const RUNTIME_G6_LAYOUT_BUDGET_MS = 800;
/** G6 releases a completed layout before its public stop hook becomes a no-op. */
export function stopRuntimeG6Layout(graph) {
    try {
        graph.stopLayout?.();
    }
    catch {
        // The layout has already completed and released its internal instance.
    }
}
/** Bound a force layout even when the renderer's completion promise never settles. */
export async function renderRuntimeG6WithBudget(graph) {
    let timer;
    const budget = new Promise((resolve) => {
        timer = setTimeout(() => {
            stopRuntimeG6Layout(graph);
            resolve();
        }, RUNTIME_G6_LAYOUT_BUDGET_MS);
    });
    await Promise.race([Promise.resolve(graph.render()).then(() => undefined), budget]);
    if (timer !== undefined)
        clearTimeout(timer);
    stopRuntimeG6Layout(graph);
}
function preserveRuntimeG6Positions(graph, data) {
    if (graph.getElementPosition === undefined)
        return data;
    return {
        ...data,
        nodes: data.nodes.map((node) => {
            const position = graph.getElementPosition?.(String(node.id));
            const x = position?.[0];
            const y = position?.[1];
            if (typeof x !== 'number' || typeof y !== 'number' || !Number.isFinite(x) || !Number.isFinite(y))
                return node;
            return { ...node, style: { ...node.style, x, y } };
        }),
    };
}
/**
 * Structural changes run layout; lifecycle-only refreshes draw in place so the viewport never jumps.
 */
export async function syncRuntimeG6Data(graph, data, previousTopology, previousVisual) {
    const topology = runtimeG6TopologyKey(data);
    if (topology !== previousTopology) {
        graph.setData(data);
        await renderRuntimeG6WithBudget(graph);
        return 'render';
    }
    graph.setData(preserveRuntimeG6Positions(graph, data));
    if (runtimeG6VisualKey(data) === previousVisual)
        return 'data';
    await graph.draw();
    return 'draw';
}
//# sourceMappingURL=g6-graph.js.map