// @vitest-environment jsdom
import { Context, Service, type Fiber } from '@deepseek-ai/cordis'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import { SlotRegistry } from '@deepseek-ai/dsh-client-runtime/client'
import { RuntimeAction, stackFooterActions } from '../src/client/RuntimeAction.tsx'
import { RuntimeExplorer } from '../src/client/RuntimeExplorer.tsx'
import type { RuntimeExplorerFace } from '../src/client/faces.ts'
import type { RuntimeActionFace } from '../src/client/faces.ts'
import { apply, inject } from '../src/client/index.ts'
import { apply as applyNode } from '../src/index.ts'

afterEach(cleanup)

const SNAPSHOT = {
  schemaVersion: 6,
  bootId: 'fixture-boot',
  snapshotSeq: 1,
  profile: 'fixture-web',
  observedAt: 1,
  refreshIntervalMs: 1000,
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
    current: 0, created: 0, disposed: 0, delta: 0, churn: 0, plugins: [], recent: [],
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
}

async function bench(withRuntimeExplorer = true) {
  const ctx = new Context()
  await ctx.plugin(SlotRegistry).await()
  ctx.provide('locale', new LocaleRuntime(ctx))
  let namespaceFiber: Fiber | undefined
  const mountRuntimeExplorer = async () => {
    if (ctx.get('remote.runtimeExplorer') !== undefined) return
    namespaceFiber = ctx.plugin({
      name: 'remote.runtimeExplorer',
      apply: (namespaceCtx) => {
        namespaceCtx.provide('remote.runtimeExplorer', { snapshot })
      },
    })
    await namespaceFiber.await()
  }
  class RemoteService extends Service {
    constructor(serviceCtx: Context) { super(serviceCtx, 'remote') }

    readonly $mount = vi.fn(async () => {
      await mountRuntimeExplorer()
      return async () => { await namespaceFiber?.dispose() }
    })
  }
  const snapshot = vi.fn().mockResolvedValue({ ok: true, value: SNAPSHOT })
  const remote = new RemoteService(ctx)
  if (withRuntimeExplorer) await mountRuntimeExplorer()
  return { ctx, slots: ctx.get('slots') as SlotRegistry, snapshot, remote }
}

function declare(slots: SlotRegistry): () => void {
  return slots.register({
    name: 'root',
    children: {
      'sidebar.footer.action': { kind: 'list', scope: 'root' },
      'shell.overlay': { kind: 'list', scope: 'root' },
    },
  } as never, () => null)
}

