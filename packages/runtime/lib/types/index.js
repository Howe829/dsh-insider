/** Read-only Cordis runtime graph and privacy-safe session event trace. */
var __runInitializers = (this && this.__runInitializers) || function (thisArg, initializers, value) {
    var useValue = arguments.length > 2;
    for (var i = 0; i < initializers.length; i++) {
        value = useValue ? initializers[i].call(thisArg, value) : initializers[i].call(thisArg);
    }
    return useValue ? value : void 0;
};
var __esDecorate = (this && this.__esDecorate) || function (ctor, descriptorIn, decorators, contextIn, initializers, extraInitializers) {
    function accept(f) { if (f !== void 0 && typeof f !== "function") throw new TypeError("Function expected"); return f; }
    var kind = contextIn.kind, key = kind === "getter" ? "get" : kind === "setter" ? "set" : "value";
    var target = !descriptorIn && ctor ? contextIn["static"] ? ctor : ctor.prototype : null;
    var descriptor = descriptorIn || (target ? Object.getOwnPropertyDescriptor(target, contextIn.name) : {});
    var _, done = false;
    for (var i = decorators.length - 1; i >= 0; i--) {
        var context = {};
        for (var p in contextIn) context[p] = p === "access" ? {} : contextIn[p];
        for (var p in contextIn.access) context.access[p] = contextIn.access[p];
        context.addInitializer = function (f) { if (done) throw new TypeError("Cannot add initializers after decoration has completed"); extraInitializers.push(accept(f || null)); };
        var result = (0, decorators[i])(kind === "accessor" ? { get: descriptor.get, set: descriptor.set } : descriptor[key], context);
        if (kind === "accessor") {
            if (result === void 0) continue;
            if (result === null || typeof result !== "object") throw new TypeError("Object expected");
            if (_ = accept(result.get)) descriptor.get = _;
            if (_ = accept(result.set)) descriptor.set = _;
            if (_ = accept(result.init)) initializers.unshift(_);
        }
        else if (_ = accept(result)) {
            if (kind === "field") initializers.unshift(_);
            else descriptor[key] = _;
        }
    }
    if (target) Object.defineProperty(target, contextIn.name, descriptor);
    done = true;
};
import { randomUUID } from 'node:crypto';
import z from '@deepseek-ai/schemastery';
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol';
import { RUNTIME_EXPLORER_SCHEMA_VERSION } from "./types.js";
const DEFAULT_TRACE_LIMIT = 256;
const DEFAULT_EFFECT_LIMIT = 12;
const DEFAULT_REFRESH_INTERVAL_MS = 1500;
const DEFAULT_ACTIVITY_WINDOW_MS = 5 * 60 * 1000;
const DEFAULT_ACTIVITY_BUCKET_MS = 10 * 1000;
const DEFAULT_ACTIVITY_TRANSITION_LIMIT = 4096;
const RUNTIME_PROCESS_STATE = Symbol.for('@deepseek-ai/dsh-runtime/process-state');
const LEGACY_PUBLIC_RUNTIME_PROCESS_STATE = Symbol.for('@howardchan/dsh-runtime/process-state');
const CAPABILITIES = {
    fiberInstances: true,
    ownershipEdges: true,
    scopes: false,
    lifecycleTransitions: true,
    turnPluginAttribution: false,
    eventDispatch: 'none',
    payloadCapture: false,
};
function runtimeProcessState(ctx) {
    const root = ctx.root;
    const current = root[RUNTIME_PROCESS_STATE] ?? root[LEGACY_PUBLIC_RUNTIME_PROCESS_STATE];
    if (current !== undefined) {
        if (root[RUNTIME_PROCESS_STATE] === undefined) {
            Object.defineProperty(root, RUNTIME_PROCESS_STATE, { value: current });
        }
        if (root[LEGACY_PUBLIC_RUNTIME_PROCESS_STATE] === undefined) {
            Object.defineProperty(root, LEGACY_PUBLIC_RUNTIME_PROCESS_STATE, { value: current });
        }
        return current;
    }
    const created = {
        bootId: randomUUID(),
        snapshotSeq: 0,
        nextRuntimeId: 0,
        eventCount: 0,
        turnCount: 0,
        errorCount: 0,
        runtimeIds: new WeakMap(),
        nextServiceId: 0,
        serviceIds: new Map(),
    };
    Object.defineProperty(root, RUNTIME_PROCESS_STATE, { value: created });
    if (root[LEGACY_PUBLIC_RUNTIME_PROCESS_STATE] === undefined) {
        Object.defineProperty(root, LEGACY_PUBLIC_RUNTIME_PROCESS_STATE, { value: created });
    }
    return created;
}
/** Resolve only profile facts explicitly published by the current Host. */
function runtimeProfile(ctx) {
    const launchProfile = ctx.get('launchProfile')?.get();
    if (launchProfile !== undefined)
        return launchProfile;
    const desktopProfiles = ctx.get('desktopProfiles');
    return desktopProfiles?.current.name ?? null;
}
function serviceRuntimeId(state, key) {
    const current = state.serviceIds.get(key);
    if (current !== undefined)
        return current;
    const created = `${state.bootId}:service:${++state.nextServiceId}`;
    state.serviceIds.set(key, created);
    return created;
}
function pluginRuntimeId(state, runtime) {
    if (runtime === null)
        return undefined;
    const current = state.runtimeIds.get(runtime);
    if (current !== undefined)
        return current;
    const created = `${state.bootId}:runtime:${++state.nextRuntimeId}`;
    state.runtimeIds.set(runtime, created);
    return created;
}
/** Runtime mirror: FiberState is a cross-package const enum. */
const FIBER_STATE = {
    PENDING: 0,
    LOADING: 1,
    ACTIVE: 2,
    FAILED: 3,
    DISPOSED: 4,
    UNLOADING: 5,
};
/** Complete public projection of Cordis Fiber states. */
const FIBER_PHASE = {
    [FIBER_STATE.PENDING]: 'pending',
    [FIBER_STATE.LOADING]: 'loading',
    [FIBER_STATE.ACTIVE]: 'active',
    [FIBER_STATE.FAILED]: 'failed',
    [FIBER_STATE.DISPOSED]: null,
    [FIBER_STATE.UNLOADING]: 'unloading',
};
const RUNTIME_CATEGORIES = [
    'core', 'agent', 'model', 'tool', 'session', 'interface', 'extension',
];
const STATUS_PRIORITY = {
    disposed: 0,
    failed: 1,
    pending: 2,
    active: 3,
};
function shortLabel(moduleName) {
    const slash = moduleName.lastIndexOf('/');
    const tail = slash < 0 ? moduleName : moduleName.slice(slash + 1);
    return tail.replace(/^dsh-(?:client-ui-|client-|host-)?/, '');
}
function entryNodeId(entryId) {
    return `entry:${entryId}`;
}
function lifecycleStatus(state) {
    if (state === FIBER_STATE.ACTIVE)
        return 'active';
    if (state === FIBER_STATE.FAILED)
        return 'failed';
    if (state === FIBER_STATE.DISPOSED)
        return 'disposed';
    return 'pending';
}
function phaseStatus(phase) {
    if (phase === 'active')
        return 'active';
    if (phase === 'failed')
        return 'failed';
    if (phase === null)
        return 'disposed';
    return 'pending';
}
/** Infer the same stable product domain used by the browser dependency graph. */
function runtimePluginCategory(moduleName, label) {
    const name = `${moduleName} ${label}`.toLowerCase();
    const short = label.toLowerCase();
    if (name.includes('cordis') || ['runtime', 'loader', 'app-boot', 'boot', 'root'].includes(short))
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
function emptyStatusCounts() {
    return { pending: 0, active: 0, disposed: 0, failed: 0 };
}
function summarizeRuntimeCollection(items) {
    const statuses = emptyStatusCounts();
    const categories = new Map();
    for (const item of items) {
        statuses[item.status] += 1;
        const counts = categories.get(item.category) ?? emptyStatusCounts();
        counts[item.status] += 1;
        categories.set(item.category, counts);
    }
    return {
        total: items.length,
        statuses: statuses,
        byType: RUNTIME_CATEGORIES.flatMap((category) => {
            const counts = categories.get(category);
            if (counts === undefined)
                return [];
            const total = counts.pending + counts.active + counts.disposed + counts.failed;
            return [{ category, total, ...counts }];
        }),
    };
}
export function projectServiceOverview(implementations) {
    const registered = implementations.filter(implementation => implementation.fiber.state !== FIBER_STATE.DISPOSED);
    const services = new Map();
    for (const implementation of registered) {
        const status = lifecycleStatus(implementation.fiber.state);
        const moduleName = implementation.fiber.entry?.options.name ?? implementation.fiber.name;
        const item = { category: runtimePluginCategory(moduleName, shortLabel(moduleName)), status };
        const current = services.get(implementation.name);
        if (current === undefined || STATUS_PRIORITY[item.status] > STATUS_PRIORITY[current.status]) {
            services.set(implementation.name, item);
        }
    }
    return {
        ...summarizeRuntimeCollection([...services.values()]),
        implementations: registered.length,
    };
}
function owningEntryId(fiber) {
    let current = fiber;
    while (true) {
        if (current.entry !== undefined)
            return current.entry.id;
        const parent = current.parent.fiber;
        if (parent === current)
            return undefined;
        current = parent;
    }
}
function liveImplementations(ctx) {
    const store = ctx.reflect.store;
    return Object.getOwnPropertySymbols(store)
        .flatMap((key) => {
        const impl = store[key];
        return impl === undefined ? [] : [{ key, name: impl.name, fiber: impl.fiber }];
    });
}
function effectLabels(effects) {
    return effects.flatMap(effect => [effect.label, ...effectLabels(effect.children)]);
}
function effectCount(effects) {
    return effects.reduce((count, effect) => count + 1 + effectCount(effect.children), 0);
}
function liveEffectCountsByEntry(ctx) {
    const counts = new Map();
    for (const runtime of ctx.registry.values()) {
        for (const fiber of runtime.fibers) {
            const entryId = owningEntryId(fiber);
            if (entryId === undefined)
                continue;
            counts.set(entryId, (counts.get(entryId) ?? 0) + effectCount(fiber.getEffects()));
        }
    }
    return counts;
}
/** Project process-lifetime Cordis and Agent counters without exposing payload data. */
function projectRuntimeOverview(ctx, state, graph) {
    const fibers = [...ctx.registry.values()].flatMap(runtime => [...runtime.fibers]);
    const implementations = liveImplementations(ctx);
    const effectsByEntry = liveEffectCountsByEntry(ctx);
    const loaderBreakdown = summarizeRuntimeCollection(graph.nodes.map(node => ({
        category: runtimePluginCategory(node.moduleName, node.label),
        status: phaseStatus(node.phase),
    })));
    const fiberBreakdown = summarizeRuntimeCollection(fibers.map((fiber) => {
        const moduleName = fiber.entry?.options.name ?? fiber.runtime?.name ?? fiber.name;
        return {
            category: runtimePluginCategory(moduleName, shortLabel(moduleName)),
            status: lifecycleStatus(fiber.state),
        };
    }));
    return {
        status: 'running',
        uptimeMs: Math.max(0, Math.floor(process.uptime() * 1000)),
        contexts: fibers.length + 1,
        plugins: ctx.registry.size,
        fibers: fibers.length,
        turns: state.turnCount,
        active: fibers.filter(fiber => fiber.state === FIBER_STATE.ACTIVE).length,
        effects: graph.nodes.reduce((count, node) => count + (effectsByEntry.get(node.entryId) ?? 0), 0),
        events: state.eventCount,
        errors: state.errorCount,
        loaderBreakdown,
        fiberBreakdown,
        serviceBreakdown: projectServiceOverview(implementations),
    };
}
function isErrorEvent(event) {
    if (event.type === 'tool/result')
        return event.data.message.content[0].isError === true;
    return event.type === 'turn/end' && event.data.reason.kind === 'error';
}
/**
 * Build one dependency graph from the current Loader and service stores.
 * @param ctx - Cordis context that owns Loader, Fiber, and service state.
 * @param effectLimit - Maximum effect labels retained on each projected node.
 * @returns A point-in-time graph containing non-group Loader entries and service-derived edges.
 */
export function projectRuntimeGraph(ctx, effectLimit) {
    const processState = runtimeProcessState(ctx);
    const implementations = liveImplementations(ctx);
    const liveFibers = [...ctx.registry.values()].flatMap(runtime => [...runtime.fibers]);
    const implementationByIdentity = new Map(implementations.map(implementation => [
        ctx.reflect.store[implementation.key], implementation,
    ]));
    const providedByEntry = new Map();
    const providedByFiber = new Map();
    for (const impl of implementations) {
        const fiberServices = providedByFiber.get(impl.fiber) ?? [];
        fiberServices.push(impl.name);
        providedByFiber.set(impl.fiber, fiberServices);
        const entryId = owningEntryId(impl.fiber);
        if (entryId === undefined)
            continue;
        const services = providedByEntry.get(entryId) ?? [];
        services.push(impl.name);
        providedByEntry.set(entryId, services);
    }
    const nodes = [];
    const services = [];
    const serviceRelations = [];
    for (const implementation of implementations) {
        const providerEntryId = owningEntryId(implementation.fiber);
        services.push({
            id: serviceRuntimeId(processState, implementation.key),
            name: implementation.name,
            ...(providerEntryId === undefined ? {} : {
                providerNodeId: entryNodeId(providerEntryId),
                providerEntryId,
            }),
            ...(implementation.fiber.uid === null ? {} : {
                providerFiberId: `${processState.bootId}:${implementation.fiber.uid}`,
            }),
            phase: FIBER_PHASE[implementation.fiber.state],
        });
    }
    const serviceById = new Map(services.map(service => [service.id, service]));
    const serviceIdByImplementation = new Map([...implementationByIdentity].flatMap(([identity, implementation]) => identity === undefined
        ? []
        : [[identity, serviceRuntimeId(processState, implementation.key)]]));
    const edgeServices = new Map();
    const loaderEntries = [...ctx.loader.entries()];
    for (const entry of loaderEntries) {
        if (entry.options.group)
            continue;
        const fiber = entry.fiber;
        const injects = fiber === undefined ? [] : Object.keys(fiber.inject);
        const source = entryNodeId(entry.id);
        const missing = [];
        for (const service of injects) {
            const implementation = fiber?.ctx.reflect._getImpl(service, false);
            if (implementation === undefined) {
                missing.push(service);
                continue;
            }
            const serviceNodeId = serviceIdByImplementation.get(implementation);
            const serviceNode = serviceNodeId === undefined ? undefined : serviceById.get(serviceNodeId);
            if (serviceNode === undefined) {
                // A reflected implementation without a projected node would make the
                // snapshot internally inconsistent. It is not evidence that the
                // consumer is missing the service, so keep it out of `missing`.
                continue;
            }
            const target = serviceNode.providerNodeId;
            serviceRelations.push({
                id: `service:${source}->${serviceNode.id}`,
                serviceNodeId: serviceNode.id,
                service,
                consumerNodeId: source,
                ...(target === undefined ? {} : { providerNodeId: target }),
            });
            if (target === undefined || target === source)
                continue;
            const key = `${source}\u0000${target}`;
            const edge = edgeServices.get(key) ?? { source, target, services: [] };
            edge.services.push(service);
            edgeServices.set(key, edge);
        }
        const effects = fiber === undefined ? [] : effectLabels(fiber.getEffects());
        const runtimeId = fiber === undefined ? undefined : pluginRuntimeId(processState, fiber.runtime);
        nodes.push({
            id: source,
            logicalKey: source,
            entryId: entry.id,
            ...(fiber === undefined || fiber.uid === null ? {} : { fiberId: `${processState.bootId}:${fiber.uid}` }),
            ...(runtimeId === undefined ? {} : { runtimeId }),
            moduleName: entry.options.name,
            label: shortLabel(entry.options.name),
            enabled: !entry.disabled,
            phase: fiber === undefined ? null : FIBER_PHASE[fiber.state],
            provides: [...(providedByEntry.get(entry.id) ?? [])].sort(),
            injects,
            missing,
            effects: effects.slice(0, effectLimit),
            effectCount: effects.length,
        });
    }
    const edges = [...edgeServices.values()].map(edge => ({
        id: `injects:${edge.source}->${edge.target}`,
        type: 'injects',
        source: edge.source,
        target: edge.target,
        services: edge.services.sort(),
    }));
    const fibers = liveFibers.flatMap((fiber) => {
        if (fiber.uid === null)
            return [];
        const ownerEntryId = owningEntryId(fiber);
        const ownerNodeId = ownerEntryId === undefined ? undefined : entryNodeId(ownerEntryId);
        const parentFiber = fiber.parent.fiber;
        const parentFiberId = parentFiber.runtime === null || parentFiber.uid === null
            ? undefined
            : `${processState.bootId}:${parentFiber.uid}`;
        const injects = Object.keys(fiber.inject).sort();
        const missing = injects.filter(service => fiber.ctx.reflect._getImpl(service, false) === undefined);
        const runtimeId = pluginRuntimeId(processState, fiber.runtime);
        const moduleName = fiber.entry?.options.name ?? fiber.runtime?.name ?? fiber.name;
        const id = `${processState.bootId}:${fiber.uid}`;
        return [{
                id,
                uid: fiber.uid,
                name: fiber.name,
                moduleName,
                ...(runtimeId === undefined ? {} : { runtimeId }),
                ...(ownerNodeId === undefined ? {} : { ownerNodeId }),
                ...(ownerEntryId === undefined ? {} : { ownerEntryId }),
                ...(parentFiberId === undefined ? {} : { parentFiberId }),
                entryRoot: nodes.some(node => node.id === ownerNodeId && node.fiberId === id),
                phase: FIBER_PHASE[fiber.state],
                provides: [...(providedByFiber.get(fiber) ?? [])].sort(),
                injects,
                missing,
                effectCount: effectCount(fiber.getEffects()),
            }];
    }).sort((left, right) => left.uid - right.uid);
    return {
        nodes,
        edges,
        fibers,
        services: services.sort((left, right) => left.name.localeCompare(right.name) || left.id.localeCompare(right.id)),
        serviceRelations: serviceRelations.sort((left, right) => left.id.localeCompare(right.id)),
    };
}
function projectEffectActivity(graph, currentByEntry, transitions, now, availableSince, windowMs, bucketMs, droppedTransitions, lastDroppedAt) {
    const windowStart = Math.max(availableSince, now - windowMs);
    const visible = transitions.filter(transition => transition.time >= windowStart);
    const rows = new Map();
    for (const node of graph.nodes) {
        rows.set(node.id, {
            pluginId: node.id,
            entryId: node.entryId,
            moduleName: node.moduleName,
            label: node.label,
            current: currentByEntry.get(node.entryId) ?? 0,
            transitions: [],
        });
    }
    for (const transition of visible) {
        const row = rows.get(transition.pluginId) ?? {
            pluginId: transition.pluginId,
            entryId: transition.entryId,
            moduleName: transition.moduleName,
            label: transition.pluginLabel,
            current: 0,
            transitions: [],
        };
        row.transitions.push(transition);
        rows.set(transition.pluginId, row);
    }
    const plugins = [...rows.values()].flatMap((row) => {
        const created = row.transitions.filter(transition => transition.action === 'created').length;
        const disposed = row.transitions.length - created;
        if (row.current === 0 && created === 0 && disposed === 0)
            return [];
        const delta = created - disposed;
        const bucketCount = Math.max(1, Math.ceil((now - windowStart) / bucketMs));
        const buckets = Array.from({ length: bucketCount }, () => ({ created: 0, disposed: 0 }));
        for (const transition of row.transitions) {
            const index = Math.min(bucketCount - 1, Math.floor((transition.time - windowStart) / bucketMs));
            const bucket = buckets[index];
            if (bucket !== undefined)
                bucket[transition.action] += 1;
        }
        let current = Math.max(0, row.current - delta);
        const trend = buckets.map((bucket, index) => {
            current += bucket.created - bucket.disposed;
            return {
                time: Math.min(now, windowStart + (index + 1) * bucketMs),
                current,
                created: bucket.created,
                disposed: bucket.disposed,
            };
        });
        return [{
                pluginId: row.pluginId,
                entryId: row.entryId,
                moduleName: row.moduleName,
                label: row.label,
                current: row.current,
                created,
                disposed,
                delta,
                churn: created + disposed,
                trend,
            }];
    }).sort((left, right) => (right.delta - left.delta
        || right.churn - left.churn
        || right.current - left.current
        || left.label.localeCompare(right.label)));
    const current = plugins.reduce((sum, plugin) => sum + plugin.current, 0);
    const created = visible.filter(transition => transition.action === 'created').length;
    const disposed = visible.length - created;
    return {
        windowMs,
        availableSince,
        complete: lastDroppedAt === undefined || lastDroppedAt < windowStart,
        droppedTransitions,
        current,
        created,
        disposed,
        delta: created - disposed,
        churn: created + disposed,
        plugins,
        recent: [...visible].reverse(),
    };
}
function traceLane(type) {
    if (type === 'user/message')
        return 'user';
    if (type.startsWith('assistant/') || type.startsWith('request/'))
        return 'llm';
    if (type.startsWith('tool/'))
        return 'tool';
    if (type.startsWith('turn/') || type.startsWith('step/'))
        return 'agent';
    return 'session';
}
/**
 * Project one event without retaining model-visible or tool payload content.
 * @param session - Session that owns the event sequence.
 * @param event - Session event whose safe correlation metadata is projected.
 * @returns A trace row that contains no prompt, model output, tool arguments, or tool result content.
 */
export function projectTraceEvent(session, event) {
    const common = {
        id: `${session.id}:${event.seq}`,
        sessionId: String(session.id),
        type: event.type,
        seq: event.seq,
        time: event.time,
        lane: traceLane(event.type),
        payloadChars: JSON.stringify(event.data).length,
    };
    switch (event.type) {
        case 'turn/start':
            return { ...common, turn: event.data.turn };
        case 'turn/end':
            return { ...common, turn: event.data.turn, outcome: event.data.reason.kind };
        case 'step/start':
        case 'step/end':
        case 'assistant/chunk':
        case 'assistant/message':
            return { ...common, turn: event.data.turn, step: event.data.step };
        case 'tool/call':
            return {
                ...common,
                turn: event.data.turn,
                step: event.data.step,
                callId: String(event.data.callId),
                name: event.data.name,
            };
        case 'tool/result':
            return {
                ...common,
                turn: event.data.turn,
                step: event.data.step,
                callId: String(event.data.message.source.callId),
                outcome: event.data.message.content[0].isError ? 'error' : 'success',
            };
        default:
            return common;
    }
}
/** Remote gateway backing the DSH Insider browser plugin. */
let RuntimeExplorerGateway = (() => {
    let _classSuper = TypertRemoteService;
    let _instanceExtraInitializers = [];
    let _snapshot_decorators;
    return class RuntimeExplorerGateway extends _classSuper {
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(_classSuper[Symbol.metadata] ?? null) : void 0;
            _snapshot_decorators = [Remote('snapshot')];
            __esDecorate(this, null, _snapshot_decorators, { kind: "method", name: "snapshot", static: false, private: false, access: { has: obj => "snapshot" in obj, get: obj => obj.snapshot }, metadata: _metadata }, null, _instanceExtraInitializers);
            if (_metadata) Object.defineProperty(this, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        }
        static inject = ['loader'];
        static Config = z.object({
            traceLimit: z.natural().min(1).default(DEFAULT_TRACE_LIMIT),
            effectLimit: z.natural().default(DEFAULT_EFFECT_LIMIT),
            refreshIntervalMs: z.natural().min(250).default(DEFAULT_REFRESH_INTERVAL_MS),
            activityWindowMs: z.natural().min(1000).default(DEFAULT_ACTIVITY_WINDOW_MS),
            activityBucketMs: z.natural().min(250).default(DEFAULT_ACTIVITY_BUCKET_MS),
            activityTransitionLimit: z.natural().min(1).default(DEFAULT_ACTIVITY_TRANSITION_LIMIT),
        });
        resolved = __runInitializers(this, _instanceExtraInitializers);
        trace = [];
        activityStartedAt = Date.now();
        effectOwners = new WeakMap();
        effectTransitions = [];
        nextEffectId = 0;
        nextTransitionId = 0;
        droppedTransitions = 0;
        lastDroppedAt;
        constructor(ctx, config) {
            super(ctx, 'runtimeExplorer');
            this.resolved = config;
            if (this.resolved.activityBucketMs > this.resolved.activityWindowMs) {
                throw new RangeError('activityBucketMs must not exceed activityWindowMs');
            }
            ctx.on('internal/effect', (fiber, effect, action) => {
                this.captureEffectTransition(fiber, effect, action);
            }, { global: true });
            ctx.on('session/event', (session, event) => {
                const processState = runtimeProcessState(ctx);
                processState.eventCount += 1;
                if (event.type === 'turn/start')
                    processState.turnCount += 1;
                if (isErrorEvent(event))
                    processState.errorCount += 1;
                this.trace.push(projectTraceEvent(session, event));
                const overflow = this.trace.length - this.resolved.traceLimit;
                if (overflow > 0)
                    this.trace.splice(0, overflow);
            });
        }
        captureEffectTransition(fiber, effect, action) {
            const now = Date.now();
            let owner = this.effectOwners.get(effect);
            if (action === 'created') {
                const entryId = owningEntryId(fiber);
                if (entryId === undefined)
                    return;
                const entry = [...this.ctx.loader.entries()].find(candidate => candidate.id === entryId);
                if (entry === undefined)
                    return;
                const processState = runtimeProcessState(this.ctx);
                const effectId = `${processState.bootId}:effect:${++this.nextEffectId}`;
                owner = {
                    pluginId: entryNodeId(entryId),
                    entryId,
                    moduleName: entry.options.name,
                    pluginLabel: shortLabel(entry.options.name),
                    ...(fiber.uid === null ? {} : { fiberId: `${processState.bootId}:${fiber.uid}` }),
                    effectId,
                    effectLabel: effect.label,
                    createdAt: now,
                };
                this.effectOwners.set(effect, owner);
            }
            if (owner === undefined)
                return;
            const processState = runtimeProcessState(this.ctx);
            this.effectTransitions.push({
                id: `${processState.bootId}:effect-transition:${++this.nextTransitionId}`,
                effectId: owner.effectId,
                action,
                time: now,
                pluginId: owner.pluginId,
                entryId: owner.entryId,
                moduleName: owner.moduleName,
                pluginLabel: owner.pluginLabel,
                ...(owner.fiberId === undefined ? {} : { fiberId: owner.fiberId }),
                effectLabel: owner.effectLabel,
                ...(action === 'disposed' ? { durationMs: Math.max(0, now - owner.createdAt) } : {}),
            });
            const cutoff = now - this.resolved.activityWindowMs;
            while ((this.effectTransitions[0]?.time ?? Number.POSITIVE_INFINITY) < cutoff) {
                this.effectTransitions.shift();
            }
            const overflow = this.effectTransitions.length - this.resolved.activityTransitionLimit;
            if (overflow > 0) {
                const dropped = this.effectTransitions.splice(0, overflow);
                this.droppedTransitions += dropped.length;
                this.lastDroppedAt = dropped.at(-1)?.time;
            }
        }
        /**
         * Read live Loader state and the bounded event-metadata window.
         * @returns A point-in-time graph and trace containing no message, model-output, tool-argument, or tool-result content.
         */
        snapshot() {
            const processState = runtimeProcessState(this.ctx);
            const graph = projectRuntimeGraph(this.ctx, this.resolved.effectLimit);
            const observedAt = Date.now();
            return {
                schemaVersion: RUNTIME_EXPLORER_SCHEMA_VERSION,
                bootId: processState.bootId,
                snapshotSeq: ++processState.snapshotSeq,
                profile: runtimeProfile(this.ctx),
                observedAt,
                refreshIntervalMs: this.resolved.refreshIntervalMs,
                overview: projectRuntimeOverview(this.ctx, processState, graph),
                effectActivity: projectEffectActivity(graph, liveEffectCountsByEntry(this.ctx), this.effectTransitions, observedAt, this.activityStartedAt, this.resolved.activityWindowMs, this.resolved.activityBucketMs, this.droppedTransitions, this.lastDroppedAt),
                graph,
                trace: [...this.trace],
                capabilities: CAPABILITIES,
                limits: {
                    transitionLimit: this.resolved.activityTransitionLimit,
                    traceEventLimit: this.resolved.traceLimit,
                },
            };
        }
    };
})();
export { RuntimeExplorerGateway };
export default RuntimeExplorerGateway;
//# sourceMappingURL=index.js.map