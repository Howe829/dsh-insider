import { afterEach, describe, expect, it } from 'vitest'
import { Context, Service, type Plugin } from '@deepseek-ai/cordis'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import { Session, SessionId, type SessionEvent } from '@deepseek-ai/dsh-session'
import { remoteMethods } from '@deepseek-ai/dsh-typert-protocol'
import RuntimeExplorerGateway, {
  type Config,
  projectRuntimeGraph, projectServiceOverview, projectTraceEvent,
} from '../src/index.ts'

const contexts: Context[] = []

afterEach(async () => {
  await Promise.all(contexts.splice(0).map(ctx => ctx.fiber.dispose()))
})

class AlphaService extends Service {
  constructor(ctx: Context) { super(ctx, 'alpha') }
}

class BetaService extends Service {
  constructor(ctx: Context) { super(ctx, 'beta') }
}

class DesktopProfilesService extends Service {
  readonly current: Readonly<{ name: string, dir: string }>

  constructor(ctx: Context, name: string) {
    super(ctx, 'desktopProfiles')
    this.current = Object.freeze({ name, dir: `/fixture/profiles/${name}` })
  }
}

const provider: Plugin.Function = (ctx) => {
  new AlphaService(ctx)
  new BetaService(ctx)
  ctx.effect(() => {
    ctx.effect(() => () => {}, 'provider inner effect')
    return () => {}
  }, 'provider outer effect')
}

const consumer: Plugin.Object = {
  inject: ['alpha', 'beta'],
  apply(ctx) { ctx.effect(() => () => {}, 'consumer effect') },
}

const pending: Plugin.Object = {
  inject: ['missingService'],
  apply() {},
}

const rootServiceConsumer: Plugin.Object = {
  inject: ['loader'],
  apply() {},
}

const unusedGroup: Plugin.Function = () => {}

async function harness(
  config: Config = {
    traceLimit: 2,
    effectLimit: 1,
    refreshIntervalMs: 900,
    activityWindowMs: 300_000,
    activityBucketMs: 10_000,
    activityTransitionLimit: 64,
  },
  profile: string | null = 'fixture-profile',
  desktopProfile: string | null = null,
) {
  const ctx = new Context()
  contexts.push(ctx)
  if (profile !== null) ctx.provide('launchProfile', { get: () => profile })
  if (desktopProfile !== null) new DesktopProfilesService(ctx, desktopProfile)
  await ctx.plugin(Loader)
  ctx.loader.builtins.provider = provider
  ctx.loader.builtins.consumer = consumer
  ctx.loader.builtins.pending = pending
  ctx.loader.builtins['root-service-consumer'] = rootServiceConsumer
  ctx.loader.builtins['unused-group'] = unusedGroup
  await ctx.plugin(RuntimeExplorerGateway, config)
  const runtime = ctx.get('runtimeExplorer') as RuntimeExplorerGateway
  return { ctx, runtime }
}

