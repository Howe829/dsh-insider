/** Shared viewing state for the sidebar action and frame overlay. */
import { defineStore } from '@deepseek-ai/dsh-client-runtime/client';
/**
 * Create the root-scoped store shared by both DSH Insider slot entries.
 * @returns A store handle whose action and overlay adapters share one state instance.
 */
export function createRuntimeStore() {
    return defineStore({
        init: () => ({
            open: false,
            tab: 'graph',
            query: '',
            phase: 'all',
            category: 'all',
            fiberCategory: 'all',
            selection: undefined,
            traceTurnKey: undefined,
            sidebarOffset: 0,
        }),
        actions: {
            setOpen: (draft, open) => { draft.open = open; },
            setTab: (draft, tab) => {
                draft.tab = tab;
                draft.selection = undefined;
                draft.traceTurnKey = undefined;
                draft.query = '';
                draft.category = 'all';
                draft.fiberCategory = 'all';
            },
            setQuery: (draft, query) => {
                draft.query = query;
                draft.selection = undefined;
            },
            setPhase: (draft, phase) => {
                draft.phase = phase;
                draft.selection = undefined;
            },
            setCategory: (draft, category) => {
                draft.category = category;
                if (category !== 'fiber')
                    draft.fiberCategory = 'all';
                draft.selection = undefined;
            },
            setFiberCategory: (draft, category) => {
                draft.fiberCategory = category;
                draft.selection = undefined;
            },
            select: (draft, selection) => { draft.selection = selection; },
            selectTraceTurn: (draft, key) => {
                draft.traceTurnKey = key;
                draft.selection = undefined;
                draft.query = '';
            },
            setSidebarOffset: (draft, px) => { draft.sidebarOffset = px; },
        },
    });
}
//# sourceMappingURL=store.js.map