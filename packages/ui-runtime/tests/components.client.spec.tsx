// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'
import { bindSnapshotSelector } from '@deepseek-ai/dsh-client-test-runtime'
import type { RuntimeExplorerSnapshot } from '@deepseek-ai/dsh-api-remotes/client'
import { RuntimeAction, type RuntimeActionProps } from '../src/client/RuntimeAction.tsx'
import { RuntimeExplorer, type RuntimeExplorerProps } from '../src/client/RuntimeExplorer.tsx'
import { en, zh, type RuntimeLocaleKey } from '../src/client/locales.ts'
import { createRuntimeStore } from '../src/client/store.ts'
import type { RuntimeSourceSnapshot } from '../src/client/source.ts'

const g6State = vi.hoisted(() => ({ instances: [] as Array<{
  options: Record<string, unknown>
  data: { nodes: Array<Record<string, any>>, edges: Array<Record<string, any>> }
  zoom: number
  renderCalls: number
  drawCalls: number
  layoutCalls: number
  stopLayoutCalls: number
  rendererConfigCalls: Array<Record<string, unknown>>
  layerRenderCalls: number
  tooltipHideCalls: number
  translateCalls: Array<{ id: string, position: readonly [number, number] }>
  emit: (name: string, event?: Record<string, unknown>) => void
}> }))

vi.mock('../src/client/g6-runtime.ts', () => {
  class Graph {
    options: Record<string, unknown>
    data: { nodes: Array<Record<string, any>>, edges: Array<Record<string, any>> }
    zoom = 1
    renderCalls = 0
    drawCalls = 0
    layoutCalls = 0
    stopLayoutCalls = 0
    rendererConfigCalls: Array<Record<string, unknown>> = []
    layerRenderCalls = 0
    tooltipHideCalls = 0
    translateCalls: Array<{ id: string, position: readonly [number, number] }> = []
    private readonly events = new Map<string, Array<(...args: any[]) => void>>()

    constructor(options: Record<string, any>) {
      this.options = options
      this.data = options.data
      g6State.instances.push(this)
    }

    setData(data: Graph['data']) { this.data = data }
    async render() { this.renderCalls += 1 }
    async draw() { this.drawCalls += 1 }
    async layout() { this.layoutCalls += 1 }
    stopLayout() { this.stopLayoutCalls += 1 }
    private readonly layer = {
      render: () => { this.layerRenderCalls += 1 },
    }
    getCanvas() {
      return {
        getLayers: () => ({ main: this.layer }),
        getRenderer: () => ({ setConfig: (config: Record<string, unknown>) => { this.rendererConfigCalls.push(config) } }),
      }
    }
    async fitView() {}
    async fitCenter() {}
    resize() {}
    async zoomTo(zoom: number) { this.zoom = zoom }
    getZoom() { return this.zoom }
    getElementPosition(id: string) {
      const node = this.data.nodes.find(item => item.id === id)
      return [node?.style?.x ?? 220, node?.style?.y ?? 240, 0]
    }
    async translateElementTo(id: string, position: readonly [number, number]) {
      this.translateCalls.push({ id, position })
      const node = this.data.nodes.find(item => item.id === id)
      if (node !== undefined) node.style = { ...node.style, x: position[0], y: position[1] }
    }
    on(name: string, handler: (...args: any[]) => void) {
      const handlers = this.events.get(name) ?? []
      handlers.push(handler)
      this.events.set(name, handlers)
    }
    emit(name: string, event: Record<string, unknown> = {}) {
      for (const handler of this.events.get(name) ?? []) handler(event)
    }
    getPluginInstance(key: string) {
      if (key !== 'runtime-tooltip') return undefined
      return { hide: () => { this.tooltipHideCalls += 1 } }
    }
    destroy() {}
  }

  return { loadG6: async () => ({ Graph }) }
})

vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children: ReactNode }) => <div data-testid="responsive-chart">{children}</div>,
  BarChart: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  Bar: ({ dataKey, fill, barSize }: { dataKey: string, fill?: string, barSize?: number }) => <span
    data-bar={dataKey}
    data-fill={fill}
    data-size={barSize}
  />,
  Area: ({ dataKey }: { dataKey: string }) => <span data-area={dataKey} />,
  CartesianGrid: () => <span data-testid="cartesian-grid" />,
  ComposedChart: ({ children, margin }: {
    children: ReactNode
    margin?: { top?: number, right?: number, bottom?: number, left?: number }
  }) => <div data-testid="composed-chart" data-left-margin={margin?.left}>{children}</div>,
  ReferenceLine: ({ y }: { y?: number }) => <span data-testid="reference-line" data-y={y} />,
  XAxis: () => null,
  YAxis: ({ width, tickMargin }: { width?: number, tickMargin?: number }) => <span
    data-testid="y-axis"
    data-width={width}
    data-tick-margin={tickMargin}
  />,
  Tooltip: () => null,
  LineChart: ({ children, margin }: {
    children: ReactNode
    margin?: { top?: number, right?: number, bottom?: number, left?: number }
  }) => <div data-testid="line-chart" data-left-margin={margin?.left}>{children}</div>,
  Line: ({ dataKey }: { dataKey: string }) => <span data-line={dataKey} />,
}))

afterEach(() => {
  cleanup()
  window.localStorage.clear()
  g6State.instances.length = 0
})

const t = ((key: RuntimeLocaleKey): string => en[key]) as RuntimeExplorerProps['t']

