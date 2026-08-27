/** Runtime graph, request trace, filters, and metadata inspector. */

import { useEffect, useMemo, useRef, useState } from 'react'
import clsx from 'clsx'
import { ArrowLeftIcon, ChevronRightIcon, Squares2X2Icon } from '@heroicons/react/24/outline'
import type {
  RuntimeFiberPhase, RuntimeGraphEdge, RuntimeGraphNode, RuntimeGraphServiceNode,
  RuntimeGraphServiceRelation, RuntimeGraphSnapshot, RuntimeTraceEvent, RuntimeTraceLane,
} from '@deepseek-ai/dsh-api-remotes/client'
import {
  IconBranchOutline16, IconCloseOutline16, IconCordisPluginOutline14, IconDataOutline16, IconRefreshOutline16,
  IconSearchOutline16, Tooltip,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime, PropsStore } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type { RuntimeExplorerFace } from './faces.ts'
import { focusRuntimeGraph, runtimeGraphRelations, runtimeLifecycleStatus } from './graph.ts'
import { RuntimeGraphCanvas } from './RuntimeGraphCanvas.tsx'
import { RuntimeOverview } from './RuntimeOverview.tsx'
import { runtimeG6NodeCategory, type RuntimeG6Focus } from './g6-graph.ts'
import type { RuntimeGraphNeighbourDepth, RuntimeGraphRelations, RuntimeGraphSavedPositions } from './graph.ts'
import { pruneGraphLayout, readGraphPresentation, writeGraphLayout } from './graph-persistence.ts'
import type { RuntimeLocaleKey } from './locales.ts'
import type { createRuntimeStore, RuntimeCategoryFilter, RuntimePhaseFilter } from './store.ts'
import { filterRuntimeTrace, groupRuntimeTrace, type RuntimeTraceSession, type RuntimeTraceTurn } from './trace.ts'
import css from './RuntimeExplorer.module.css'

type RuntimeGraphFiberNode = RuntimeGraphSnapshot['fibers'][number]

export type RuntimeExplorerProps =
  & PropsRuntime<'shell.overlay'>
  & PropsStore<ReturnType<typeof createRuntimeStore>>
  & InjectFace<RuntimeExplorerFace>
  & PropsLocale<'runtime'>

const STATUS_LABELS = {
  pending: 'pending',
  active: 'active',
  disposed: 'disposed',
  failed: 'failed',
} as const satisfies Record<Exclude<RuntimePhaseFilter, 'all'>, RuntimeLocaleKey>

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
} as const satisfies Record<Exclude<RuntimeCategoryFilter, 'all'>, RuntimeLocaleKey>

const LANE_LABELS = {
  user: 'laneUser',
  agent: 'laneAgent',
  llm: 'laneLlm',
  tool: 'laneTool',
  session: 'laneSession',
} as const satisfies Record<RuntimeTraceLane, RuntimeLocaleKey>

const TURN_STATUS_LABELS = {
  running: 'turnRunning',
  completed: 'turnCompleted',
  failed: 'turnFailed',
  stopped: 'turnStopped',
  incomplete: 'turnIncomplete',
} as const satisfies Record<RuntimeTraceTurn['status'], RuntimeLocaleKey>

function statusKey(phase: RuntimeFiberPhase): Exclude<RuntimePhaseFilter, 'all'> {
  return runtimeLifecycleStatus(phase)
}

function includesNode(node: RuntimeGraphNode, query: string): boolean {
  if (query === '') return true
  const text = [node.label, node.moduleName, node.entryId, ...node.provides, ...node.injects].join('\n').toLowerCase()
  return text.includes(query)
}

function includesService(service: RuntimeGraphServiceNode, query: string): boolean {
  if (query === '') return true
  return [service.name, service.id, service.providerEntryId, service.providerFiberId]
    .filter(value => value !== undefined)
    .join('\n').toLowerCase().includes(query)
}

function includesFiber(fiber: RuntimeGraphFiberNode, query: string): boolean {
  if (query === '') return true
  return [
    fiber.name, fiber.moduleName, fiber.id, fiber.ownerEntryId, fiber.parentFiberId,
    ...fiber.provides, ...fiber.injects, ...fiber.missing,
  ].filter(value => value !== undefined).join('\n').toLowerCase().includes(query)
}

function includesEvent(event: RuntimeTraceEvent, query: string): boolean {
  if (query === '') return true
  return [event.type, event.sessionId, event.name, event.callId, event.outcome]
    .filter(value => value !== undefined)
    .join('\n').toLowerCase().includes(query)
}

function shortSessionId(sessionId: string): string {
  if (sessionId.length <= 18) return sessionId
  return `${sessionId.slice(0, 10)}…${sessionId.slice(-4)}`
}

function formatDuration(durationMs: number): string {
  if (durationMs < 1000) return `${durationMs} ms`
  if (durationMs < 10_000) return `${(durationMs / 1000).toFixed(1)} s`
  return `${Math.round(durationMs / 1000)} s`
}

function graphEdgesFor(nodes: readonly RuntimeGraphNode[], edges: readonly RuntimeGraphEdge[]): RuntimeGraphEdge[] {
  const ids = new Set(nodes.map(node => node.id))
  return edges.filter(edge => ids.has(edge.source) && ids.has(edge.target))
}

