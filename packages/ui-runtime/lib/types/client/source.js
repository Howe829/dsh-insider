/** Observable Remote snapshot with single-flight refresh and open-only polling. */
const SUPPORTED_SCHEMA_VERSION = 6;
const IDLE_BACKOFF_AFTER_POLLS = 2;
const DEEP_IDLE_BACKOFF_AFTER_POLLS = 4;
const IDLE_BACKOFF_MULTIPLIER = 2;
const DEEP_IDLE_BACKOFF_MULTIPLIER = 4;
function activityTruthKey(activity) {
    const { plugins, ...summary } = activity;
    return JSON.stringify({
        ...summary,
        plugins: plugins.map(({ trend: _trend, ...plugin }) => plugin),
    });
}
/**
 * Preserve large immutable section identities between polls and derive a key that
 * ignores clock-only fields. This keeps a healthy poll from rebuilding the G6
 * projection when runtime topology and lifecycle truth did not change.
 */
function stabilizeRuntimeSnapshot(data, cache) {
    const graphKey = JSON.stringify(data.graph);
    const traceKey = JSON.stringify(data.trace);
    // Trend point timestamps advance with the observation clock even when no
    // lifecycle transition occurred. Excluding the derived trend keeps that
    // clock drift from defeating idle backoff; aggregate/plugin truth and the
    // bounded recent-transition list still invalidate the cache immediately.
    const activityKey = activityTruthKey(data.effectActivity);
    const overviewKey = JSON.stringify({ ...data.overview, uptimeMs: 0 });
    const unchanged = overviewKey === cache.overviewKey
        && graphKey === cache.graphKey
        && traceKey === cache.traceKey
        && activityKey === cache.activityKey;
    const graph = graphKey === cache.graphKey && cache.graph !== undefined ? cache.graph : data.graph;
    const trace = traceKey === cache.traceKey && cache.trace !== undefined ? cache.trace : data.trace;
    const effectActivity = activityKey === cache.activityKey && cache.activity !== undefined
        ? cache.activity
        : data.effectActivity;
    cache.overviewKey = overviewKey;
    cache.graphKey = graphKey;
    cache.graph = graph;
    cache.traceKey = traceKey;
    cache.trace = trace;
    cache.activityKey = activityKey;
    cache.activity = effectActivity;
    if (graph === data.graph && trace === data.trace && effectActivity === data.effectActivity) {
        return { data, unchanged };
    }
    return { data: { ...data, graph, trace, effectActivity }, unchanged };
}
function idlePollMultiplier(stablePolls) {
    if (stablePolls >= DEEP_IDLE_BACKOFF_AFTER_POLLS)
        return DEEP_IDLE_BACKOFF_MULTIPLIER;
    if (stablePolls >= IDLE_BACKOFF_AFTER_POLLS)
        return IDLE_BACKOFF_MULTIPLIER;
    return 1;
}
/**
 * Build the browser source over the generated Remote call.
 * @param read - Invoke the mounted runtimeExplorer snapshot Remote.
 * @param onError - Report a failed read without exposing transport detail in product copy.
 * @returns An observable source with single-flight refresh and visible-only polling.
 */
export function createRuntimeSource(read, onError) {
    const listeners = new Set();
    let snapshot = { data: undefined, loading: false, error: undefined };
    let inFlight;
    let timer;
    let active = false;
    let disposed = false;
    let stablePolls = 0;
    const stableSections = {};
    const publish = (next) => {
        snapshot = next;
        for (const listener of [...listeners])
            listener();
    };
    const clearTimer = () => {
        if (timer !== undefined)
            clearTimeout(timer);
        timer = undefined;
    };
    const schedule = (delay) => {
        clearTimer();
        if (!active || disposed)
            return;
        timer = setTimeout(() => { source.refresh(); }, delay);
    };
    const source = {
        getSnapshot: () => snapshot,
        subscribe: (listener) => {
            listeners.add(listener);
            return () => { listeners.delete(listener); };
        },
        refresh: () => {
            if (disposed || inFlight !== undefined)
                return;
            if (snapshot.data === undefined || snapshot.error !== undefined) {
                publish({ ...snapshot, loading: snapshot.data === undefined, error: undefined });
            }
            inFlight = read().then((data) => {
                if (disposed)
                    return;
                if (data.schemaVersion !== SUPPORTED_SCHEMA_VERSION) {
                    const error = new Error('unsupported runtime snapshot schema');
                    onError(error);
                    publish({ ...snapshot, loading: false, error: error.message });
                    return;
                }
                const stabilized = stabilizeRuntimeSnapshot(data, stableSections);
                stablePolls = stabilized.unchanged ? stablePolls + 1 : 0;
                publish({ data: stabilized.data, loading: false, error: undefined });
                schedule(data.refreshIntervalMs * idlePollMultiplier(stablePolls));
            }, (error) => {
                if (disposed)
                    return;
                onError(error);
                publish({ ...snapshot, loading: false, error: error instanceof Error ? error.message : 'runtime snapshot failed' });
            }).then(() => { inFlight = undefined; });
        },
        setActive: (next) => {
            active = next;
            if (active) {
                stablePolls = 0;
                source.refresh();
            }
            else
                clearTimer();
        },
        dispose: () => {
            disposed = true;
            active = false;
            clearTimer();
            listeners.clear();
        },
    };
    return source;
}
//# sourceMappingURL=source.js.map