describe('RuntimeExplorerGateway', () => {
  it('projects Loader nodes, provided services, dependency edges, waits, effects, and disabled rows', async () => {
    const { ctx, runtime } = await harness()
    const providerEntry = await ctx.loader.create({ name: 'cordis:provider' })
    const consumerEntry = await ctx.loader.create({ name: 'cordis:consumer' })
    const pendingEntry = await ctx.loader.create({ name: 'cordis:pending' })
    const disabledEntry = await ctx.loader.create({ name: '@fixture/dsh-host-disabled', disabled: true })
    await ctx.loader.create({ name: 'cordis:unused-group', group: true })
    await ctx.loader.await()
    const providerFiber = [...ctx.loader.entries()].find(entry => entry.id === providerEntry)!.fiber!
    providerFiber.inject.alpha = null
    const nestedPendingFiber = providerFiber.ctx.plugin(pending)

    const graph = projectRuntimeGraph(ctx, 1)
    expect(graph.nodes).toHaveLength(4)
    expect(graph.nodes.find(node => node.entryId === providerEntry)).toMatchObject({
      label: 'cordis:provider',
      logicalKey: `entry:${providerEntry}`,
      fiberId: expect.any(String),
      runtimeId: expect.any(String),
      phase: 'active',
      provides: ['alpha', 'beta'],
      injects: ['alpha'],
      effects: ['ctx.provide("alpha")'],
      effectCount: 5,
    })
    expect(graph.nodes.find(node => node.entryId === consumerEntry)).toMatchObject({
      phase: 'active', injects: ['alpha', 'beta'], missing: [],
    })
    expect(graph.nodes.find(node => node.entryId === pendingEntry)).toMatchObject({
      phase: 'pending', missing: ['missingService'],
    })
    expect(graph.nodes.find(node => node.entryId === disabledEntry)).toMatchObject({
      label: 'disabled', enabled: false, phase: null, effects: [], effectCount: 0,
    })
    expect(graph.edges).toEqual([{
      id: `injects:entry:${consumerEntry}->entry:${providerEntry}`,
      type: 'injects',
      source: `entry:${consumerEntry}`,
      target: `entry:${providerEntry}`,
      services: ['alpha', 'beta'],
    }])
    expect(graph.services.map(service => service.name)).toEqual(expect.arrayContaining(['alpha', 'beta']))
    expect(graph.serviceRelations).toEqual(expect.arrayContaining([
      expect.objectContaining({
        service: 'alpha',
        consumerNodeId: `entry:${consumerEntry}`,
        providerNodeId: `entry:${providerEntry}`,
      }),
      expect.objectContaining({
        service: 'beta',
        consumerNodeId: `entry:${consumerEntry}`,
        providerNodeId: `entry:${providerEntry}`,
      }),
    ]))
    expect(graph.edges.some(edge => edge.source === `entry:${providerEntry}` && edge.target === `entry:${providerEntry}`)).toBe(false)
    expect(graph.fibers.find(fiber => fiber.uid === nestedPendingFiber.uid)).toMatchObject({
      name: 'provider',
      ownerNodeId: `entry:${providerEntry}`,
      ownerEntryId: providerEntry,
      parentFiberId: graph.nodes.find(node => node.entryId === providerEntry)?.fiberId,
      entryRoot: false,
      phase: 'pending',
      injects: ['missingService'],
      missing: ['missingService'],
    })
    expect(graph.fibers.find(fiber => fiber.id === graph.nodes.find(node => node.entryId === providerEntry)?.fiberId))
      .toMatchObject({ ownerNodeId: `entry:${providerEntry}`, entryRoot: true, phase: 'active' })

    const firstSnapshot = runtime.snapshot()
    const secondSnapshot = runtime.snapshot()
    expect(firstSnapshot).toMatchObject({
      schemaVersion: 6,
      bootId: expect.any(String),
      snapshotSeq: 1,
      profile: 'fixture-profile',
      refreshIntervalMs: 900,
      overview: {
        status: 'running',
        uptimeMs: expect.any(Number),
        contexts: expect.any(Number),
        plugins: ctx.registry.size,
        fibers: expect.any(Number),
        turns: 0,
        active: expect.any(Number),
        effects: expect.any(Number),
        events: 0,
        errors: 0,
      },
      graph,
      trace: [],
      capabilities: {
        fiberInstances: true,
        ownershipEdges: true,
        scopes: false,
        lifecycleTransitions: true,
        turnPluginAttribution: false,
        eventDispatch: 'none',
        payloadCapture: false,
      },
      limits: { transitionLimit: 64, traceEventLimit: 2 },
    })
    expect(secondSnapshot.bootId).toBe(firstSnapshot.bootId)
    expect(secondSnapshot.snapshotSeq).toBe(2)
    expect(secondSnapshot.graph.nodes.find(node => node.entryId === providerEntry)?.fiberId)
      .toBe(firstSnapshot.graph.nodes.find(node => node.entryId === providerEntry)?.fiberId)
    expect(firstSnapshot.overview.loaderBreakdown).toMatchObject({
      total: graph.nodes.length,
      statuses: { pending: 1, active: 2, disposed: 1, failed: 0 },
    })
    expect(firstSnapshot.overview.fiberBreakdown.total).toBe(firstSnapshot.overview.fibers)
    expect(firstSnapshot.overview.fiberBreakdown.statuses.pending)
      .toBeGreaterThan(firstSnapshot.overview.loaderBreakdown.statuses.pending)
    expect(firstSnapshot.overview.effects).toBe(
      firstSnapshot.effectActivity.plugins.reduce((sum, plugin) => sum + plugin.current, 0),
    )
    expect(firstSnapshot.overview.serviceBreakdown.implementations)
      .toBeGreaterThanOrEqual(firstSnapshot.overview.serviceBreakdown.total)
    for (const breakdown of [
      firstSnapshot.overview.loaderBreakdown,
      firstSnapshot.overview.fiberBreakdown,
      firstSnapshot.overview.serviceBreakdown,
    ]) {
      expect(Object.values(breakdown.statuses).reduce((sum, count) => sum + count, 0)).toBe(breakdown.total)
      expect(breakdown.byType.reduce((sum, row) => sum + row.total, 0)).toBe(breakdown.total)
    }
    expect(remoteMethods(runtime)).toEqual([{ method: 'snapshot', invocation: { kind: 'direct' } }])
  })

  it('keeps same-name services in different Loader isolation realms bound to their exact providers', async () => {
    const { ctx } = await harness()
    ctx.loader.builtins['alpha-provider'] = (pluginCtx: Context) => { new AlphaService(pluginCtx) }
    ctx.loader.builtins['alpha-consumer'] = {
      inject: ['alpha'], apply(pluginCtx: Context) { pluginCtx.effect(() => () => {}, 'alpha-consumer') },
    }
    const providerA = await ctx.loader.create({ name: 'cordis:alpha-provider', isolate: { alpha: 'realm-a' } })
    const consumerA = await ctx.loader.create({ name: 'cordis:alpha-consumer', isolate: { alpha: 'realm-a' } })
    const providerB = await ctx.loader.create({ name: 'cordis:alpha-provider', isolate: { alpha: 'realm-b' } })
    const consumerB = await ctx.loader.create({ name: 'cordis:alpha-consumer', isolate: { alpha: 'realm-b' } })
    await ctx.loader.await()

    const graph = projectRuntimeGraph(ctx, 1)
    const alphaRelations = graph.serviceRelations.filter(relation => relation.service === 'alpha')
    const relationA = alphaRelations.find(relation => relation.consumerNodeId === `entry:${consumerA}`)
    const relationB = alphaRelations.find(relation => relation.consumerNodeId === `entry:${consumerB}`)

    expect(relationA).toMatchObject({ providerNodeId: `entry:${providerA}` })
    expect(relationB).toMatchObject({ providerNodeId: `entry:${providerB}` })
    expect(relationA?.serviceNodeId).not.toBe(relationB?.serviceNodeId)
    expect(graph.services.filter(service => service.name === 'alpha')).toEqual(expect.arrayContaining([
      expect.objectContaining({ providerEntryId: providerA }),
      expect.objectContaining({ providerEntryId: providerB }),
    ]))
  })

  it('projects root Context services without reporting active consumers as missing dependencies', async () => {
    const { ctx } = await harness()
    const consumerEntry = await ctx.loader.create({ name: 'cordis:root-service-consumer' })
    await ctx.loader.await()

    const graph = projectRuntimeGraph(ctx, 1)
    const loaderService = graph.services.find(service => service.name === 'loader')
    const consumerNode = graph.nodes.find(node => node.entryId === consumerEntry)
    const relation = graph.serviceRelations.find(item => (
      item.consumerNodeId === `entry:${consumerEntry}` && item.service === 'loader'
    ))

    expect(consumerNode).toMatchObject({ phase: 'active', injects: ['loader'], missing: [] })
    expect(loaderService).toMatchObject({ name: 'loader', phase: 'active' })
    expect(loaderService).not.toHaveProperty('providerEntryId')
    expect(loaderService).not.toHaveProperty('providerNodeId')
    expect(relation).toMatchObject({
      serviceNodeId: loaderService?.id,
      service: 'loader',
      consumerNodeId: `entry:${consumerEntry}`,
    })
    expect(relation).not.toHaveProperty('providerNodeId')
  })

  it('models Effect Current, Delta, Churn, trend, and recent lifecycle rows per plugin', async () => {
    const { ctx, runtime } = await harness()
    const providerEntry = await ctx.loader.create({ name: 'cordis:provider' })
    await ctx.loader.await()
    const providerFiber = [...ctx.loader.entries()].find(entry => entry.id === providerEntry)!.fiber!
    const pluginId = `entry:${providerEntry}`
    let childContext: Context | undefined
    await providerFiber.ctx.plugin((ctx) => { childContext = ctx })
    childContext!.effect(() => () => {}, 'child-baseline-effect')
    const before = runtime.snapshot().effectActivity.plugins.find(plugin => plugin.pluginId === pluginId)!
    const rootEffectCount = runtime.snapshot().graph.nodes.find(node => node.entryId === providerEntry)!.effectCount
    expect(before.current).toBeGreaterThan(rootEffectCount)

    const dispose = childContext!.effect(() => () => {}, 'activity-probe')
    const created = runtime.snapshot().effectActivity
    const afterCreate = created.plugins.find(plugin => plugin.pluginId === pluginId)!
    expect(afterCreate).toMatchObject({
      current: before.current + 1,
      created: before.created + 1,
      disposed: before.disposed,
      delta: before.delta + 1,
      churn: before.churn + 1,
    })
    expect(afterCreate.trend.at(-1)?.current).toBe(afterCreate.current)
    expect(created.recent[0]).toMatchObject({
      action: 'created', pluginId, effectLabel: 'activity-probe', fiberId: expect.any(String),
    })

    await dispose()
    const disposed = runtime.snapshot().effectActivity
    const afterDispose = disposed.plugins.find(plugin => plugin.pluginId === pluginId)!
    expect(afterDispose).toMatchObject({
      current: before.current,
      created: before.created + 1,
      disposed: before.disposed + 1,
      delta: before.delta,
      churn: before.churn + 2,
    })
    expect(disposed.recent[0]).toMatchObject({
      action: 'disposed', pluginId, effectLabel: 'activity-probe', durationMs: expect.any(Number),
    })
  })

  it('marks the visible activity window incomplete when lifecycle history overflows', async () => {
    const { ctx, runtime } = await harness({
      traceLimit: 2,
      effectLimit: 1,
      refreshIntervalMs: 900,
      activityWindowMs: 300_000,
      activityBucketMs: 10_000,
      activityTransitionLimit: 1,
    })
    const providerEntry = await ctx.loader.create({ name: 'cordis:provider' })
    await ctx.loader.await()
    const providerFiber = [...ctx.loader.entries()].find(entry => entry.id === providerEntry)!.fiber!
    const dispose = providerFiber.ctx.effect(() => () => {}, 'overflow-probe')
    await dispose()

    expect(runtime.snapshot().effectActivity).toMatchObject({
      complete: false,
      droppedTransitions: expect.any(Number),
      recent: [expect.objectContaining({ action: 'disposed', effectLabel: 'overflow-probe' })],
    })
    expect(runtime.snapshot().effectActivity.droppedTransitions).toBeGreaterThan(0)
  })

  it('reports service registration separately from provider Fiber health', () => {
    const fiber = (state: number, name: string) => ({
      state, name, entry: { options: { name } },
    }) as unknown as import('@deepseek-ai/cordis').Fiber
    const breakdown = projectServiceOverview([
      { name: 'shared', fiber: fiber(2, '@fixture/active-provider') },
      { name: 'shared', fiber: fiber(0, '@fixture/pending-provider') },
      { name: 'broken', fiber: fiber(3, '@fixture/failed-provider') },
      { name: 'retired', fiber: fiber(4, '@fixture/disposed-provider') },
    ])

    expect(breakdown).toMatchObject({
      total: 2,
      implementations: 3,
      statuses: { pending: 0, active: 1, disposed: 0, failed: 1 },
    })
    expect(breakdown.byType.reduce((sum, row) => sum + row.total, 0)).toBe(2)
  })

  it('retains only bounded event metadata and never exposes prompt or tool payload content', async () => {
    const { ctx, runtime } = await harness()
    const session = Session.create(SessionId('visible-session-id'))
    const secretPrompt = 'PROMPT_MUST_NOT_LEAVE_HOST'
    const secretArguments = 'TOOL_ARGUMENTS_MUST_NOT_LEAVE_HOST'
    const user = {
      type: 'user/message', seq: 1, time: 10,
      data: { role: 'user', content: [{ type: 'text', text: secretPrompt }], source: { kind: 'user' } },
    } as unknown as SessionEvent
    const call = {
      type: 'tool/call', seq: 2, time: 20,
      data: { turn: 3, step: 4, callId: 'call-1', name: 'bash', arguments: secretArguments },
    } as SessionEvent
    const end = {
      type: 'turn/end', seq: 3, time: 30,
      data: { turn: 3, reason: { kind: 'completed' } },
    } as SessionEvent

    ctx.emit('session/event', session, user)
    ctx.emit('session/event', session, call)
    ctx.emit('session/event', session, end)
    const snapshot = runtime.snapshot()
    expect(snapshot.trace).toHaveLength(2)
    expect(snapshot.trace[0]).toMatchObject({
      id: 'visible-session-id:2', lane: 'tool', turn: 3, step: 4,
      callId: 'call-1', name: 'bash',
    })
    expect(snapshot.trace[1]).toMatchObject({ lane: 'agent', outcome: 'completed' })
    expect(JSON.stringify(snapshot)).not.toContain(secretPrompt)
    expect(JSON.stringify(snapshot)).not.toContain(secretArguments)
  })

  it('keeps process-lifetime Turn, Event, and Error counters beyond the bounded trace window', async () => {
    const { ctx, runtime } = await harness({ traceLimit: 1, effectLimit: 1, refreshIntervalMs: 900 })
    const session = Session.create(SessionId('overview-session'))
    const events = [
      {
        type: 'turn/start', seq: 1, time: 10, data: { turn: 1 },
      },
      {
        type: 'tool/result', seq: 2, time: 20,
        data: {
          turn: 1, step: 1,
          message: { source: { callId: 'call-1' }, content: [{ isError: true }] },
        },
      },
      {
        type: 'turn/end', seq: 3, time: 30,
        data: { turn: 1, reason: { kind: 'error', error: { message: 'fixture failure' } } },
      },
    ] as SessionEvent[]
    for (const event of events) ctx.emit('session/event', session, event)

    const snapshot = runtime.snapshot()
    expect(snapshot.trace).toHaveLength(1)
    expect(snapshot.overview).toMatchObject({ turns: 1, events: 3, errors: 2 })
    expect(snapshot.overview.contexts).toBe(snapshot.overview.fibers + 1)
    expect(snapshot.overview.active).toBeLessThanOrEqual(snapshot.overview.fibers)
  })

  it('reconciles provider removal and restoration without inventing a stale dependency edge', async () => {
    const { ctx } = await harness()
    const providerEntry = await ctx.loader.create({ name: 'cordis:provider' })
    const consumerEntry = await ctx.loader.create({ name: 'cordis:consumer' })
    await ctx.loader.await()

    const initial = projectRuntimeGraph(ctx, 3)
    expect(initial.nodes.find(node => node.entryId === consumerEntry)).toMatchObject({
      phase: 'active', missing: [],
    })
    expect(initial.edges).toEqual([expect.objectContaining({
      source: `entry:${consumerEntry}`,
      target: `entry:${providerEntry}`,
      services: ['alpha', 'beta'],
    })])

    await ctx.loader.update(providerEntry, { disabled: true })
    await ctx.loader.await()
    const withoutProvider = projectRuntimeGraph(ctx, 3)
    expect(withoutProvider.nodes.find(node => node.entryId === consumerEntry)).toMatchObject({
      phase: 'pending', missing: ['alpha', 'beta'],
    })
    expect(withoutProvider.edges).toEqual([])

    await ctx.loader.update(providerEntry, { disabled: false })
    await ctx.loader.await()
    const restored = projectRuntimeGraph(ctx, 3)
    expect(restored.nodes.find(node => node.entryId === consumerEntry)).toMatchObject({
      phase: 'active', missing: [],
    })
    expect(restored.edges).toEqual([expect.objectContaining({
      source: `entry:${consumerEntry}`,
      target: `entry:${providerEntry}`,
      services: ['alpha', 'beta'],
    })])
  })

  it('reports no profile instead of guessing in an embedding host without launcher facts', async () => {
    const { runtime } = await harness(undefined, null)
    expect(runtime.snapshot().profile).toBeNull()
  })

  it('reports the active Desktop-managed profile when cmdline launcher facts are absent', async () => {
    const { runtime } = await harness(undefined, null, 'desktop-fixture')
    expect(runtime.snapshot().profile).toBe('desktop-fixture')
  })

  it('keeps the cmdline launch profile authoritative when both Host services exist', async () => {
    const { runtime } = await harness(undefined, 'cli-fixture', 'desktop-fixture')
    expect(runtime.snapshot().profile).toBe('cli-fixture')
  })
})