function MetadataList({ values, empty }: { values: readonly string[]; empty: string }) {
  if (values.length === 0) return <span className={css.emptyValue}>{empty}</span>
  return <div className={css.chips}>{values.map(value => <code key={value}>{value}</code>)}</div>
}

function GraphView({
  nodes, allNodes, edges, allEdges, fibers, allFibers, services, serviceRelations, totalNodes, totalFibers, totalServices,
  graphFocus, focusLabel, onSelect, onClearSelection,
  categoryFilter, onCategoryFilterChange, empty, graphLabel, phaseLabel, profile, t,
}: {
  nodes: readonly RuntimeGraphNode[]
  allNodes: readonly RuntimeGraphNode[]
  edges: readonly RuntimeGraphEdge[]
  allEdges: readonly RuntimeGraphEdge[]
  fibers: readonly RuntimeGraphFiberNode[]
  allFibers: readonly RuntimeGraphFiberNode[]
  services: readonly RuntimeGraphServiceNode[]
  serviceRelations: readonly RuntimeGraphServiceRelation[]
  totalNodes: number
  totalFibers: number
  totalServices: number
  graphFocus: RuntimeG6Focus | undefined
  focusLabel: string | undefined
  onSelect: (focus: RuntimeG6Focus) => void
  onClearSelection: () => void
  categoryFilter: RuntimeCategoryFilter
  onCategoryFilterChange: (category: RuntimeCategoryFilter) => void
  empty: string
  graphLabel: string
  phaseLabel: (phase: RuntimeFiberPhase) => string
  profile: string | null | undefined
  t: RuntimeExplorerProps['t']
}) {
  const initialPresentation = useRef(readGraphPresentation(profile))
  const [savedPositions, setSavedPositions] = useState<RuntimeGraphSavedPositions>(initialPresentation.current.positions)
  const [neighbourDepth, setNeighbourDepth] = useState<RuntimeGraphNeighbourDepth>(
    initialPresentation.current.neighbourDepth,
  )
  const [canvasRevision, setCanvasRevision] = useState(0)
  const layoutScopeKey = allNodes.map(node => node.logicalKey).sort().join('|')
  const selectedPluginId = graphFocus?.kind === 'plugin' ? graphFocus.id : undefined
  const selectedFiberId = graphFocus?.kind === 'fiber' ? graphFocus.id : undefined
  const selectedServiceId = graphFocus?.kind === 'service' ? graphFocus.id : undefined
  const selectedFiberOwnerId = selectedFiberId === undefined
    ? undefined
    : allFibers.find(fiber => fiber.id === selectedFiberId)?.ownerNodeId
  const selectedService = selectedServiceId === undefined
    ? undefined
    : services.find(service => service.id === selectedServiceId)
  const selectedServiceRelations = useMemo(
    () => selectedServiceId === undefined
      ? []
      : serviceRelations.filter(relation => relation.serviceNodeId === selectedServiceId),
    [selectedServiceId, serviceRelations],
  )
  const focus = useMemo(() => {
    if (selectedFiberId !== undefined) {
      const ownerNodes = selectedFiberOwnerId === undefined
        ? []
        : allNodes.filter(node => node.id === selectedFiberOwnerId)
      return { nodes: ownerNodes, edges: [] }
    }
    if (selectedService === undefined) {
      const sourceNodes = selectedPluginId === undefined ? nodes : allNodes
      const sourceEdges = selectedPluginId === undefined ? edges : allEdges
      return focusRuntimeGraph(sourceNodes, sourceEdges, selectedPluginId, neighbourDepth)
    }
    const relatedIds = new Set([
      ...(selectedService.providerNodeId === undefined ? [] : [selectedService.providerNodeId]),
      ...selectedServiceRelations.map(relation => relation.consumerNodeId),
    ])
    const relatedNodes = allNodes.filter(node => relatedIds.has(node.id))
    return { nodes: relatedNodes, edges: graphEdgesFor(relatedNodes, allEdges) }
  }, [
    allEdges, allNodes, edges, neighbourDepth, nodes, selectedFiberId, selectedFiberOwnerId,
    selectedPluginId, selectedService, selectedServiceRelations,
  ])
  const visibleFibers = useMemo(() => {
    if (selectedPluginId !== undefined) return allFibers.filter(fiber => fiber.ownerNodeId === selectedPluginId)
    if (selectedFiberId !== undefined) {
      const selected = allFibers.find(fiber => fiber.id === selectedFiberId)
      return selected === undefined
        ? []
        : selected.ownerNodeId === undefined
          ? [selected]
          : allFibers.filter(fiber => fiber.ownerNodeId === selected.ownerNodeId)
    }
    if (categoryFilter === 'fiber') return fibers
    return []
  }, [allFibers, categoryFilter, fibers, selectedFiberId, selectedPluginId])
  const relations = useMemo(
    (): RuntimeGraphRelations => {
      if (selectedService === undefined) {
        return runtimeGraphRelations(focus.nodes, focus.edges, selectedPluginId)
      }
      const nodeRelations = new Map<string, 'dependency' | 'dependant' | 'both'>()
      if (selectedService.providerNodeId !== undefined) {
        nodeRelations.set(selectedService.providerNodeId, 'dependency')
      }
      for (const relation of selectedServiceRelations) {
        const current = nodeRelations.get(relation.consumerNodeId)
        nodeRelations.set(relation.consumerNodeId, current === 'dependency' ? 'both' : 'dependant')
      }
      return { nodes: nodeRelations, edges: new Map() }
    },
    [focus.edges, focus.nodes, selectedPluginId, selectedService, selectedServiceRelations],
  )
  const visibleNodeIds = useMemo(() => new Set(focus.nodes.map(node => node.id)), [focus.nodes])
  const visibleServiceCount = useMemo(() => {
    if (selectedService !== undefined) return 1
    if (selectedPluginId === undefined) return 0
    return new Set(
      serviceRelations
        .filter((relation) => {
          const related = relation.consumerNodeId === selectedPluginId || relation.providerNodeId === selectedPluginId
          const providerVisible = relation.providerNodeId === undefined || visibleNodeIds.has(relation.providerNodeId)
          return related && visibleNodeIds.has(relation.consumerNodeId) && providerVisible
        })
        .map(relation => relation.serviceNodeId),
    ).size
  }, [selectedPluginId, selectedService, serviceRelations, visibleNodeIds])

  useEffect(() => {
    const presentation = readGraphPresentation(profile)
    const pruned = pruneGraphLayout(presentation.positions, allNodes)
    setSavedPositions(pruned)
    setNeighbourDepth(presentation.neighbourDepth)
    writeGraphLayout(profile, pruned, presentation.neighbourDepth)
    setCanvasRevision(current => current + 1)
  }, [profile, layoutScopeKey])

  const persistPositions = (positions: RuntimeGraphSavedPositions): void => {
    setSavedPositions(positions)
    writeGraphLayout(profile, positions, neighbourDepth)
  }
  const changeNeighbourDepth = (next: RuntimeGraphNeighbourDepth): void => {
    setNeighbourDepth(next)
    writeGraphLayout(profile, savedPositions, next)
  }
  const resetGraph = (): void => {
    setSavedPositions({})
    setNeighbourDepth(1)
    writeGraphLayout(profile, {}, 1)
    setCanvasRevision(current => current + 1)
  }
  const filteredItemCount = categoryFilter === 'service'
    ? services.length
    : categoryFilter === 'fiber' ? fibers.length : nodes.length
  const totalItemCount = categoryFilter === 'service'
    ? totalServices
    : categoryFilter === 'fiber' ? totalFibers : totalNodes
  const hasVisibleItems = categoryFilter === 'service'
    ? services.length > 0
    : categoryFilter === 'fiber' ? visibleFibers.length > 0 : focus.nodes.length > 0
  return (
    <div className={css.graphView}>
      {graphFocus !== undefined && focusLabel !== undefined && (
        <div className={css.focusBar} role="status" aria-live="polite">
          <span className={css.focusIdentity}>
            <span>{t(graphFocus.kind === 'service'
              ? 'focusedService'
              : graphFocus.kind === 'fiber' ? 'focusedFiber' : 'focusedNode')}</span>
            <strong>{focusLabel}</strong>
          </span>
          <span className={css.focusCount}>{t('relatedPlugins')} <strong>{focus.nodes.length}</strong> / {totalNodes}</span>
          <span className={css.focusCount}>{t('relatedServices')} <strong>{visibleServiceCount}</strong> / {totalServices}</span>
          <span className={css.focusCount}>{t('relatedFibers')} <strong>{visibleFibers.length}</strong> / {totalFibers}</span>
          {graphFocus.kind === 'plugin' && <label className={css.depthFilter}>
            <span>{t('relationDepth')}</span>
            <select
              aria-label={t('relationDepth')}
              value={String(neighbourDepth)}
              onChange={(event) => {
                const value = event.target.value
                changeNeighbourDepth(value === 'all' ? 'all' : value === '2' ? 2 : 1)
              }}
            >
              <option value="1">{t('oneHop')}</option>
              <option value="2">{t('twoHops')}</option>
              <option value="all">{t('connectedGraph')}</option>
            </select>
          </label>}
          <button type="button" className={css.showAll} onClick={onClearSelection}>{t('showAll')}</button>
        </div>
      )}
      {graphFocus === undefined && categoryFilter !== 'all' && (
        <div className={css.focusBar} role="status" aria-live="polite">
          <span className={css.focusIdentity}>
            <span>{t('filteredType')}</span>
            <strong>{t(CATEGORY_LABELS[categoryFilter])}</strong>
          </span>
          <span className={css.focusCount}>
            {t(categoryFilter === 'fiber' ? 'visibleFibers' : 'visiblePlugins')} <strong>{filteredItemCount}</strong> / {totalItemCount}
          </span>
          <button
            type="button"
            className={css.showAll}
            onClick={() => { onCategoryFilterChange('all') }}
          >
            {t('clearTypeFilter')}
          </button>
        </div>
      )}
      {!hasVisibleItems ? <div className={css.emptyState}>{empty}</div> : (
        <RuntimeGraphCanvas
          key={`${profile ?? 'unknown'}:${canvasRevision}`}
          nodes={focus.nodes}
          edges={focus.edges}
          fibers={visibleFibers}
          services={services}
          serviceRelations={serviceRelations}
          relations={relations}
          focus={graphFocus}
          savedPositions={savedPositions}
          graphLabel={graphLabel}
          phaseLabel={phaseLabel}
          onSelect={onSelect}
          onPositionsChange={persistPositions}
          onResetPositions={resetGraph}
          categoryFilter={categoryFilter}
          onCategoryFilterChange={onCategoryFilterChange}
          t={t}
        />
      )}
    </div>
  )
}

