import { afterEach, describe, expect, it, vi } from 'vitest'
import type { RuntimeExplorerSnapshot } from '@deepseek-ai/dsh-api-remotes/client'
import { createRuntimeSource } from '../src/client/source.ts'

const snapshot = (observedAt: number, refreshIntervalMs = 500): RuntimeExplorerSnapshot => ({
  schemaVersion: 6,
  bootId: 'fixture-boot',
  snapshotSeq: observedAt,
  profile: 'fixture-web',
  observedAt,
  refreshIntervalMs,
  overview: {
    status: 'running', uptimeMs: 1_000,
    contexts: 1, plugins: 0, fibers: 0, turns: 0,
    active: 0, effects: 0, events: 0, errors: 0,
    loaderBreakdown: { total: 0, statuses: { pending: 0, active: 0, disposed: 0, failed: 0 }, byType: [] },
    fiberBreakdown: { total: 0, statuses: { pending: 0, active: 0, disposed: 0, failed: 0 }, byType: [] },
    serviceBreakdown: {
      total: 0, implementations: 0,
      statuses: { pending: 0, active: 0, disposed: 0, failed: 0 }, byType: [],
    },
  },
  effectActivity: {
    windowMs: 300_000, availableSince: 1, complete: true, droppedTransitions: 0,
    current: 1, created: 0, disposed: 0, delta: 0, churn: 0,
    plugins: [{
      pluginId: 'fixture-plugin', entryId: 'fixture-entry', moduleName: 'fixture-module', label: 'Fixture',
      current: 1, created: 0, disposed: 0, delta: 0, churn: 0,
      trend: [{ time: observedAt, current: 1, created: 0, disposed: 0 }],
    }],
    recent: [],
  },
  graph: { nodes: [], edges: [], fibers: [], services: [], serviceRelations: [] },
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
  limits: { transitionLimit: 4096, traceEventLimit: 256 },
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('runtime Remote source', () => {
  it('single-flights an open refresh, publishes its result, polls at the Host cadence, and stops when hidden', async () => {
    vi.useFakeTimers()
    const first = Promise.withResolvers<RuntimeExplorerSnapshot>()
    const read = vi.fn<() => Promise<RuntimeExplorerSnapshot>>()
      .mockReturnValueOnce(first.promise)
      .mockResolvedValue(snapshot(2))
    const source = createRuntimeSource(read, vi.fn())
    const listener = vi.fn()
    const off = source.subscribe(listener)

    source.setActive(true)
    source.refresh()
    expect(read).toHaveBeenCalledOnce()
    expect(source.getSnapshot()).toEqual({ data: undefined, loading: true, error: undefined })
    first.resolve(snapshot(1))
    await first.promise
    await Promise.resolve()
    expect(source.getSnapshot().data?.observedAt).toBe(1)

    await vi.advanceTimersByTimeAsync(500)
    expect(read).toHaveBeenCalledTimes(2)
    expect(source.getSnapshot().data?.observedAt).toBe(2)
    source.setActive(false)
    await vi.advanceTimersByTimeAsync(1000)
    expect(read).toHaveBeenCalledTimes(2)
    expect(listener).toHaveBeenCalled()
    off()
    source.dispose()
  })

  it('backs off unchanged runtime truth and preserves heavy section identities across clock-only polls', async () => {
    vi.useFakeTimers()
    const read = vi.fn<() => Promise<RuntimeExplorerSnapshot>>()
      .mockResolvedValueOnce(snapshot(1))
      .mockResolvedValueOnce(snapshot(2))
      .mockResolvedValueOnce(snapshot(3))
      .mockResolvedValueOnce(snapshot(4))
    const source = createRuntimeSource(read, vi.fn())

    source.setActive(true)
    await vi.advanceTimersByTimeAsync(0)
    expect(source.getSnapshot().data?.snapshotSeq).toBe(1)
    const first = source.getSnapshot().data!

    await vi.advanceTimersByTimeAsync(500)
    expect(read).toHaveBeenCalledTimes(2)
    expect(source.getSnapshot().data?.graph).toBe(first.graph)
    expect(source.getSnapshot().data?.trace).toBe(first.trace)
    expect(source.getSnapshot().data?.effectActivity).toBe(first.effectActivity)

    await vi.advanceTimersByTimeAsync(500)
    expect(read).toHaveBeenCalledTimes(3)
    await vi.advanceTimersByTimeAsync(999)
    expect(read).toHaveBeenCalledTimes(3)
    await vi.advanceTimersByTimeAsync(1)
    expect(read).toHaveBeenCalledTimes(4)
    source.dispose()
  })

  it('keeps the previous snapshot on failure, reports the error, and ignores a late result after disposal', async () => {
    const report = vi.fn()
    const read = vi.fn<() => Promise<RuntimeExplorerSnapshot>>()
      .mockResolvedValueOnce(snapshot(1))
      .mockRejectedValueOnce(new Error('wire unavailable'))
    const source = createRuntimeSource(read, report)
    source.refresh()
    await vi.waitFor(() => { expect(source.getSnapshot().data?.observedAt).toBe(1) })
    source.refresh()
    await vi.waitFor(() => { expect(source.getSnapshot().error).toBe('wire unavailable') })
    expect(source.getSnapshot().data?.observedAt).toBe(1)
    expect(report).toHaveBeenCalledOnce()

    const late = Promise.withResolvers<RuntimeExplorerSnapshot>()
    const pending = createRuntimeSource(() => late.promise, vi.fn())
    const listener = vi.fn()
    pending.subscribe(listener)
    pending.refresh()
    listener.mockClear()
    pending.dispose()
    late.resolve(snapshot(3))
    await late.promise
    await Promise.resolve()
    expect(listener).not.toHaveBeenCalled()
    expect(pending.getSnapshot().data).toBeUndefined()
    pending.setActive(true)
    pending.refresh()

    const lateFailure = Promise.withResolvers<RuntimeExplorerSnapshot>()
    const disposedFailure = createRuntimeSource(() => lateFailure.promise, report)
    disposedFailure.refresh()
    disposedFailure.dispose()
    lateFailure.reject(new Error('late wire failure'))
    await lateFailure.promise.catch(() => undefined)
    await Promise.resolve()
    expect(report).toHaveBeenCalledOnce()
  })

  it('normalizes a non-Error rejection without scheduling a retry', async () => {
    const read = vi.fn<() => Promise<RuntimeExplorerSnapshot>>().mockRejectedValue('offline')
    const source = createRuntimeSource(read, vi.fn())
    source.setActive(true)
    await vi.waitFor(() => { expect(source.getSnapshot().error).toBe('runtime snapshot failed') })
    source.setActive(false)
  })

  it('rejects an unsupported snapshot schema while keeping the last compatible runtime truth', async () => {
    const report = vi.fn()
    const unsupported = { ...snapshot(2), schemaVersion: 99 } as unknown as RuntimeExplorerSnapshot
    const read = vi.fn<() => Promise<RuntimeExplorerSnapshot>>()
      .mockResolvedValueOnce(snapshot(1))
      .mockResolvedValueOnce(unsupported)
    const source = createRuntimeSource(read, report)

    source.refresh()
    await vi.waitFor(() => { expect(source.getSnapshot().data?.snapshotSeq).toBe(1) })
    source.refresh()
    await vi.waitFor(() => { expect(source.getSnapshot().error).toBe('unsupported runtime snapshot schema') })

    expect(source.getSnapshot().data?.snapshotSeq).toBe(1)
    expect(report).toHaveBeenCalledOnce()
  })
})