const DATA: RuntimeExplorerSnapshot = {
  schemaVersion: 6,
  bootId: 'fixture-boot',
  snapshotSeq: 1,
  profile: 'fixture-web',
  observedAt: 100,
  refreshIntervalMs: 1500,
  overview: {
    status: 'running', uptimeMs: 5_072_000,
    contexts: 12, plugins: 18, fibers: 24, turns: 136,
    active: 3, effects: 31, events: 428, errors: 1,
    loaderBreakdown: {
      total: 18,
      statuses: { pending: 2, active: 14, disposed: 1, failed: 1 },
      byType: [
        { category: 'tool', total: 8, pending: 1, active: 6, disposed: 0, failed: 1 },
        { category: 'agent', total: 6, pending: 1, active: 5, disposed: 0, failed: 0 },
        { category: 'interface', total: 4, pending: 0, active: 3, disposed: 1, failed: 0 },
      ],
    },
    fiberBreakdown: {
      total: 24,
      statuses: { pending: 3, active: 18, disposed: 2, failed: 1 },
      byType: [
        { category: 'tool', total: 12, pending: 2, active: 9, disposed: 0, failed: 1 },
        { category: 'agent', total: 8, pending: 1, active: 6, disposed: 1, failed: 0 },
        { category: 'interface', total: 4, pending: 0, active: 3, disposed: 1, failed: 0 },
      ],
    },
    serviceBreakdown: {
      total: 15,
      implementations: 18,
      statuses: { pending: 2, active: 12, disposed: 0, failed: 1 },
      byType: [
        { category: 'core', total: 6, pending: 0, active: 6, disposed: 0, failed: 0 },
        { category: 'agent', total: 5, pending: 1, active: 3, disposed: 0, failed: 1 },
        { category: 'tool', total: 4, pending: 1, active: 3, disposed: 0, failed: 0 },
      ],
    },
  },
  effectActivity: {
    windowMs: 300_000,
    availableSince: 0,
    complete: true,
    droppedTransitions: 0,
    current: 27,
    created: 145,
    disposed: 118,
    delta: 27,
    churn: 263,
    plugins: [
      {
        pluginId: 'web', entryId: 'web-entry', moduleName: '@fixture/web', label: 'web',
        current: 9, created: 14, disposed: 9, delta: 5, churn: 23,
        trend: [
          { time: 0, current: 4, created: 0, disposed: 0 },
          { time: 50, current: 7, created: 4, disposed: 1 },
          { time: 100, current: 9, created: 3, disposed: 1 },
        ],
      },
      {
        pluginId: 'session', entryId: 'session-entry', moduleName: '@fixture/session', label: 'session',
        current: 7, created: 41, disposed: 39, delta: 2, churn: 80,
        trend: [
          { time: 0, current: 5, created: 0, disposed: 0 },
          { time: 100, current: 7, created: 41, disposed: 39 },
        ],
      },
    ],
    recent: [
      {
        id: 'transition-1', effectId: 'effect-1', action: 'created', time: 100,
        pluginId: 'web', entryId: 'web-entry', moduleName: '@fixture/web', pluginLabel: 'web',
        fiberId: 'fixture-boot:12', effectLabel: 'ctx.on("request")',
      },
    ],
  },
  graph: {
    nodes: [
      {
        id: 'provider', logicalKey: 'provider', entryId: 'provider-entry', moduleName: '@fixture/provider', label: 'provider',
        enabled: true, phase: 'active', provides: ['llm'], injects: [], missing: [],
        effects: ['provide llm'], effectCount: 1,
      },
      {
        id: 'consumer', logicalKey: 'consumer', entryId: 'consumer-entry', moduleName: '@fixture/consumer', label: 'consumer',
        enabled: true, phase: 'pending', provides: [], injects: ['llm', 'tools'], missing: ['tools'],
        effects: [], effectCount: 0,
      },
      {
        id: 'unmounted', logicalKey: 'unmounted', entryId: 'unmounted-entry', moduleName: '@fixture/unmounted', label: 'unmounted',
        enabled: false, phase: null, provides: [], injects: [], missing: [],
        effects: [], effectCount: 0,
      },
    ],
    edges: [{ id: 'injects:consumer->provider', type: 'injects', source: 'consumer', target: 'provider', services: ['llm'] }],
    fibers: [{
      id: 'fixture-boot:41', uid: 41, name: 'nested-tools', moduleName: '@fixture/dsh-tool-nested',
      runtimeId: 'runtime:nested-tools', ownerNodeId: 'provider', ownerEntryId: 'provider-entry',
      parentFiberId: 'fixture-boot:12', entryRoot: false, phase: 'pending',
      provides: [], injects: ['tools'], missing: ['tools'], effectCount: 1,
    }],
    services: [{
      id: 'service-llm', name: 'llm', providerNodeId: 'provider', providerEntryId: 'provider-entry', phase: 'active',
    }],
    serviceRelations: [{
      id: 'service:consumer->service-llm', serviceNodeId: 'service-llm', service: 'llm',
      consumerNodeId: 'consumer', providerNodeId: 'provider',
    }],
  },
  trace: [
    {
      id: 'session:1', sessionId: 'session', type: 'turn/start', seq: 1, time: 100,
      lane: 'agent', payloadChars: 12, turn: 1,
    },
    {
      id: 'session:2', sessionId: 'session', type: 'user/message', seq: 2, time: 105,
      lane: 'user', payloadChars: 42, turn: 1,
    },
    {
      id: 'session:3', sessionId: 'session', type: 'step/start', seq: 3, time: 110,
      lane: 'agent', payloadChars: 16, turn: 1, step: 1,
    },
    {
      id: 'session:4', sessionId: 'session', type: 'tool/call', seq: 4, time: 120,
      lane: 'tool', payloadChars: 80, turn: 1, step: 1, callId: 'call-1', name: 'bash',
    },
    {
      id: 'session:5', sessionId: 'session', type: 'turn/end', seq: 5, time: 150,
      lane: 'agent', payloadChars: 20, turn: 1, outcome: 'completed',
    },
    {
      id: 'session:6', sessionId: 'session', type: 'session/title', seq: 6, time: 160,
      lane: 'session', payloadChars: 30,
    },
    {
      id: 'session-b:1', sessionId: 'session-b', type: 'turn/start', seq: 1, time: 200,
      lane: 'agent', payloadChars: 12, turn: 2,
    },
  ],
  capabilities: {
    fiberInstances: true,
    ownershipEdges: true,
    scopes: false,
    lifecycleTransitions: true,
    turnPluginAttribution: false,
    eventDispatch: 'none',
    payloadCapture: false,
  },
  limits: { transitionLimit: 4096, traceEventLimit: 256 },
}

function sourceHook(snapshot: RuntimeSourceSnapshot) {
  return function useRuntime<S>(selector: (state: RuntimeSourceSnapshot) => S): S { return selector(snapshot) }
}

function explorer(snapshot: RuntimeSourceSnapshot = { data: DATA, loading: false, error: undefined }) {
  const store = createRuntimeStore().create()
  store.actions.setOpen(true)
  const onVisibilityChange = vi.fn()
  const onRefresh = vi.fn()
  const props = {
    useStore: bindSnapshotSelector(store),
    actions: store.actions,
    useRuntime: sourceHook(snapshot),
    onVisibilityChange,
    onRefresh,
    t,
  } as RuntimeExplorerProps
  const view = render(<RuntimeExplorer {...props} />)
  return { store, onVisibilityChange, onRefresh, props, view }
}