function TraceTimeline({
  turn, events, selectedId, onSelect, onBack, empty, laneLabel, timeLabel, t,
}: {
  turn: RuntimeTraceTurn
  events: readonly RuntimeTraceEvent[]
  selectedId: string | undefined
  onSelect: (id: string) => void
  onBack: () => void
  empty: string
  laneLabel: (lane: RuntimeTraceLane) => string
  timeLabel: string
  t: RuntimeExplorerProps['t']
}) {
  return (
    <div className={css.traceDetail}>
      <header className={css.traceDetailHeader}>
        <button type="button" className={css.traceBack} onClick={onBack}>
          <ArrowLeftIcon aria-hidden="true" width={16} height={16} />
          {t('backToTurns')}
        </button>
        <div className={css.traceDetailIdentity}>
          <code title={turn.sessionId}>{shortSessionId(turn.sessionId)}</code>
          <span aria-hidden="true">/</span>
          <strong>{t('turn')} #{turn.turn}</strong>
          <span className={css.turnStatus} data-status={turn.status}>{t(TURN_STATUS_LABELS[turn.status])}</span>
        </div>
        <dl className={css.turnMetrics}>
          <div><dt>{t('duration')}</dt><dd>{formatDuration(turn.durationMs)}</dd></div>
          <div><dt>{t('events')}</dt><dd>{turn.eventCount}</dd></div>
          <div><dt>{t('steps')}</dt><dd>{turn.stepCount}</dd></div>
          <div><dt>{t('toolCalls')}</dt><dd>{turn.toolCallCount}</dd></div>
        </dl>
      </header>
      {events.length === 0
        ? <div className={css.emptyState}>{empty}</div>
        : <div className={css.traceScroller}>
          <div className={css.traceGrid}>
            <div className={css.traceCorner}>{timeLabel}</div>
            {(Object.keys(LANE_LABELS) as RuntimeTraceLane[]).map(lane => (
              <div key={lane} className={css.traceLane}>{laneLabel(lane)}</div>
            ))}
            {events.map(event => (
              <div key={event.id} className={css.traceRow}>
                <time dateTime={new Date(event.time).toISOString()}>
                  {new Date(event.time).toLocaleTimeString([], { hour12: false })}
                </time>
                <button
                  type="button"
                  className={css.traceEvent}
                  data-lane={event.lane}
                  data-selected={selectedId === event.id || undefined}
                  onClick={() => { onSelect(event.id) }}
                >
                  <span>{event.type}</span>
                  <small>{event.name ?? `#${event.seq}`}</small>
                </button>
              </div>
            ))}
          </div>
        </div>}
    </div>
  )
}