describe('ui-runtime browser plugin', () => {
  it('turns the display-contents footer anchor into a vertical action stack', () => {
    const view = render(
      <div data-slot="sidebar.footer.action" style={{ display: 'contents' }}>
        <div data-testid="plugin-market-entry" />
        <div data-testid="runtime-entry" />
      </div>,
    )
    const anchor = view.container.querySelector<HTMLElement>('[data-slot="sidebar.footer.action"]')!
    const runtimeEntry = view.getByTestId('runtime-entry')
    const stack = stackFooterActions(runtimeEntry)
    const style = getComputedStyle(anchor)

    expect(stack.boundary).toBe(anchor)
    expect(style.display).toBe('flex')
    expect(style.flexDirection).toBe('column')
    expect(style.width).toBe('100%')
    expect(anchor.children).toHaveLength(2)
    stack.restore()
    expect(anchor.style.display).toBe('contents')
  })

  it('keeps the Node half as an inert plugin entrypoint', () => {
    expect(() => { applyNode() }).not.toThrow()
  })

  it('registers both real DSH seats, reads lazily, and removes both contributions on unload', async () => {
    expect(inject).toEqual(['slots', 'locale', 'remote'])
    const b = await bench()
    declare(b.slots)
    const fiber = b.ctx.plugin({ inject: [...inject], apply })
    await fiber.await()

    const action = b.slots.entries('sidebar.footer.action')[0]!
    const overlay = b.slots.entries('shell.overlay')[0]!
    expect(action.options).toMatchObject({ id: 'dsh-insider', order: 80 })
    expect(action.component).toBe(RuntimeAction)
    expect(overlay.options).toMatchObject({ id: 'dsh-insider', order: 80 })
    expect(overlay.component).toBe(RuntimeExplorer)
    expect(b.snapshot).not.toHaveBeenCalled()

    const actionFace = (action.inject as unknown as () => RuntimeActionFace)()
    actionFace.onVisibilityChange(false)
    const face = (overlay.inject as unknown as () => RuntimeExplorerFace)()
    face.onVisibilityChange(true)
    await vi.waitFor(() => { expect(b.snapshot).toHaveBeenCalledOnce() })
    await vi.waitFor(() => { expect(face.hooks.runtime.getSnapshot().data).toEqual(SNAPSHOT) })
    face.onRefresh()
    await vi.waitFor(() => { expect(b.snapshot).toHaveBeenCalledTimes(2) })
    face.onVisibilityChange(false)

    await fiber.dispose()
    expect(b.slots.entries('sidebar.footer.action')).toHaveLength(0)
    expect(b.slots.entries('shell.overlay')).toHaveLength(0)
    await b.ctx.fiber.dispose()
  })

  it('mounts its own generated Remote contribution when the aggregate does not provide it', async () => {
    const b = await bench(false)
    declare(b.slots)
    const fiber = b.ctx.plugin({ inject: [...inject], apply })
    await fiber.await()

    expect(b.remote.$mount).toHaveBeenCalledOnce()
    expect(b.remote.$mount).toHaveBeenCalledWith(expect.objectContaining({
      package: '@deepseek-ai/dsh-runtime',
      descriptors: [expect.objectContaining({ namespace: 'runtimeExplorer', method: 'snapshot' })],
    }))
    await vi.waitFor(() => { expect(b.slots.entries('shell.overlay')).toHaveLength(1) })
    const overlay = b.slots.entries('shell.overlay')[0]!
    const face = (overlay.inject as unknown as () => RuntimeExplorerFace)()
    face.onVisibilityChange(true)
    await vi.waitFor(() => { expect(b.snapshot).toHaveBeenCalledOnce() })
    await vi.waitFor(() => { expect(face.hooks.runtime.getSnapshot().data).toEqual(SNAPSHOT) })
    await b.ctx.fiber.dispose()
  })

  it('waits for late slot declarations and re-registers after declarer replacement', async () => {
    const b = await bench()
    const fiber = b.ctx.plugin({ inject: [...inject], apply })
    await fiber.await()
    expect(b.slots.entries('sidebar.footer.action')).toHaveLength(0)
    const stop = declare(b.slots)
    await vi.waitFor(() => { expect(b.slots.entries('shell.overlay')).toHaveLength(1) })
    stop()
    expect(b.slots.entries('shell.overlay')).toHaveLength(0)
    declare(b.slots)
    await vi.waitFor(() => { expect(b.slots.entries('sidebar.footer.action')).toHaveLength(1) })
    await b.ctx.fiber.dispose()
  })

  it('surfaces a failed Remote envelope through the bounded browser source error state', async () => {
    const b = await bench()
    b.snapshot.mockResolvedValue({
      ok: false,
      error: { code: 'RUNTIME_UNAVAILABLE', message: 'snapshot unavailable' },
    })
    declare(b.slots)
    const report = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const fiber = b.ctx.plugin({ inject: [...inject], apply })
    await fiber.await()
    const overlay = b.slots.entries('shell.overlay')[0]!
    const face = (overlay.inject as unknown as () => RuntimeExplorerFace)()
    face.onVisibilityChange(true)
    await vi.waitFor(() => {
      expect(face.hooks.runtime.getSnapshot().error).toContain('RUNTIME_UNAVAILABLE')
    })
    expect(report).toHaveBeenCalledOnce()
    await b.ctx.fiber.dispose()
  })
})