describe('RuntimeAction', () => {
  it('uses the finalized DSH Insider and DSH 洞察 brand copy', () => {
    expect(en).toMatchObject({ open: 'Insider', title: 'DSH Insider', close: 'Close DSH Insider' })
    expect(zh).toMatchObject({ open: '洞察', title: 'DSH 洞察', close: '关闭 DSH 洞察' })
  })

  it('opens and closes the shared overlay state from the sidebar row and measures the sidebar edge', () => {
    const store = createRuntimeStore().create()
    const onVisibilityChange = vi.fn()
    const props = {
      wide: true,
      useStore: bindSnapshotSelector(store),
      actions: store.actions,
      onVisibilityChange,
      t,
    } as RuntimeActionProps
    render(<RuntimeAction {...props} />)
    const button = screen.getByRole('button', { name: en.open })
    expect(button.getAttribute('aria-expanded')).toBe('false')
    fireEvent.click(button)
    expect(button.getAttribute('aria-expanded')).toBe('true')
    expect(onVisibilityChange).toHaveBeenLastCalledWith(true)
    expect(store.getSnapshot().sidebarOffset).toBe(12)
    fireEvent.click(button)
    expect(onVisibilityChange).toHaveBeenLastCalledWith(false)
  })

  it('renders the compact rail entry without the text label', () => {
    const store = createRuntimeStore().create()
    const props = {
      wide: false,
      useStore: bindSnapshotSelector(store),
      actions: store.actions,
      onVisibilityChange: vi.fn(),
      t,
    } as RuntimeActionProps
    const view = render(<RuntimeAction {...props} />)
    expect(view.container.querySelector('button span')).toBeNull()
  })
})