function TraceDirectory({
  sessions, onSelect, empty, t,
}: {
  sessions: readonly RuntimeTraceSession[]
  onSelect: (key: string) => void
  empty: string
  t: RuntimeExplorerProps['t']
}) {
  const turnCount = sessions.reduce((count, session) => count + session.turns.length, 0)
  if (turnCount === 0) return <div className={css.emptyState}>{empty}</div>
  const runningCount = sessions.reduce(
    (count, session) => count + session.turns.filter(turn => turn.status === 'running').length,
    0,
  )
  return (
    <div className={css.traceDirectory}>
      <dl className={css.traceSummary} aria-label={t('traceSummary')}>
        <div><dt>{t('sessions')}</dt><dd>{sessions.length}</dd></div>
        <div><dt>{t('agentTurns')}</dt><dd>{turnCount}</dd></div>
        <div><dt>{t('runningTurns')}</dt><dd>{runningCount}</dd></div>
      </dl>
      <div className={css.traceSessions}>
        {sessions.map(session => (
          <section key={session.sessionId} className={css.traceSession}>
            <header>
              <div><span>{t('session')}</span><code title={session.sessionId}>{shortSessionId(session.sessionId)}</code></div>
              <small>{session.turns.length} {t('turns')} · {session.eventCount} {t('events')}</small>
            </header>
            <div className={css.turnList}>
              {session.turns.map(turn => (
                <button
                  key={turn.key}
                  type="button"
                  className={css.turnRow}
                  aria-label={`${t('turn')} ${turn.turn}, ${t(TURN_STATUS_LABELS[turn.status])}`}
                  onClick={() => { onSelect(turn.key) }}
                >
                  <div className={css.turnIdentity}>
                    <strong>{t('turn')} #{turn.turn}</strong>
                    <time dateTime={new Date(turn.startedAt).toISOString()}>
                      {new Date(turn.startedAt).toLocaleTimeString([], { hour12: false })}
                    </time>
                  </div>
                  <span className={css.turnStatus} data-status={turn.status}>{t(TURN_STATUS_LABELS[turn.status])}</span>
                  <dl className={css.turnMetrics}>
                    <div><dt>{t('duration')}</dt><dd>{formatDuration(turn.durationMs)}</dd></div>
                    <div><dt>{t('events')}</dt><dd>{turn.eventCount}</dd></div>
                    <div><dt>{t('steps')}</dt><dd>{turn.stepCount}</dd></div>
                    <div><dt>{t('toolCalls')}</dt><dd>{turn.toolCallCount}</dd></div>
                  </dl>
                  <ChevronRightIcon aria-hidden="true" width={17} height={17} />
                </button>
              ))}
              {session.sessionEvents.length > 0 && (
                <p className={css.sessionEvents}>{t('sessionEvents')}: {session.sessionEvents.length}</p>
              )}
            </div>
          </section>
        ))}
      </div>
    </div>
  )
}

