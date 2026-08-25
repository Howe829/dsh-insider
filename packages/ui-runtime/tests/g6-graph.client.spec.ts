import { describe, expect, it, vi } from 'vitest'
import type {
  RuntimeGraphEdge, RuntimeGraphNode, RuntimeGraphServiceNode, RuntimeGraphServiceRelation, RuntimeGraphSnapshot,
} from '@deepseek-ai/dsh-api-remotes/client'
import {
  buildRuntimeG6Data, RUNTIME_G6_LAYOUT_BUDGET_MS, runtimeG6CollisionRadius, runtimeG6DisplayLabel, runtimeG6EdgeMetadata,
  runtimeG6NodeCategory, runtimeG6NodeMetadata,
  runtimeG6NodeSize, runtimeG6TopologyKey, runtimeG6VisualKey, syncRuntimeG6Data,
} from '../src/client/g6-graph.ts'
import type { RuntimeGraphRelations } from '../src/client/graph.ts'

type RuntimeGraphFiberNode = RuntimeGraphSnapshot['fibers'][number]

const node = (
  id: string,
  phase: RuntimeGraphNode['phase'] = 'active',
  missing: string[] = [],
): RuntimeGraphNode => ({
  id,
  logicalKey: id,
  entryId: `${id}-entry`,
  moduleName: `@fixture/${id}`,
  label: id,
  enabled: phase !== null,
  phase,
  provides: [],
  injects: [],
  missing,
  effects: [],
  effectCount: 0,
})

const edge = (source: string, target: string, service: string): RuntimeGraphEdge => ({
  id: `injects:${source}->${target}`,
  type: 'injects',
  source,
  target,
  services: [service],
})

const service: RuntimeGraphServiceNode = {
  id: 'service-llm', name: 'llm', providerNodeId: 'provider', providerEntryId: 'provider-entry', phase: 'active',
}

const serviceRelation: RuntimeGraphServiceRelation = {
  id: 'service:consumer->service-llm', serviceNodeId: 'service-llm', service: 'llm',
  consumerNodeId: 'consumer', providerNodeId: 'provider',
}

const fiber = (
  id: string,
  uid: number,
  phase: RuntimeGraphFiberNode['phase'],
  options: Partial<RuntimeGraphFiberNode> = {},
): RuntimeGraphFiberNode => ({
  id, uid, name: `fiber-${uid}`, moduleName: '@fixture/provider', ownerNodeId: 'provider',
  ownerEntryId: 'provider-entry', entryRoot: false, phase, provides: [], injects: [], missing: [], effectCount: 0,
  ...options,
})

const relations: RuntimeGraphRelations = {
  nodes: new Map([
    ['consumer', 'selected'],
    ['provider', 'dependency'],
  ]),
  edges: new Map([['consumer:provider', 'dependency']]),
}