describe('RuntimeExplorer', () => {
  it('shows a real Runtime Overview and keeps graph-only controls out of the dashboard', () => {
    const b = explorer()
    fireEvent.click(screen.getByRole('button', { name: 'Overview' }))
    expect(b.store.getSnapshot().tab).toBe('overview')
    expect(screen.getByRole('button', { name: 'Relationship Graph' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: en.overviewTitle })).toBeTruthy()
    expect(within(screen.getByLabelText(en.runtimeStatus)).getByText(en.running)).toBeTruthy()
    expect(screen.getByText('01:24:32')).toBeTruthy()
    const metricsElement = screen.getByLabelText(en.overviewMetrics)
    const metrics = within(metricsElement)
    expect([...metricsElement.children].map(card => card.getAttribute('data-metric'))).toEqual([
      'contexts', 'effects', 'turns', 'events',
    ])
    const contextCard = within(metrics.getByText(en.contexts).parentElement!)
    expect(contextCard.getByText('12')).toBeTruthy()
    const contextComposition = within(contextCard.getByLabelText(en.contextComposition))
    expect(contextComposition.getByText(en.rootContext).nextElementSibling?.textContent).toBe('1')
    expect(contextComposition.getByText(en.fiberContexts).nextElementSibling?.textContent).toBe('11')
    expect(metrics.getByText(en.turns).nextElementSibling?.textContent).toBe('136')
    expect(metrics.getByText(en.effects).nextElementSibling?.textContent).toBe('31')
    expect(metrics.getByText(en.events).nextElementSibling?.textContent).toBe('428')
    const activity = within(screen.getByLabelText(en.pluginActivity))
    expect(activity.getByRole('button', { name: /web/ })).toBeTruthy()
    expect(activity.getByRole('button', { name: /session/ })).toBeTruthy()
    fireEvent.click(activity.getByRole('button', { name: /web/ }))
    expect(screen.getByRole('heading', { name: 'web' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: en.recentEffects })).toBeTruthy()
    expect(screen.getByText('ctx.on("request")')).toBeTruthy()
    expect(screen.getAllByText(en.currentEffects)[0]?.nextElementSibling?.textContent).toBe('9')
    const trendChartElement = screen.getByTestId('composed-chart')
    const trendChart = within(trendChartElement)
    expect(trendChartElement.getAttribute('data-left-margin')).toBe('4')
    expect(trendChart.getAllByTestId('y-axis')[0]?.getAttribute('data-width')).toBe('38')
    expect(trendChart.getAllByTestId('y-axis')[0]?.getAttribute('data-tick-margin')).toBe('7')
    expect(trendChart.getByTestId('cartesian-grid')).toBeTruthy()
    expect(trendChartElement.querySelector('[data-area="current"]')).toBeTruthy()
    expect(trendChartElement.querySelector('[data-bar="created"]')).toBeTruthy()
    expect(trendChartElement.querySelector('[data-bar="disposed"]')?.getAttribute('data-fill')).toBe('var(--dsw-alias-state-warn-primary)')
    expect(trendChartElement.querySelector('[data-bar="disposed"]')?.getAttribute('data-size')).toBe('5')
    expect(trendChart.getByTestId('reference-line').getAttribute('data-y')).toBe('4')
    fireEvent.click(screen.getByRole('button', { name: new RegExp(en.backToActivity) }))
    expect(screen.getByLabelText(en.pluginActivity)).toBeTruthy()
    const loader = within(screen.getByLabelText(en.loaderTitle))
    expect(loader.getByRole('heading', { name: 'Plugins' })).toBeTruthy()
    expect(loader.getByText('18').parentElement?.textContent).toContain(en.pluginsUnit)
    expect(loader.getByLabelText(en.pluginsByType)).toBeTruthy()
    expect(loader.getByText(en.categoryTool)).toBeTruthy()
    expect(loader.getByText(en.categoryAgent)).toBeTruthy()
    const fibers = within(screen.getByLabelText(en.fibers))
    expect(fibers.getByText('24').parentElement?.textContent).toContain(en.fibersUnit)
    expect(fibers.getByLabelText(en.fibersByPluginType)).toBeTruthy()
    const servicesElement = screen.getByLabelText(en.servicesTitle)
    const services = within(servicesElement)
    const serviceHeader = services.getByRole('heading', { name: en.servicesTitle }).parentElement!
    expect(serviceHeader.textContent).toContain(`15 ${en.serviceNamesUnit}`)
    expect(servicesElement.querySelector('dl')).toBeNull()
    const providerStatuses = within(services.getByLabelText(`${en.servicesTitle} ${en.providerFiberStatus}`))
    expect(providerStatuses.getAllByRole('button')).toHaveLength(3)
    expect(providerStatuses.queryByText(en.disposed)).toBeNull()
    expect(services.getByLabelText(en.servicesByProviderType)).toBeTruthy()
    expect(screen.queryByPlaceholderText(en.searchGraph)).toBeNull()
    expect(screen.queryByLabelText(en.allStates)).toBeNull()
    fireEvent.click(loader.getByRole('button', { name: new RegExp(en.failed) }))
    expect(b.store.getSnapshot()).toMatchObject({ tab: 'graph', phase: 'failed', category: 'all' })
  })

  it('replaces an empty lifecycle chart with a stable-current explanation', () => {
    const plugin = DATA.effectActivity.plugins[0]!
    const quietData: RuntimeExplorerSnapshot = {
      ...DATA,
      effectActivity: {
        ...DATA.effectActivity,
        current: plugin.current,
        created: 0,
        disposed: 0,
        delta: 0,
        churn: 0,
        plugins: [{
          ...plugin,
          created: 0,
          disposed: 0,
          delta: 0,
          churn: 0,
          trend: [{ time: 100, current: plugin.current, created: 0, disposed: 0 }],
        }],
        recent: [],
      },
    }
    explorer({ data: quietData, loading: false, error: undefined })
    fireEvent.click(screen.getByRole('button', { name: 'Overview' }))
    fireEvent.click(within(screen.getByLabelText(en.pluginActivity)).getByRole('button', { name: /web/ }))
    expect(screen.getByRole('status').textContent).toContain(en.activityNoChanges.replace('{minutes}', '5'))
    expect(screen.queryByTestId('composed-chart')).toBeNull()
  })

  it('drills a pending Fiber summary into the owning active plugin instead of an empty plugin filter', async () => {
    const b = explorer()
    fireEvent.click(screen.getByRole('button', { name: 'Overview' }))
    const fibers = within(screen.getByLabelText(en.fibers))
    fireEvent.click(fibers.getByRole('button', { name: new RegExp(en.pending) }))

    expect(b.store.getSnapshot()).toMatchObject({
      tab: 'graph', phase: 'pending', category: 'fiber', fiberCategory: 'all',
    })
    expect(screen.queryByText(en.emptyGraph)).toBeNull()
    expect(screen.getByRole('button', { name: /provider/ })).toBeTruthy()
    await screen.findByRole('button', { name: /#41 nested-tools/ })
    await waitFor(() => expect(g6State.instances.length).toBeGreaterThan(0))
    const graph = g6State.instances.at(-1)!
    act(() => { graph.emit('node:click', { target: { id: 'fiber:fixture-boot:41' } }) })

    expect(b.store.getSnapshot().selection).toEqual({ kind: 'fiber', id: 'fixture-boot:41' })
    expect(screen.getByText(en.selectedFiber)).toBeTruthy()
    expect(screen.getByText('provider-entry')).toBeTruthy()
    expect(screen.getByText(en.waitingForServices)).toBeTruthy()
    expect(screen.getAllByText('tools').length).toBeGreaterThanOrEqual(2)
    expect(screen.getByText((_, element) => element?.textContent === `${en.relatedPlugins} 1 / 3`)).toBeTruthy()
    expect(screen.getByText((_, element) => element?.textContent === `${en.relatedFibers} 1 / 1`)).toBeTruthy()
    await waitFor(() => {
      const focusedGraph = g6State.instances.at(-1)!
      expect(focusedGraph.data.nodes.map(node => node.id)).toEqual(expect.arrayContaining([
        'provider', 'fiber:fixture-boot:41', 'missing:fiber:fixture-boot:41:tools',
      ]))
      expect(focusedGraph.data.nodes.map(node => node.id)).not.toContain('consumer')
    })
    expect(g6State.instances).toHaveLength(1)
    expect(g6State.instances[0]).toBe(graph)
    expect(graph.layoutCalls).toBe(0)
  })

  it('keeps G6 automatic rendering enabled so relationship edges survive viewport transforms', async () => {
    const b = explorer()
    expect(screen.getByRole('heading', { name: en.title })).toBeTruthy()
    expect(screen.queryByText('Runtime Explorer')).toBeNull()
    expect(screen.getByLabelText(`${en.currentProfile}: fixture-web`).textContent).toBe('Profilefixture-web')
    expect(screen.getByRole('img', { name: en.graphLabel })).toBeTruthy()
    expect(screen.queryByLabelText(en.pluginSummary)).toBeNull()
    const filter = screen.getByLabelText(en.allStates)
    expect(within(filter).getAllByRole('option').map(option => option.textContent)).toEqual([
      en.allStates, en.pending, en.active, en.disposed, en.failed,
    ])
    await waitFor(() => expect(g6State.instances).toHaveLength(1))
    let graph = g6State.instances[0]!
    expect(graph.stopLayoutCalls).toBeGreaterThan(0)
    expect(graph.rendererConfigCalls).toContainEqual({
      enableAutoRendering: true,
      enableDirtyCheck: true,
      enableRenderingOptimization: true,
    })
    expect(graph.layerRenderCalls).toBeGreaterThan(0)
    expect(graph.data.nodes.map(node => node.id)).not.toContain('missing:consumer:tools')
    const ownsLegend = screen.getByLabelText(en.edgeTypes).querySelector<HTMLElement>('[data-edge-kind="owns"]')!
    const ownsEdge = { id: 'owns:provider->fiber:test', source: 'provider', target: 'fiber:test', data: { kind: 'owns', services: [] } }
    const ownsEdgeStyle = (graph.options.edge as { style: (edge: typeof ownsEdge) => Record<string, unknown> }).style(ownsEdge)
    expect(ownsLegend.style.getPropertyValue('--runtime-edge-color')).toBe(ownsEdgeStyle.stroke)
    fireEvent.click(screen.getByRole('button', { name: /consumer/ }))
    expect(screen.getByText('consumer-entry')).toBeTruthy()
    expect(screen.getByLabelText(`${en.status}: ${en.pending}`)).toBeTruthy()
    expect(screen.getAllByText('tools').length).toBeGreaterThanOrEqual(2)
    expect(screen.getByText(en.missing)).toBeTruthy()
    expect(screen.getByText(en.waitingForServices)).toBeTruthy()
    expect(screen.getByRole('button', { name: /provider/ })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /unmounted/ })).toBeNull()
    expect(screen.getByText(en.focusedNode).parentElement?.textContent).toBe(`${en.focusedNode}consumer`)
    expect(screen.getByText((_, element) => (
      element?.tagName === 'SPAN' && element.textContent === `${en.relatedPlugins} 2 / 3`
    ))).toBeTruthy()
    expect(screen.getByText((_, element) => (
      element?.tagName === 'SPAN' && element.textContent === `${en.relatedServices} 1 / 15`
    ))).toBeTruthy()
    await waitFor(() => expect(g6State.instances).toHaveLength(1))
    expect(g6State.instances[0]).toBe(graph)
    await waitFor(() => expect(graph.data.nodes.map(node => node.id).sort()).toEqual([
      'consumer', 'missing:consumer:tools', 'provider', 'service:service-llm',
    ]))
    expect(graph.layoutCalls).toBe(0)
    expect(graph.data.edges.some(edge => edge.data.services.includes('llm'))).toBe(true)
    expect(screen.getAllByText(en.dependencies)).toHaveLength(1)
    expect(screen.getAllByText(en.dependants)).toHaveLength(1)
    fireEvent.click(screen.getByRole('button', { name: en.closeInspector }))
    expect(screen.queryByText('consumer-entry')).toBeNull()
    expect(screen.getByRole('button', { name: /unmounted/ })).toBeTruthy()

    fireEvent.change(screen.getByPlaceholderText(en.searchGraph), { target: { value: 'provider' } })
    expect(screen.getByRole('button', { name: /provider/ })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /consumer/ })).toBeNull()
    fireEvent.change(screen.getByLabelText(en.allStates), { target: { value: 'pending' } })
    expect(screen.getByText(en.emptyGraph)).toBeTruthy()
    fireEvent.change(screen.getByPlaceholderText(en.searchGraph), { target: { value: '' } })
    fireEvent.change(screen.getByLabelText(en.allStates), { target: { value: 'disposed' } })
    expect(screen.getByRole('button', { name: /unmounted/ })).toBeTruthy()
    act(() => { b.store.actions.setPhase('all'); b.store.actions.setQuery('') })
  })

  it('filters graph nodes by clickable plugin type and toggles the active type off', async () => {
    const snapshot: RuntimeExplorerSnapshot = {
      ...DATA,
      graph: {
        ...DATA.graph,
        nodes: [
          DATA.graph.nodes[0]!,
          {
            ...DATA.graph.nodes[1]!, id: 'tool', logicalKey: 'tool', entryId: 'tool-entry',
            moduleName: '@deepseek-ai/dsh-tool-bash', label: 'tool-bash', phase: 'active', missing: [],
          },
        ],
        edges: [],
      },
    }
    const b = explorer({ data: snapshot, loading: false, error: undefined })
    await waitFor(() => expect(g6State.instances).toHaveLength(1))
    const legend = screen.getByLabelText(en.pluginTypes)
    let toolFilter = within(legend).getByRole('button', { name: en.categoryTool })
    expect(toolFilter.getAttribute('aria-pressed')).toBe('false')

    fireEvent.click(toolFilter)
    expect(b.store.getSnapshot().category).toBe('tool')
    toolFilter = within(screen.getByLabelText(en.pluginTypes)).getByRole('button', { name: en.categoryTool })
    expect(toolFilter.getAttribute('aria-pressed')).toBe('true')
    expect(toolFilter.getAttribute('style')).toContain('--runtime-node-color: #4ade80')
    expect(screen.getByRole('button', { name: /tool-bash/ })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /provider/ })).toBeNull()
    expect(screen.getByText(en.filteredType).parentElement?.textContent).toBe(`${en.filteredType}${en.categoryTool}`)
    expect(screen.getByText((_, element) => (
      element?.tagName === 'SPAN' && element.textContent === `${en.visiblePlugins} 1 / 2`
    ))).toBeTruthy()
    expect(screen.getByRole('button', { name: en.clearTypeFilter })).toBeTruthy()

    fireEvent.change(screen.getByPlaceholderText(en.searchGraph), { target: { value: 'provider' } })
    expect(screen.getByText(en.emptyGraph)).toBeTruthy()
    expect(screen.getByText((_, element) => (
      element?.tagName === 'SPAN' && element.textContent === `${en.visiblePlugins} 0 / 2`
    ))).toBeTruthy()
    fireEvent.change(screen.getByPlaceholderText(en.searchGraph), { target: { value: '' } })
    toolFilter = within(screen.getByLabelText(en.pluginTypes)).getByRole('button', { name: en.categoryTool })
    fireEvent.click(toolFilter)
    expect(b.store.getSnapshot().category).toBe('all')
    expect(screen.getByRole('button', { name: /provider/ })).toBeTruthy()

    const serviceFilter = within(screen.getByLabelText(en.pluginTypes))
      .getByRole('button', { name: en.serviceNode })
    expect(serviceFilter.getAttribute('aria-pressed')).toBe('false')
    fireEvent.click(serviceFilter)
    expect(b.store.getSnapshot().category).toBe('service')
    expect(within(screen.getByLabelText(en.pluginTypes))
      .getByRole('button', { name: en.serviceNode }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByRole('button', { name: /^llm,/ })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /provider/ })).toBeNull()
    expect(screen.getByText(en.filteredType).parentElement?.textContent).toBe(`${en.filteredType}${en.serviceNode}`)
    expect(screen.getByText((_, element) => (
      element?.tagName === 'SPAN' && element.textContent === `${en.visiblePlugins} 1 / 15`
    ))).toBeTruthy()
  })

  it('selects a scoped Service node and focuses its provider plus every consumer', async () => {
    const consumerTwo = {
      ...DATA.graph.nodes[1]!,
      id: 'consumer-two', logicalKey: 'consumer-two', entryId: 'consumer-two-entry',
      moduleName: '@fixture/consumer-two', label: 'consumer-two', phase: 'active' as const,
      injects: ['llm'], missing: [],
    }
    const snapshot: RuntimeExplorerSnapshot = {
      ...DATA,
      graph: {
        ...DATA.graph,
        nodes: [...DATA.graph.nodes, consumerTwo],
        edges: [
          ...DATA.graph.edges,
          { id: 'injects:consumer-two->provider', type: 'injects', source: 'consumer-two', target: 'provider', services: ['llm'] },
        ],
        serviceRelations: [
          ...DATA.graph.serviceRelations,
          {
            id: 'service:consumer-two->service-llm', serviceNodeId: 'service-llm', service: 'llm',
            consumerNodeId: 'consumer-two', providerNodeId: 'provider',
          },
        ],
      },
    }
    const b = explorer({ data: snapshot, loading: false, error: undefined })
    await waitFor(() => expect(g6State.instances).toHaveLength(1))

    fireEvent.change(screen.getByPlaceholderText(en.searchGraph), { target: { value: 'consumer' } })
    fireEvent.click(screen.getByRole('button', { name: /^consumer,/ }))
    const serviceButton = await screen.findByRole('button', { name: /^llm,/ })
    fireEvent.click(serviceButton)

    expect(b.store.getSnapshot().selection).toEqual({ kind: 'service', id: 'service-llm' })
    expect(screen.getByText(en.selectedService)).toBeTruthy()
    expect(screen.getByLabelText(`${en.status}: ${en.active}`)).toBeTruthy()
    expect(screen.getByText(en.focusedService).parentElement?.textContent).toBe(`${en.focusedService}llm`)
    expect(screen.getByText((_, element) => (
      element?.tagName === 'SPAN' && element.textContent === `${en.relatedPlugins} 3 / 4`
    ))).toBeTruthy()
    expect(screen.getByText((_, element) => (
      element?.tagName === 'SPAN' && element.textContent === `${en.relatedServices} 1 / 15`
    ))).toBeTruthy()
    expect(screen.getByText('provider · @fixture/provider')).toBeTruthy()
    expect(screen.getByText('consumer · @fixture/consumer')).toBeTruthy()
    expect(screen.getByText('consumer-two · @fixture/consumer-two')).toBeTruthy()
    expect(screen.queryByLabelText(en.relationDepth)).toBeNull()

    await waitFor(() => expect(g6State.instances).toHaveLength(1))
    const graph = g6State.instances[0]!
    await waitFor(() => expect(graph.data.nodes.map(node => node.id).sort()).toEqual([
      'consumer', 'consumer-two', 'provider', 'service:service-llm',
    ]))
    expect(graph.layoutCalls).toBe(0)
    expect(graph.data.edges.map(edge => edge.id).sort()).toEqual([
      'injects:consumer->service-llm',
      'injects:consumer-two->service-llm',
      'provides:provider->service-llm',
    ])
  })

  it('collapses the Service category to the selected Service and its related plugins', async () => {
    const snapshot: RuntimeExplorerSnapshot = {
      ...DATA,
      graph: {
        ...DATA.graph,
        services: [
          ...DATA.graph.services,
          {
            id: 'service-storage', name: 'storage', providerNodeId: 'unmounted',
            providerEntryId: 'unmounted-entry', phase: 'active',
          },
        ],
      },
    }
    const b = explorer({ data: snapshot, loading: false, error: undefined })
    await waitFor(() => expect(g6State.instances).toHaveLength(1))
    const graph = g6State.instances[0]!

    fireEvent.click(screen.getByRole('button', { name: en.serviceNode, exact: true }))
    await waitFor(() => expect(graph.data.nodes.filter(node => node.id.startsWith('service:')).map(node => node.id).sort())
      .toEqual(['service:service-llm', 'service:service-storage']))

    fireEvent.click(await screen.findByRole('button', { name: /^llm,/ }))

    expect(b.store.getSnapshot().selection).toEqual({ kind: 'service', id: 'service-llm' })
    await waitFor(() => expect(graph.data.nodes.map(node => node.id).sort()).toEqual([
      'consumer', 'provider', 'service:service-llm',
    ]))
    expect(graph.data.nodes.map(node => node.id)).not.toContain('service:service-storage')
    expect(graph.data.edges.map(edge => edge.id).sort()).toEqual([
      'injects:consumer->service-llm', 'provides:provider->service-llm',
    ])
  })

  it('keeps graph selection consistent with search and offers an explicit show-all action', () => {
    const b = explorer()
    fireEvent.click(screen.getByRole('button', { name: /consumer/ }))
    expect(b.store.getSnapshot().selection).toEqual({ kind: 'node', id: 'consumer' })
    fireEvent.click(screen.getByRole('button', { name: en.showAll }))
    expect(b.store.getSnapshot().selection).toBeUndefined()
    expect(screen.getByRole('button', { name: /unmounted/ })).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: /consumer/ }))
    fireEvent.change(screen.getByPlaceholderText(en.searchGraph), { target: { value: 'provider' } })
    expect(b.store.getSnapshot().selection).toBeUndefined()
    expect(screen.queryByText('consumer-entry')).toBeNull()
    expect(screen.queryByRole('button', { name: en.showAll })).toBeNull()
    expect(screen.getByRole('button', { name: /provider/ })).toBeTruthy()
  })

  it('expands focused relationships from one hop to two hops and restores the profile preference', () => {
    const root = {
      ...DATA.graph.nodes[0]!, id: 'root', logicalKey: 'root', entryId: 'root-entry', label: 'root',
      moduleName: '@fixture/root', provides: ['core'], injects: [],
    }
    const provider = { ...DATA.graph.nodes[0]!, injects: ['core'] }
    const leaf = {
      ...DATA.graph.nodes[0]!, id: 'leaf', logicalKey: 'leaf', entryId: 'leaf-entry', label: 'leaf',
      moduleName: '@fixture/leaf', provides: [], injects: ['output'],
    }
    const extended: RuntimeExplorerSnapshot = {
      ...DATA,
      graph: {
        ...DATA.graph,
        nodes: [root, provider, DATA.graph.nodes[1]!, leaf, DATA.graph.nodes[2]!],
        edges: [
          { id: 'injects:provider->root', type: 'injects', source: 'provider', target: 'root', services: ['core'] },
          ...DATA.graph.edges,
          { id: 'injects:leaf->consumer', type: 'injects', source: 'leaf', target: 'consumer', services: ['output'] },
        ],
      },
    }
    const b = explorer({ data: extended, loading: false, error: undefined })
    fireEvent.click(screen.getByRole('button', { name: /consumer/ }))
    expect(screen.queryByRole('button', { name: /root/ })).toBeNull()
    const depth = screen.getByLabelText(en.relationDepth) as HTMLSelectElement
    expect(depth.value).toBe('1')
    fireEvent.change(depth, { target: { value: '2' } })
    expect(screen.getByRole('button', { name: /root/ })).toBeTruthy()
    expect(JSON.parse(window.localStorage.getItem('dsh-runtime:graph-layout:v1:fixture-web') as string))
      .toMatchObject({ neighbourDepth: 2 })

    b.view.unmount()
    const restored = explorer({ data: extended, loading: false, error: undefined })
    fireEvent.click(screen.getByRole('button', { name: /consumer/ }))
    expect((screen.getByLabelText(en.relationDepth) as HTMLSelectElement).value).toBe('2')
    expect(screen.getByRole('button', { name: /root/ })).toBeTruthy()
    restored.view.unmount()
  })

  it('drills from Session-owned Agent Turns into one waterfall and event metadata', () => {
    const b = explorer()
    fireEvent.click(screen.getByRole('button', { name: en.traceTab }))
    const summary = within(screen.getByLabelText(en.traceSummary))
    expect(summary.getByText(en.sessions).nextElementSibling?.textContent).toBe('2')
    expect(summary.getByText(en.agentTurns).nextElementSibling?.textContent).toBe('2')
    expect(summary.getByText(en.runningTurns).nextElementSibling?.textContent).toBe('1')
    expect(screen.getByText(`${en.sessionEvents}: 1`)).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: `${en.turn} 1, ${en.turnCompleted}` }))
    expect(b.store.getSnapshot().traceTurnKey).toBe('session:1')
    expect(screen.getByText(en.laneTool)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /tool\/call/ }))
    expect(screen.getByText('call-1')).toBeTruthy()
    expect(screen.getByText(en.privacy)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: en.closeInspector }))
    expect(screen.getByRole('button', { name: en.backToTurns })).toBeTruthy()
    fireEvent.change(screen.getByPlaceholderText(en.searchTurnTrace), { target: { value: 'missing-event' } })
    expect(screen.getByText(en.emptyTurnTrace)).toBeTruthy()
    fireEvent.change(screen.getByPlaceholderText(en.searchTurnTrace), { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: en.backToTurns }))
    expect(b.store.getSnapshot().traceTurnKey).toBeUndefined()
    fireEvent.change(screen.getByPlaceholderText(en.searchTrace), { target: { value: 'missing-event' } })
    expect(screen.getByText(en.emptyTrace)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: en.graphTab }))
    expect(screen.getByRole('img', { name: en.graphLabel })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: en.refresh }))
    expect(b.onRefresh).toHaveBeenCalledOnce()
    fireEvent.click(screen.getByRole('button', { name: en.close }))
    expect(b.store.getSnapshot().open).toBe(false)
    expect(b.onVisibilityChange).toHaveBeenCalledWith(false)
  })

  it('zooms the G6 graph through proportional steps and resets it', async () => {
    explorer()
    const level = screen.getByLabelText(en.zoomLevel)
    const zoomIn = screen.getByRole<HTMLButtonElement>('button', { name: en.zoomIn })
    const zoomOut = screen.getByRole<HTMLButtonElement>('button', { name: en.zoomOut })
    const fitView = screen.getByRole<HTMLButtonElement>('button', { name: en.fitView })
    expect(level.textContent).toBe('100%')
    expect(zoomIn.querySelector('svg')).toBeTruthy()
    expect(zoomOut.querySelector('svg')).toBeTruthy()
    expect(fitView.querySelector('svg')).toBeTruthy()
    expect(zoomIn.textContent).toBe('')
    expect(zoomOut.textContent).toBe('')
    await waitFor(() => expect(g6State.instances).toHaveLength(1))
    fireEvent.click(zoomIn)
    await waitFor(() => expect(level.textContent).toBe('120%'))
    fireEvent.click(zoomIn)
    await waitFor(() => expect(level.textContent).toBe('144%'))

    fireEvent.click(screen.getByRole('button', { name: en.resetZoom }))
    await waitFor(() => expect(screen.getByLabelText(en.zoomLevel).textContent).toBe('100%'))

    fireEvent.click(screen.getByRole('button', { name: en.zoomOut }))
    await waitFor(() => expect(screen.getByLabelText(en.zoomLevel).textContent).toBe('83%'))

    fireEvent.click(screen.getByRole('button', { name: en.zoomIn }))
    await waitFor(() => expect(screen.getByLabelText(en.zoomLevel).textContent).toBe('100%'))
    fireEvent.click(screen.getByRole('button', { name: en.fitView }))
    await waitFor(() => expect(screen.getByLabelText(en.zoomLevel).textContent).toBe('100%'))
  })

  it('configures G6 canvas panning, wheel zoom, collision, and post-layout node dragging', async () => {
    const b = explorer()
    await waitFor(() => expect(g6State.instances).toHaveLength(1))
    const graph = g6State.instances[0]!
    const options = graph.options as Record<string, any>
    const behaviours = options.behaviors as Array<Record<string, any>>
    expect(behaviours.map(item => item.type)).toEqual(expect.arrayContaining([
      'drag-canvas', 'zoom-canvas', 'drag-element',
    ]))
    expect(behaviours.map(item => item.type)).not.toContain('drag-element-force')
    expect(behaviours.map(item => item.type)).not.toContain('hover-activate')
    expect(behaviours.find(item => item.type === 'drag-element')).toMatchObject({ animation: false })
    expect(options.layout).toMatchObject({
      type: 'd3-force', preventOverlap: true, nodeSpacing: 48, collideStrength: 1, collideIterations: 5,
    })
    expect(options.layout).toMatchObject({ alphaMin: 0.08, alphaDecay: 0.12, alphaTarget: 0 })
    expect(options.edge).toMatchObject({ type: 'line' })
    const nodeStyle = (options.node as Record<string, any>).style(graph.data.nodes[0])
    expect(nodeStyle).toMatchObject({
      labelPlacement: 'center', labelWordWrap: false, icon: false, zIndex: 2,
      badges: [expect.objectContaining({ placement: 'right-top', offsetX: -18, offsetY: 18 })],
    })
    const edgeStyle = (options.edge as Record<string, any>).style
    expect(edgeStyle({
      ...graph.data.edges[0], data: { kind: 'injects', relation: 'dependant', services: ['llm'] },
    })).toMatchObject({ stroke: '#f3a62b', lineDash: [8, 4] })
    expect(edgeStyle({
      id: 'missing', source: 'consumer', target: 'missing:tools',
      data: { kind: 'missing', relation: 'dependency', services: ['tools'] },
    })).toMatchObject({ stroke: '#ff5964', lineDash: [6, 4] })
    expect(screen.getByLabelText(en.pluginTypes).textContent).toContain(en.categoryCore)
    expect(screen.getByLabelText(en.edgeTypes).textContent).toContain(en.edgeInjects)
    expect(screen.getByLabelText(en.edgeTypes).textContent).toContain(en.edgeMissing)
    const tooltip = (options.plugins as Array<Record<string, any>>).find(item => item.key === 'runtime-tooltip')!
    const tooltipCard = tooltip.getContent({}, [graph.data.nodes[0]]) as HTMLElement
    expect(tooltipCard.className).toBe('dsh-insider-g6-tooltip')
    expect(tooltipCard.textContent).toContain(`${en.categoryExtension}${en.active}provider@fixture/provider`)
    expect([...tooltipCard.querySelectorAll('.dsh-insider-g6-tooltip__stat')].map(item => item.textContent)).toEqual([
      `1${en.provides}`, `0${en.injects}`, `0${en.missing}`,
    ])
    expect(tooltip.style['.tooltip']).toMatchObject({ padding: 0, backgroundColor: 'transparent', boxShadow: 'none' })
    act(() => { graph.emit('node:pointerleave') })
    expect(graph.tooltipHideCalls).toBe(1)

    const node = screen.getByRole('button', { name: /provider/ })
    fireEvent.click(node)
    expect(b.store.getSnapshot().selection).toEqual({ kind: 'node', id: 'provider' })
  })

  it('persists a directly dragged node and keeps the graph instance stable across status refresh', async () => {
    const b = explorer()
    await waitFor(() => expect(g6State.instances).toHaveLength(1))
    const graph = g6State.instances[0]!
    const drag = (graph.options as Record<string, any>).behaviors.find(
      (item: Record<string, any>) => item.type === 'drag-element',
    )
    const stopLayoutCallsBeforeDrag = graph.stopLayoutCalls
    const dragged = graph.data.nodes.find(item => item.id === 'provider')!
    dragged.style = { ...dragged.style, x: 220, y: 240 }
    act(() => drag.onFinish(['provider']))
    expect(graph.stopLayoutCalls).toBe(stopLayoutCallsBeforeDrag)
    await waitFor(() => expect(window.localStorage.getItem('dsh-runtime:graph-layout:v1:fixture-web')).not.toBeNull())
    const saved = JSON.parse(window.localStorage.getItem('dsh-runtime:graph-layout:v1:fixture-web') as string)
    expect(saved.positions.provider).toEqual({ x: 220, y: 240, pinned: true })

    const initialRenderCalls = graph.renderCalls
    const initialDrawCalls = graph.drawCalls
    const initialLayerRenderCalls = graph.layerRenderCalls
    b.view.rerender(<RuntimeExplorer
      {...b.props}
      useRuntime={sourceHook({
        data: { ...DATA, snapshotSeq: DATA.snapshotSeq + 1, observedAt: DATA.observedAt + 1_500 },
        loading: false,
        error: undefined,
      })}
    />)
    expect(graph.drawCalls).toBe(initialDrawCalls)

    const refreshed: RuntimeExplorerSnapshot = {
      ...DATA,
      snapshotSeq: DATA.snapshotSeq + 2,
      graph: {
        ...DATA.graph,
        nodes: DATA.graph.nodes.map(item => (
          item.id === 'provider' ? { ...item, phase: 'failed' as const } : { ...item }
        )),
        edges: DATA.graph.edges.map(item => ({ ...item })),
      },
    }
    b.view.rerender(<RuntimeExplorer
      {...b.props}
      useRuntime={sourceHook({ data: refreshed, loading: false, error: undefined })}
    />)
    await waitFor(() => expect(graph.drawCalls).toBeGreaterThan(0))
    expect(graph.layerRenderCalls).toBeGreaterThan(initialLayerRenderCalls)
    expect(g6State.instances).toHaveLength(1)
    expect(graph.renderCalls).toBe(initialRenderCalls)
    expect(graph.data.nodes.find(node => node.id === 'provider')?.data.phase).toBe('failed')
    expect(graph.data.nodes.find(node => node.id === 'provider')?.style).toMatchObject({ x: 220, y: 240 })

    fireEvent.click(screen.getByRole('button', { name: en.resetZoom }))
    await waitFor(() => expect(g6State.instances).toHaveLength(2))
    expect(JSON.parse(window.localStorage.getItem('dsh-runtime:graph-layout:v1:fixture-web') as string).positions)
      .toEqual({})
  })

  it('snaps only a released node away from an overlapping neighbour without restarting layout', async () => {
    explorer()
    await waitFor(() => expect(g6State.instances).toHaveLength(1))
    const graph = g6State.instances[0]!
    const drag = (graph.options as Record<string, any>).behaviors.find(
      (item: Record<string, any>) => item.type === 'drag-element',
    )
    const provider = graph.data.nodes.find(item => item.id === 'provider')!
    const consumer = graph.data.nodes.find(item => item.id === 'consumer')!
    provider.style = { ...provider.style, x: 220, y: 240 }
    consumer.style = { ...consumer.style, x: 220, y: 240 }
    const stopLayoutCallsBeforeDrag = graph.stopLayoutCalls

    act(() => drag.onFinish(['provider']))

    expect(graph.stopLayoutCalls).toBe(stopLayoutCallsBeforeDrag)
    await waitFor(() => expect(graph.translateCalls).toHaveLength(1))
    expect(graph.translateCalls[0]?.id).toBe('provider')
    expect(consumer.style).toMatchObject({ x: 220, y: 240 })
    await waitFor(() => expect(window.localStorage.getItem('dsh-runtime:graph-layout:v1:fixture-web')).not.toBeNull())
    const saved = JSON.parse(window.localStorage.getItem('dsh-runtime:graph-layout:v1:fixture-web') as string)
    expect(saved.positions.provider).toMatchObject({ pinned: true })
    expect(Math.hypot(saved.positions.provider.x - 220, saved.positions.provider.y - 240)).toBeGreaterThan(120)
  })

  it('reconciles a removed selection and clears process-local selection after a boot change', () => {
    const b = explorer()
    fireEvent.click(screen.getByRole('button', { name: /consumer/ }))
    expect(b.store.getSnapshot().selection).toEqual({ kind: 'node', id: 'consumer' })
    const removed: RuntimeExplorerSnapshot = {
      ...DATA,
      snapshotSeq: DATA.snapshotSeq + 1,
      graph: {
        ...DATA.graph,
        nodes: DATA.graph.nodes.filter(node => node.id !== 'consumer'),
        edges: [],
      },
    }
    b.view.rerender(<RuntimeExplorer
      {...b.props}
      useRuntime={sourceHook({ data: removed, loading: false, error: undefined })}
    />)
    expect(b.store.getSnapshot().selection).toBeUndefined()

    fireEvent.click(screen.getByRole('button', { name: /provider/ }))
    expect(b.store.getSnapshot().selection).toEqual({ kind: 'node', id: 'provider' })
    b.view.rerender(<RuntimeExplorer
      {...b.props}
      useRuntime={sourceHook({ data: { ...removed, bootId: 'next-boot' }, loading: false, error: undefined })}
    />)
    expect(b.store.getSnapshot().selection).toBeUndefined()
  })

  it('shows loading and retryable failure states without exposing transport details', () => {
    const loading = explorer({ data: undefined, loading: true, error: undefined })
    expect(screen.getByText(en.loadingSnapshot)).toBeTruthy()
    loading.view.unmount()

    const failed = explorer({ data: undefined, loading: false, error: 'private wire detail' })
    expect(screen.getByText(en.loadFailed)).toBeTruthy()
    expect(screen.queryByText('private wire detail')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: en.retry }))
    expect(failed.onRefresh).toHaveBeenCalledOnce()
  })

  it('renders nothing while closed', () => {
    const store = createRuntimeStore().create()
    const props = {
      useStore: bindSnapshotSelector(store),
      actions: store.actions,
      useRuntime: sourceHook({ data: DATA, loading: false, error: undefined }),
      onVisibilityChange: vi.fn(),
      onRefresh: vi.fn(),
      t,
    } as RuntimeExplorerProps
    const view = render(<RuntimeExplorer {...props} />)
    expect(view.container.childElementCount).toBe(0)
  })
})