function PluginInspector({ node, t }: { node: RuntimeGraphNode; t: RuntimeExplorerProps['t'] }) {
  const lifecycle = statusKey(node.phase)
  const lifecycleLabel = t(STATUS_LABELS[lifecycle])
  const rows: Array<[RuntimeLocaleKey, string | undefined]> = [
    ['module', node.moduleName],
    ['entry', node.entryId],
    ['fiber', node.fiberId],
    ['runtimeIdentity', node.runtimeId],
  ]
  return (
    <>
      <div className={css.inspectorTitle} data-kind="plugin">
        <span className={css.inspectorIcon}><IconCordisPluginOutline14 size={18} /></span>
        <div>
          <strong>{node.label}</strong>
          <span className={css.inspectorSubtitle}>
            <small>{t('selectedPlugin')}</small>
            <span className={css.inspectorStatus} data-state={lifecycle} aria-label={`${t('status')}: ${lifecycleLabel}`}>
              <i aria-hidden="true" />{lifecycleLabel}
            </span>
          </span>
        </div>
      </div>
      <dl className={css.metadata}>
        {rows.map(([label, value]) => (
          <div key={label}><dt>{t(label)}</dt><dd>{value ?? <span className={css.emptyValue}>{t('unavailable')}</span>}</dd></div>
        ))}
      </dl>
      {lifecycle === 'pending' && (
        <section className={css.pendingDiagnosis} data-missing={node.missing.length > 0 || undefined}>
          <h3>{t('pendingDiagnosis')}</h3>
          <p>{t(node.missing.length > 0 ? 'waitingForServices' : 'waitingForRuntime')}</p>
          {node.missing.length > 0 && <MetadataList values={node.missing} empty={t('noItems')} />}
        </section>
      )}
      <section className={css.inspectorSection}><h3>{t('provides')}</h3><MetadataList values={node.provides} empty={t('noItems')} /></section>
      <section className={css.inspectorSection}><h3>{t('injects')}</h3><MetadataList values={node.injects} empty={t('noItems')} /></section>
      {node.missing.length > 0 && <section className={css.inspectorSection} data-warning><h3>{t('missing')}</h3><MetadataList values={node.missing} empty={t('noItems')} /></section>}
      <section className={css.inspectorSection}>
        <h3>{t('effects')} <span>{node.effectCount}</span></h3>
        <MetadataList values={node.effects} empty={t('noItems')} />
      </section>
    </>
  )
}

function FiberInspector({ fiber, t }: { fiber: RuntimeGraphFiberNode; t: RuntimeExplorerProps['t'] }) {
  const lifecycle = statusKey(fiber.phase)
  const lifecycleLabel = t(STATUS_LABELS[lifecycle])
  const rows: Array<[RuntimeLocaleKey, string | number | undefined]> = [
    ['fiberUid', fiber.uid],
    ['fiber', fiber.id],
    ['module', fiber.moduleName],
    ['ownerPlugin', fiber.ownerEntryId],
    ['parentFiber', fiber.parentFiberId],
    ['runtimeIdentity', fiber.runtimeId],
    ['entryRoot', t(fiber.entryRoot ? 'yes' : 'no')],
  ]
  return (
    <>
      <div className={css.inspectorTitle} data-kind="fiber">
        <span className={css.inspectorIcon}><IconBranchOutline16 size={18} /></span>
        <div>
          <strong>#{fiber.uid} {fiber.name}</strong>
          <span className={css.inspectorSubtitle}>
            <small>{t('selectedFiber')}</small>
            <span className={css.inspectorStatus} data-state={lifecycle} aria-label={`${t('status')}: ${lifecycleLabel}`}>
              <i aria-hidden="true" />{lifecycleLabel}
            </span>
          </span>
        </div>
      </div>
      <dl className={css.metadata}>
        {rows.map(([label, value]) => (
          <div key={label}>
            <dt>{t(label)}</dt>
            <dd>{value ?? <span className={css.emptyValue}>{t('unavailable')}</span>}</dd>
          </div>
        ))}
      </dl>
      {lifecycle === 'pending' && (
        <section className={css.pendingDiagnosis} data-missing={fiber.missing.length > 0 || undefined}>
          <h3>{t('pendingDiagnosis')}</h3>
          <p>{t(fiber.missing.length > 0 ? 'waitingForServices' : 'waitingForRuntime')}</p>
          {fiber.missing.length > 0 && <MetadataList values={fiber.missing} empty={t('noItems')} />}
        </section>
      )}
      <section className={css.inspectorSection}><h3>{t('provides')}</h3><MetadataList values={fiber.provides} empty={t('noItems')} /></section>
      <section className={css.inspectorSection}><h3>{t('injects')}</h3><MetadataList values={fiber.injects} empty={t('noItems')} /></section>
      {fiber.missing.length > 0 && <section className={css.inspectorSection} data-warning><h3>{t('missing')}</h3><MetadataList values={fiber.missing} empty={t('noItems')} /></section>}
      <section className={css.inspectorSection}><h3>{t('effects')} <span>{fiber.effectCount}</span></h3></section>
    </>
  )
}

