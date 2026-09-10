/** Shared viewing state for the sidebar action and frame overlay. */

import { defineStore, type EngineStoreHandle } from '@deepseek-ai/dsh-client-store'
import type { RuntimePluginCategory } from '@deepseek-ai/dsh-api-remotes/client'
import type { RuntimeLifecycleStatus } from './graph.ts'
import type { RuntimeG6NodeCategory } from './g6-graph.ts'

/** Explorer tab selected by the user. */
export type RuntimeTab = 'overview' | 'graph' | 'trace'
/** Client-side filter over the four product-facing lifecycle states. */
export type RuntimePhaseFilter = RuntimeLifecycleStatus | 'all'
/** Client-side filter over inferred plugin roles or concrete Service nodes. */
export type RuntimeCategoryFilter = Exclude<RuntimeG6NodeCategory, 'missing'> | 'all'
/** Current plugin, exact scoped Service implementation, or trace-event inspector selection. */
export type RuntimeSelection = { kind: 'node' | 'fiber' | 'service' | 'event'; id: string }

/** Root-scoped view state shared by the sidebar action and overlay. */
export interface RuntimeStoreState {
  open: boolean
  tab: RuntimeTab
  query: string
  phase: RuntimePhaseFilter
  category: RuntimeCategoryFilter
  fiberCategory: RuntimePluginCategory | 'all'
  selection: RuntimeSelection | undefined
  traceTurnKey: string | undefined
  sidebarOffset: number
}

type RuntimeStoreActions = {
  setOpen: (draft: RuntimeStoreState, open: boolean) => void
  setTab: (draft: RuntimeStoreState, tab: RuntimeTab) => void
  setQuery: (draft: RuntimeStoreState, query: string) => void
  setPhase: (draft: RuntimeStoreState, phase: RuntimePhaseFilter) => void
  setCategory: (draft: RuntimeStoreState, category: RuntimeCategoryFilter) => void
  setFiberCategory: (draft: RuntimeStoreState, category: RuntimePluginCategory | 'all') => void
  select: (draft: RuntimeStoreState, selection?: RuntimeSelection) => void
  selectTraceTurn: (draft: RuntimeStoreState, key?: string) => void
  setSidebarOffset: (draft: RuntimeStoreState, px: number) => void
}

/**
 * Create the root-scoped store shared by both DSH Insider slot entries.
 * @returns A store handle whose action and overlay adapters share one state instance.
 */
export function createRuntimeStore(): EngineStoreHandle<RuntimeStoreState, RuntimeStoreActions> {
  return defineStore({
    init: (): RuntimeStoreState => ({
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
      setOpen: (draft, open: boolean) => { draft.open = open },
      setTab: (draft, tab: RuntimeTab) => {
        draft.tab = tab
        draft.selection = undefined
        draft.traceTurnKey = undefined
        draft.query = ''
        draft.category = 'all'
        draft.fiberCategory = 'all'
      },
      setQuery: (draft, query: string) => {
        draft.query = query
        draft.selection = undefined
      },
      setPhase: (draft, phase: RuntimePhaseFilter) => {
        draft.phase = phase
        draft.selection = undefined
      },
      setCategory: (draft, category: RuntimeCategoryFilter) => {
        draft.category = category
        if (category !== 'fiber') draft.fiberCategory = 'all'
        draft.selection = undefined
      },
      setFiberCategory: (draft, category: RuntimePluginCategory | 'all') => {
        draft.fiberCategory = category
        draft.selection = undefined
      },
      select: (draft, selection?: RuntimeSelection) => { draft.selection = selection },
      selectTraceTurn: (draft, key?: string) => {
        draft.traceTurnKey = key
        draft.selection = undefined
        draft.query = ''
      },
      setSidebarOffset: (draft, px: number) => { draft.sidebarOffset = px },
    },
  })
}