describe('trace metadata projection', () => {
  const session = Session.create(SessionId('trace'))
  const event = (type: string, data: unknown, seq = 1): SessionEvent => ({
    type, data, seq, time: 100,
  } as SessionEvent)

  it('maps the complete built-in request flow into stable lanes and safe correlation fields', () => {
    expect(projectTraceEvent(session, event('turn/start', { turn: 1 }))).toMatchObject({ lane: 'agent', turn: 1 })
    expect(projectTraceEvent(session, event('step/start', { turn: 1, step: 2 }))).toMatchObject({ lane: 'agent', step: 2 })
    expect(projectTraceEvent(session, event('step/end', { turn: 1, step: 2 }))).toMatchObject({ lane: 'agent', step: 2 })
    expect(projectTraceEvent(session, event('assistant/chunk', { turn: 1, step: 2, chunk: { type: 'text-delta', index: 0, text: 'secret' } })))
      .toMatchObject({ lane: 'llm', turn: 1, step: 2 })
    expect(projectTraceEvent(session, event('assistant/message', { turn: 1, step: 2, message: { secret: true } })))
      .toMatchObject({ lane: 'llm', turn: 1, step: 2 })
    expect(projectTraceEvent(session, event('request/header', { header: { system: 'secret' }, reason: 'initial' })))
      .toMatchObject({ lane: 'llm' })
    expect(projectTraceEvent(session, event('tool/result', {
      turn: 1,
      step: 2,
      message: { source: { callId: 'call-2' }, content: [{ isError: true, secret: 'result' }] },
    }))).toMatchObject({ lane: 'tool', callId: 'call-2', outcome: 'error' })
    expect(projectTraceEvent(session, event('tool/result', {
      turn: 1,
      step: 3,
      message: { source: { callId: 'call-3' }, content: [{ isError: false, secret: 'result' }] },
    }))).toMatchObject({ lane: 'tool', callId: 'call-3', outcome: 'success' })
    expect(projectTraceEvent(session, event('todo/write', { todos: [] }))).toMatchObject({ lane: 'session' })
  })
})