function ServiceInspector({
  service, serviceRelations, nodes, t,
}: {
  service: RuntimeGraphServiceNode
  serviceRelations: readonly RuntimeGraphServiceRelation[]
  nodes: readonly RuntimeGraphNode[]
  t: RuntimeExplorerProps['t']
}) {
  const nodeById = new Map(nodes.map(node => [node.id, node]))
  const provider = service.providerNodeId === undefined ? undefined : nodeById.get(service.providerNodeId)
  const consumerIds = [...new Set(
    serviceRelations
      .filter(relation => relation.serviceNodeId === service.id)
      .map(relation => relation.consumerNodeId),
  )]
  const consumers = consumerIds
    .map(id => nodeById.get(id))
    .filter((node): node is RuntimeGraphNode => node !== undefined)
  const pluginLabel = (node: RuntimeGraphNode): string => `${node.label} · ${node.moduleName}`
  const lifecycle = statusKey(service.phase)
  const lifecycleLabel = t(STATUS_LABELS[lifecycle])
  const rows: Array<[RuntimeLocaleKey, string | undefined]> = [
    ['serviceName', service.name],
    ['serviceIdentity', service.id],
    ['entry', service.providerEntryId ?? t('rootContext')],
    ['fiber', service.providerFiberId],
  ]
  return (
    <>
      <div className={css.inspectorTitle} data-kind="service">
        <span className={css.inspectorIcon}><IconDataOutline16 size={18} /></span>
        <div>
          <strong>{service.name}</strong>
          <span className={css.inspectorSubtitle}>
            <small>{t('selectedService')}</small>
            <span className={css.inspectorStatus} data-state={lifecycle} aria-label={`${t('status')}: ${lifecycleLabel}`}>
              <i aria-hidden="true" />{lifecycleLabel}
            </span>
          </span>
        </div>
      </div>
      <dl className={css.metadata}>
        {rows.map(([label, value]) => (
          <div key={label}><dt>{t(label)}</dt><dd>{value ?? <span className={css.emptyValue}>{t('unavailable')}</span>}</dd></div>
        ))}
      </dl>
      <section className={css.inspectorSection}>
        <h3>{t('providerPlugins')} <span>{provider === undefined ? 0 : 1}</span></h3>
        <MetadataList values={provider === undefined ? [] : [pluginLabel(provider)]} empty={t('noProvider')} />
      </section>
      <section className={css.inspectorSection}>
        <h3>{t('consumerPlugins')} <span>{consumers.length}</span></h3>
        <MetadataList values={consumers.map(pluginLabel)} empty={t('noItems')} />
      </section>
    </>
  )
}

function EventInspector({ event, t }: { event: RuntimeTraceEvent; t: RuntimeExplorerProps['t'] }) {
  const rows: Array<[RuntimeLocaleKey, string | number | undefined]> = [
    ['session', event.sessionId],
    ['event', event.type],
    ['sequence', event.seq],
    ['payload', event.payloadChars],
    ['turn', event.turn],
    ['step', event.step],
    ['callId', event.callId],
    ['tool', event.name],
    ['outcome', event.outcome],
  ]
  return (
    <>
      <div className={css.inspectorTitle}>
        <span className={css.inspectorIcon}><IconDataOutline16 size={18} /></span>
        <div><strong>{event.type}</strong><small>{t('selectedEvent')}</small></div>
      </div>
      <dl className={css.metadata}>
        {rows.filter(([, value]) => value !== undefined).map(([label, value]) => (
          <div key={label}><dt>{t(label)}</dt><dd>{String(value)}</dd></div>
        ))}
      </dl>
      <p className={css.privacy}>{t('privacy')}</p>
    </>
  )
}