describe('G6 runtime graph projection', () => {
  it('projects plugin state, dependency direction, pinned placement, and missing Cordis services', () => {
    const data = buildRuntimeG6Data(
      [node('provider'), node('consumer', 'pending', ['tools'])],
      [edge('consumer', 'provider', 'llm')],
      [],
      [service],
      [serviceRelation],
      relations,
      { kind: 'plugin', id: 'consumer' },
      { provider: { x: 120, y: 240, pinned: true } },
    )

    expect(data.nodes.map(item => item.id)).toEqual([
      'provider', 'consumer', 'service:service-llm', 'missing:consumer:tools',
    ])
    expect(data.edges.map(item => item.id)).toEqual([
      'provides:provider->service-llm', 'injects:consumer->service-llm', 'missing-edge:consumer:tools',
    ])

    const provider = data.nodes[0]!
    expect(provider.style).toMatchObject({ x: 120, y: 240 })
    expect(runtimeG6NodeMetadata(provider)).toMatchObject({
      kind: 'plugin', phase: 'active', category: 'extension', relation: 'dependency', pinned: true,
    })
    expect(runtimeG6NodeMetadata(data.nodes[1]!)).toMatchObject({
      kind: 'plugin', phase: 'pending', relation: 'selected', pinned: false,
      provides: [], injects: [], missing: ['tools'], effectCount: 0,
    })
    expect(runtimeG6NodeMetadata(data.nodes[2]!)).toMatchObject({
      kind: 'service', phase: 'active', category: 'service', service: 'llm', providerNodeId: 'provider',
    })
    expect(runtimeG6NodeMetadata(data.nodes[3]!)).toMatchObject({
      kind: 'missing-service', phase: 'missing', service: 'tools', missing: ['tools'],
    })
    expect(runtimeG6EdgeMetadata(data.edges[0]!)).toEqual({
      kind: 'provides', relation: 'dependency', services: ['llm'],
    })
    expect(runtimeG6EdgeMetadata(data.edges[1]!)).toEqual({
      kind: 'injects', relation: 'dependency', services: ['llm'],
    })
    expect(runtimeG6EdgeMetadata(data.edges[2]!)).toEqual({
      kind: 'missing', relation: 'dependency', services: ['tools'],
    })
  })

  it('keeps Service nodes out of the default graph and materializes exact bindings only on focus', () => {
    const defaultData = buildRuntimeG6Data(
      [node('provider'), node('consumer')], [edge('consumer', 'provider', 'llm')],
      [], [service], [serviceRelation], { nodes: new Map(), edges: new Map() }, undefined, {},
    )
    expect(defaultData.nodes.map(item => runtimeG6NodeMetadata(item).kind)).toEqual(['plugin', 'plugin'])
    expect(defaultData.edges).toHaveLength(1)

    const focused = buildRuntimeG6Data(
      [node('provider'), node('consumer')], [edge('consumer', 'provider', 'llm')],
      [], [service], [serviceRelation], relations, { kind: 'plugin', id: 'consumer' }, {},
    )
    expect(focused.nodes.map(item => runtimeG6NodeMetadata(item).kind)).toEqual(['plugin', 'plugin', 'service'])
    expect(focused.edges.map(item => runtimeG6EdgeMetadata(item).kind)).toEqual(['provides', 'injects'])
  })

  it('materializes owned Fiber instances on demand with parent and missing-service diagnostics', () => {
    const rootFiber = fiber('boot:10', 10, 'active', { entryRoot: true })
    const pendingFiber = fiber('boot:11', 11, 'pending', {
      parentFiberId: rootFiber.id,
      injects: ['tools'],
      missing: ['tools'],
    })
    const data = buildRuntimeG6Data(
      [node('provider')], [], [rootFiber, pendingFiber], [], [],
      { nodes: new Map(), edges: new Map() }, { kind: 'fiber', id: pendingFiber.id }, {},
    )

    expect(data.nodes.map(item => item.id)).toEqual([
      'provider', 'fiber:boot:10', 'fiber:boot:11', 'missing:fiber:boot:11:tools',
    ])
    expect(data.edges.map(item => item.id)).toEqual([
      'owns:provider->boot:10', 'owns:provider->boot:11', 'parent:boot:10->boot:11',
      'missing-edge:fiber:boot:11:tools',
    ])
    expect(runtimeG6NodeMetadata(data.nodes[2]!)).toMatchObject({
      kind: 'fiber', category: 'fiber', phase: 'pending', fiberUid: 11, ownerNodeId: 'provider',
      parentFiberId: 'boot:10', missing: ['tools'], relation: 'selected',
    })
    expect(runtimeG6EdgeMetadata(data.edges[0]!)).toMatchObject({ kind: 'owns' })
    expect(runtimeG6EdgeMetadata(data.edges[2]!)).toMatchObject({ kind: 'parent' })
  })

  it('materializes a root Context service for its consumer without inventing a plugin provider', () => {
    const rootService: RuntimeGraphServiceNode = {
      id: 'service-loader', name: 'loader', phase: 'active',
    }
    const rootRelation: RuntimeGraphServiceRelation = {
      id: 'service:consumer->service-loader', serviceNodeId: 'service-loader', service: 'loader',
      consumerNodeId: 'consumer',
    }
    const focused = buildRuntimeG6Data(
      [node('consumer')], [], [], [rootService], [rootRelation],
      { nodes: new Map([['consumer', 'selected']]), edges: new Map() },
      { kind: 'plugin', id: 'consumer' }, {},
    )

    expect(focused.nodes.map(item => item.id)).toEqual(['consumer', 'service:service-loader'])
    expect(runtimeG6NodeMetadata(focused.nodes[1]!)).toMatchObject({
      kind: 'service', service: 'loader', phase: 'active',
    })
    expect(runtimeG6NodeMetadata(focused.nodes[1]!)).not.toHaveProperty('providerNodeId')
    expect(focused.edges.map(item => item.id)).toEqual(['injects:consumer->service-loader'])
    expect(runtimeG6EdgeMetadata(focused.edges[0]!)).toEqual({
      kind: 'injects', relation: 'dependency', services: ['loader'],
    })
  })

  it('materializes every Service without dangling plugin edges in Service filter mode', () => {
    const serviceData = buildRuntimeG6Data(
      [], [], [], [service], [serviceRelation], { nodes: new Map(), edges: new Map() }, undefined, {}, true,
    )

    expect(serviceData.nodes.map(item => item.id)).toEqual(['service:service-llm'])
    expect(runtimeG6NodeMetadata(serviceData.nodes[0]!)).toMatchObject({
      kind: 'service', category: 'service', service: 'llm', phase: 'active',
    })
    expect(runtimeG6NodeMetadata(serviceData.nodes[0]!)).not.toHaveProperty('relation')
    expect(serviceData.edges).toEqual([])
  })

  it('focuses one scoped Service implementation with its provider and every consumer', () => {
    const consumerTwoRelation: RuntimeGraphServiceRelation = {
      id: 'service:consumer-two->service-llm', serviceNodeId: 'service-llm', service: 'llm',
      consumerNodeId: 'consumer-two', providerNodeId: 'provider',
    }
    const focused = buildRuntimeG6Data(
      [node('provider'), node('consumer'), node('consumer-two')],
      [edge('consumer', 'provider', 'llm'), edge('consumer-two', 'provider', 'llm')],
      [],
      [service], [serviceRelation, consumerTwoRelation],
      {
        nodes: new Map([
          ['provider', 'dependency'],
          ['consumer', 'dependant'],
          ['consumer-two', 'dependant'],
        ]),
        edges: new Map(),
      },
      { kind: 'service', id: service.id },
      {},
    )

    expect(focused.nodes.map(item => item.id)).toEqual([
      'provider', 'consumer', 'consumer-two', 'service:service-llm',
    ])
    expect(focused.edges.map(item => item.id)).toEqual([
      'provides:provider->service-llm',
      'injects:consumer->service-llm',
      'injects:consumer-two->service-llm',
    ])
    expect(focused.nodes[3]?.states).toEqual(['selected'])
    expect(runtimeG6NodeMetadata(focused.nodes[0]!)).toMatchObject({ relation: 'dependency' })
    expect(runtimeG6NodeMetadata(focused.nodes[1]!)).toMatchObject({ relation: 'dependant' })
    expect(runtimeG6NodeMetadata(focused.nodes[2]!)).toMatchObject({ relation: 'dependant' })
    expect(runtimeG6EdgeMetadata(focused.edges[0]!)).toMatchObject({ kind: 'provides', relation: 'dependency' })
    expect(runtimeG6EdgeMetadata(focused.edges[1]!)).toMatchObject({ kind: 'injects', relation: 'dependant' })
  })

  it('scales hubs within a bounded circular size and reserves collision whitespace', () => {
    expect(runtimeG6NodeSize(0)).toBe(76)
    expect(runtimeG6NodeSize(1, true)).toBeGreaterThan(runtimeG6NodeSize(1))
    expect(runtimeG6NodeSize(10_000)).toBe(108)
    expect(runtimeG6NodeSize(0, false, 'session-persistence')).toBeGreaterThan(runtimeG6NodeSize(0))
    expect(runtimeG6CollisionRadius(108)).toBeGreaterThan(108 / 2)
  })

  it('classifies DSH plugin roles deterministically while keeping third-party extensions neutral', () => {
    expect(runtimeG6NodeCategory('@deepseek-ai/cordis-plugin-loader', 'loader')).toBe('core')
    expect(runtimeG6NodeCategory('@deepseek-ai/dsh-agent-preset', 'agent-preset')).toBe('agent')
    expect(runtimeG6NodeCategory('@deepseek-ai/dsh-llm-deepseek', 'llm-deepseek')).toBe('model')
    expect(runtimeG6NodeCategory('@deepseek-ai/dsh-tool-bash', 'tool-bash')).toBe('tool')
    expect(runtimeG6NodeCategory('@deepseek-ai/dsh-session', 'session')).toBe('session')
    expect(runtimeG6NodeCategory('@deepseek-ai/dsh-client-ui-layout', 'ui-layout')).toBe('interface')
    expect(runtimeG6NodeCategory('@acme/custom-plugin', 'custom-plugin')).toBe('extension')
  })

  it('keeps exact plugin names and wraps long hyphenated labels at semantic boundaries', () => {
    expect(runtimeG6DisplayLabel('session-projection-cache')).toBe('session-\nprojection-\ncache')
    expect(runtimeG6DisplayLabel('storage-domain')).toBe('storage-\ndomain')
    expect(runtimeG6DisplayLabel('conversation')).toBe('conversation')
    expect(runtimeG6DisplayLabel('systemPrompt', 10)).toBe('system\nPrompt')
    expect(runtimeG6DisplayLabel('veryLongServiceName', 10)).toBe('veryLong\nService\nName')
  })

  it('keeps topology identity stable across lifecycle refreshes', () => {
    const before = buildRuntimeG6Data([node('plugin', 'active')], [], [], [], [], { nodes: new Map(), edges: new Map() }, undefined, {})
    const after = buildRuntimeG6Data([node('plugin', 'failed')], [], [], [], [], { nodes: new Map(), edges: new Map() }, undefined, {})
    expect(runtimeG6TopologyKey(after)).toBe(runtimeG6TopologyKey(before))
  })
})