/** Render the frame overlay and keep Remote polling bound to its visible lifetime. */
export function RuntimeExplorer({
  useStore, useRuntime, actions, onVisibilityChange, onRefresh, t,
}: RuntimeExplorerProps) {
  const state = useStore(current => current)
  const remote = useRuntime(current => current)
  useEffect(() => {
    if (!state.open) return
    onVisibilityChange(true)
    return () => { onVisibilityChange(false) }
  }, [onVisibilityChange, state.open])
  const query = state.query.trim().toLowerCase()
  const data = remote.data
  const traceSessions = useMemo(() => groupRuntimeTrace(data?.trace ?? []), [data?.trace])
  const visibleTraceSessions = useMemo(
    () => filterRuntimeTrace(traceSessions, query),
    [query, traceSessions],
  )
  const observedBootId = useRef<string>()
  useEffect(() => {
    if (!state.open || data === undefined) return
    const processRestarted = observedBootId.current !== undefined && observedBootId.current !== data.bootId
    observedBootId.current = data.bootId
    if (processRestarted) {
      actions.select(undefined)
      actions.selectTraceTurn(undefined)
      return
    }
    const selectionExists = state.selection === undefined
      || (state.selection.kind === 'node' && data.graph.nodes.some(node => node.id === state.selection?.id))
      || (state.selection.kind === 'fiber' && data.graph.fibers.some(fiber => fiber.id === state.selection?.id))
      || (state.selection.kind === 'service' && data.graph.services.some(service => service.id === state.selection?.id))
      || (state.selection.kind === 'event' && data.trace.some(event => event.id === state.selection?.id))
    if (!selectionExists) actions.select(undefined)
    if (state.traceTurnKey !== undefined && !traceSessions.some(session => (
      session.turns.some(turn => turn.key === state.traceTurnKey)
    ))) {
      actions.selectTraceTurn(undefined)
    }
  }, [actions, data, state.open, state.selection, state.traceTurnKey, traceSessions])
  const graphFibers = useMemo(
    () => data?.graph.fibers.filter(fiber => (
      includesFiber(fiber, query)
      && (state.phase === 'all' || statusKey(fiber.phase) === state.phase)
      && (state.fiberCategory === 'all'
        || runtimeG6NodeCategory(fiber.moduleName, fiber.name) === state.fiberCategory)
    )) ?? [],
    [data?.graph.fibers, query, state.fiberCategory, state.phase],
  )
  const fiberOwnerIds = useMemo(
    () => new Set(graphFibers.flatMap(fiber => fiber.ownerNodeId === undefined ? [] : [fiber.ownerNodeId])),
    [graphFibers],
  )
  const graphNodes = useMemo(
    () => state.category === 'service'
      ? []
      : state.category === 'fiber'
        ? data?.graph.nodes.filter(node => fiberOwnerIds.has(node.id)) ?? []
        : data?.graph.nodes.filter(node => (
          includesNode(node, query)
          && (state.phase === 'all' || statusKey(node.phase) === state.phase)
          && (state.category === 'all' || runtimeG6NodeCategory(node.moduleName, node.label) === state.category)
        )) ?? [],
    [data?.graph.nodes, fiberOwnerIds, query, state.category, state.phase],
  )
  const graphServices = useMemo(
    () => data === undefined
      ? []
      : state.category === 'service'
        ? data.graph.services.filter(service => (
          includesService(service, query)
          && (state.phase === 'all' || statusKey(service.phase) === state.phase)
        ))
        : data.graph.services,
    [data?.graph.services, query, state.category, state.phase],
  )
  const graphEdges = useMemo(
    () => data === undefined ? [] : graphEdgesFor(graphNodes, data.graph.edges),
    [data?.graph.edges, graphNodes],
  )
  if (!state.open) return null

  const selectedTurn = traceSessions.flatMap(session => session.turns)
    .find(turn => turn.key === state.traceTurnKey)
  const traceEvents = selectedTurn?.events.filter(event => includesEvent(event, query)) ?? []
  const selectedNode = state.selection?.kind === 'node'
    ? data?.graph.nodes.find(node => node.id === state.selection?.id)
    : undefined
  const selectedFiber = state.selection?.kind === 'fiber'
    ? data?.graph.fibers.find(fiber => fiber.id === state.selection?.id)
    : undefined
  const selectedService = state.selection?.kind === 'service'
    ? data?.graph.services.find(service => service.id === state.selection?.id)
    : undefined
  const selectedEvent = state.selection?.kind === 'event'
    ? data?.trace.find(event => event.id === state.selection?.id)
    : undefined

  const close = (): void => {
    actions.setOpen(false)
    onVisibilityChange(false)
  }
  return (
    <section className={css.surface} style={{ left: state.sidebarOffset }} aria-label={t('title')}>
      <header className={css.header}>
        <div className={css.brandIcon}><IconBranchOutline16 size={20} /></div>
        <div className={css.heading}>
          <div className={css.titleRow}>
            <h1>{t('title')}</h1>
            <span className={css.liveBadge}><i aria-hidden />{t('live')}</span>
          </div>
          <span
            className={css.profileBadge}
            aria-label={`${t('currentProfile')}: ${data?.profile ?? t('unavailable')}`}
          >
            <span>{t('profile')}</span>
            <code>{data?.profile ?? '—'}</code>
          </span>
        </div>
        <div className={css.headerActions}>
          <span className={css.updated}>{t('updated')}</span>
          <Tooltip label={t('refresh')} side="bottom" delayMs={400}>
            <button type="button" className={css.iconButton} aria-label={t('refresh')} onClick={onRefresh}>
              <IconRefreshOutline16 size={16} />
            </button>
          </Tooltip>
          <Tooltip label={t('close')} side="bottom" delayMs={400}>
            <button type="button" className={css.iconButton} aria-label={t('close')} onClick={close}>
              <IconCloseOutline16 size={16} />
            </button>
          </Tooltip>
        </div>
      </header>
      <div className={css.toolbar}>
        <div className={css.tabs}>
          <button type="button" data-active={state.tab === 'overview' || undefined} onClick={() => { actions.setTab('overview') }}>
            <Squares2X2Icon width={15} />{t('overviewTab')}
          </button>
          <button type="button" data-active={state.tab === 'graph' || undefined} onClick={() => { actions.setTab('graph') }}>
            <IconBranchOutline16 size={15} />{t('graphTab')}
          </button>
          <button type="button" data-active={state.tab === 'trace' || undefined} onClick={() => { actions.setTab('trace') }}>
            <IconDataOutline16 size={15} />{t('traceTab')}
          </button>
        </div>
        {state.tab !== 'overview' && <label className={css.search}>
          <IconSearchOutline16 size={16} />
          <input
            value={state.query}
            placeholder={t(state.tab === 'graph'
              ? 'searchGraph'
              : selectedTurn === undefined ? 'searchTrace' : 'searchTurnTrace')}
            onChange={(event) => { actions.setQuery(event.target.value) }}
          />
        </label>}
        {state.tab === 'graph' && (
          <select
            className={css.phaseFilter}
            aria-label={t('allStates')}
            value={state.phase}
            onChange={(event) => { actions.setPhase(event.target.value as RuntimePhaseFilter) }}
          >
            <option value="all">{t('allStates')}</option>
            {(Object.keys(STATUS_LABELS) as Array<Exclude<RuntimePhaseFilter, 'all'>>).map(status => (
              <option key={status} value={status}>{t(STATUS_LABELS[status])}</option>
            ))}
          </select>
        )}
      </div>
      <div className={clsx(css.body, (
        selectedNode !== undefined || selectedFiber !== undefined || selectedService !== undefined || selectedEvent !== undefined
      ) && css.withInspector)}>
        <main className={css.canvas}>
          {remote.loading && data === undefined && <div className={css.emptyState}>{t('loadingSnapshot')}</div>}
          {remote.error !== undefined && data === undefined && (
            <div className={css.emptyState}><p>{t('loadFailed')}</p><button type="button" onClick={onRefresh}>{t('retry')}</button></div>
          )}
          {data !== undefined && state.tab === 'overview' && (
            <RuntimeOverview
              overview={data.overview}
              activity={data.effectActivity}
              t={t}
              onInspect={(kind, category, status) => {
                actions.setTab('graph')
                actions.setPhase(status)
                if (kind === 'fiber') {
                  actions.setCategory('fiber')
                  actions.setFiberCategory(category ?? 'all')
                } else if (kind === 'service') {
                  actions.setCategory('service')
                } else {
                  actions.setCategory(category ?? 'all')
                }
              }}
            />
          )}
          {data !== undefined && state.tab === 'graph' && (
            <GraphView
              nodes={graphNodes}
              allNodes={data.graph.nodes}
              edges={graphEdges}
              allEdges={data.graph.edges}
              fibers={graphFibers}
              allFibers={data.graph.fibers}
              services={graphServices}
              serviceRelations={data.graph.serviceRelations}
              totalNodes={data.graph.nodes.length}
              totalFibers={data.graph.fibers.length}
              totalServices={data.overview.serviceBreakdown.total}
              graphFocus={selectedNode === undefined
                ? selectedFiber === undefined
                  ? selectedService === undefined ? undefined : { kind: 'service', id: selectedService.id }
                  : { kind: 'fiber', id: selectedFiber.id }
                : { kind: 'plugin', id: selectedNode.id }}
              focusLabel={selectedNode?.label ?? (selectedFiber === undefined
                ? selectedService?.name
                : `#${selectedFiber.uid} ${selectedFiber.name}`)}
              profile={data.profile}
              empty={t('emptyGraph')}
              graphLabel={t('graphLabel')}
              phaseLabel={phase => t(STATUS_LABELS[statusKey(phase)])}
              categoryFilter={state.category}
              t={t}
              onSelect={(focus) => {
                actions.select({
                  kind: focus.kind === 'plugin' ? 'node' : focus.kind,
                  id: focus.id,
                })
              }}
              onClearSelection={() => { actions.select(undefined) }}
              onCategoryFilterChange={(category) => { actions.setCategory(category) }}
            />
          )}
          {data !== undefined && state.tab === 'trace' && (
            selectedTurn === undefined
              ? <TraceDirectory
                sessions={visibleTraceSessions}
                empty={t(query === '' ? 'emptyTurns' : 'emptyTrace')}
                t={t}
                onSelect={(key) => { actions.selectTraceTurn(key) }}
              />
              : <TraceTimeline
                turn={selectedTurn}
                events={traceEvents}
                selectedId={selectedEvent?.id}
                empty={t('emptyTurnTrace')}
                laneLabel={lane => t(LANE_LABELS[lane])}
                timeLabel={t('time')}
                t={t}
                onBack={() => { actions.selectTraceTurn(undefined) }}
                onSelect={(id) => { actions.select({ kind: 'event', id }) }}
              />
          )}
        </main>
        {(selectedNode !== undefined || selectedFiber !== undefined || selectedService !== undefined || selectedEvent !== undefined) && (
          <aside className={css.inspector}>
            <button type="button" className={css.inspectorClose} aria-label={t('closeInspector')} onClick={() => { actions.select(undefined) }}>
              <IconCloseOutline16 size={16} />
            </button>
            {selectedNode !== undefined && <PluginInspector node={selectedNode} t={t} />}
            {selectedFiber !== undefined && <FiberInspector fiber={selectedFiber} t={t} />}
            {selectedService !== undefined && <ServiceInspector
              service={selectedService}
              serviceRelations={data?.graph.serviceRelations ?? []}
              nodes={data?.graph.nodes ?? []}
              t={t}
            />}
            {selectedEvent !== undefined && <EventInspector event={selectedEvent} t={t} />}
          </aside>
        )}
      </div>
    </section>
  )
}