describe('G6 refresh policy', () => {
  it('lays out structural changes but draws lifecycle-only refreshes in place', async () => {
    const graph = {
      setData: vi.fn(),
      render: vi.fn().mockResolvedValue(undefined),
      draw: vi.fn().mockResolvedValue(undefined),
      getElementPosition: vi.fn().mockReturnValue([420, 260, 0]),
    }
    const first = buildRuntimeG6Data([node('plugin', 'active')], [], [], [], [], { nodes: new Map(), edges: new Map() }, undefined, {})
    expect(await syncRuntimeG6Data(graph, first, undefined, undefined)).toBe('render')

    const refreshed = buildRuntimeG6Data([node('plugin', 'failed')], [], [], [], [], { nodes: new Map(), edges: new Map() }, undefined, {})
    expect(await syncRuntimeG6Data(
      graph, refreshed, runtimeG6TopologyKey(first), runtimeG6VisualKey(first),
    )).toBe('draw')
    expect(graph.render).toHaveBeenCalledOnce()
    expect(graph.draw).toHaveBeenCalledOnce()
    expect(graph.setData).toHaveBeenLastCalledWith(expect.objectContaining({
      nodes: [expect.objectContaining({ style: expect.objectContaining({ x: 420, y: 260 }) })],
    }))

    const expanded = buildRuntimeG6Data(
      [node('plugin', 'failed'), node('new-plugin')], [], [], [], [], { nodes: new Map(), edges: new Map() }, undefined, {},
    )
    expect(await syncRuntimeG6Data(
      graph, expanded, runtimeG6TopologyKey(refreshed), runtimeG6VisualKey(refreshed),
    )).toBe('render')
    expect(graph.render).toHaveBeenCalledTimes(2)
  })

  it('updates tooltip metadata without redrawing an unchanged visual graph', async () => {
    const graph = {
      setData: vi.fn(),
      render: vi.fn().mockResolvedValue(undefined),
      draw: vi.fn().mockResolvedValue(undefined),
      getElementPosition: vi.fn().mockReturnValue([420, 260, 0]),
    }
    const first = buildRuntimeG6Data([node('plugin')], [], [], [], [], { nodes: new Map(), edges: new Map() }, undefined, {})
    const changedNode = { ...node('plugin'), effectCount: 1, effects: ['effect'] }
    const refreshed = buildRuntimeG6Data(
      [changedNode], [], [], [], [], { nodes: new Map(), edges: new Map() }, undefined, {},
    )

    expect(await syncRuntimeG6Data(
      graph, refreshed, runtimeG6TopologyKey(first), runtimeG6VisualKey(first),
    )).toBe('data')
    expect(graph.setData).toHaveBeenCalledOnce()
    expect(graph.draw).not.toHaveBeenCalled()
  })

  it('stops and releases a structural layout whose renderer promise never settles', async () => {
    vi.useFakeTimers()
    const graph = {
      setData: vi.fn(),
      render: vi.fn(() => new Promise<void>(() => undefined)),
      draw: vi.fn().mockResolvedValue(undefined),
      stopLayout: vi.fn(),
    }
    const data = buildRuntimeG6Data(
      [node('plugin')], [], [], [], [], { nodes: new Map(), edges: new Map() }, undefined, {},
    )
    const pending = syncRuntimeG6Data(graph, data, undefined, undefined)
    await vi.advanceTimersByTimeAsync(RUNTIME_G6_LAYOUT_BUDGET_MS)

    await expect(pending).resolves.toBe('render')
    expect(graph.stopLayout).toHaveBeenCalled()
    vi.useRealTimers()
  })
})
