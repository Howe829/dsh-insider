/** REAL-composition coverage: cordis.yml boots the DSH Insider gateway through Loader + Include. */

import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { Context, Service, type Plugin } from '@deepseek-ai/cordis'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import Include from '@deepseek-ai/cordis-plugin-include'
import { Session, SessionId, type SessionEvent } from '@deepseek-ai/dsh-session'
import RuntimeExplorerGateway from '../src/index.ts'

const RUNTIME = '@deepseek-ai/dsh-runtime'
const PROVIDER = '@fixture/runtime-provider'
const CONSUMER = '@fixture/runtime-consumer'

class LoaderDependency extends Service {
  constructor(ctx: Context) { super(ctx, 'loaderDependency') }
}

const provider: Plugin.Function = (ctx) => { new LoaderDependency(ctx) }
const consumer: Plugin.Object = { inject: ['loaderDependency'], apply() {} }

let root: string | undefined
let context: Context | undefined

afterEach(async () => {
  await context?.fiber.dispose()
  context = undefined
  if (root !== undefined) await rm(root, { recursive: true, force: true })
  root = undefined
})

async function loadComposition(seedLegacyState = false): Promise<Context> {
  root = await mkdtemp(join(tmpdir(), 'dsh-runtime-loader-'))
  const configPath = join(root, 'cordis.yml')
  await writeFile(configPath, [
    `- name: '${PROVIDER}'`,
    `- name: '${CONSUMER}'`,
    `- name: '${RUNTIME}'`,
    '  config:',
    '    traceLimit: 4',
    '    effectLimit: 3',
    '    refreshIntervalMs: 750',
    '',
  ].join('\n'))

  context = new Context()
  if (seedLegacyState) {
    Object.defineProperty(context.root, Symbol.for('@howardchan/dsh-runtime/process-state'), {
      value: {
        bootId: 'legacy-dsh-runtime-boot',
        snapshotSeq: 0,
        nextRuntimeId: 0,
        eventCount: 0,
        turnCount: 0,
        errorCount: 0,
        runtimeIds: new WeakMap(),
        nextServiceId: 0,
        serviceIds: new Map(),
      },
    })
  }
  context.baseUrl = pathToFileURL(root).href + '/'
  await context.plugin(Loader)
  context.loader.builtins.include = Include
  const modules = new Map<string, unknown>([
    [PROVIDER, provider],
    [CONSUMER, consumer],
    [RUNTIME, RuntimeExplorerGateway],
  ])
  context.loader.internal = {
    version: 'v2',
    async import(specifier: string) {
      if (!modules.has(specifier)) throw new Error(`unexpected Loader import: ${specifier}`)
      return modules.get(specifier)
    },
  } as unknown as NonNullable<typeof context.loader.internal>
  await context.loader.create({ name: 'cordis:include', config: { path: pathToFileURL(configPath).href } })
  await context.loader.await()
  return context
}

describe('DSH Insider real Loader composition', () => {
  it('adopts the legacy public process state without resetting runtime identity', async () => {
    const ctx = await loadComposition(true)
    const runtime = ctx.get('runtimeExplorer') as RuntimeExplorerGateway
    expect(runtime.snapshot().bootId).toBe('legacy-dsh-runtime-boot')
    expect((ctx.root as Context & Record<PropertyKey, unknown>)[
      Symbol.for('@deepseek-ai/dsh-runtime/process-state')
    ]).toBe((ctx.root as Context & Record<PropertyKey, unknown>)[
      Symbol.for('@howardchan/dsh-runtime/process-state')
    ])
  })

  it('serves the assembled dependency edge, captures a real bus event, and removes capture on unload', async () => {
    const ctx = await loadComposition()
    const unloaded = [...ctx.loader.entries()]
      .filter(entry => entry.fiber === undefined && !entry.disabled)
      .map(entry => entry.options.name)
    expect(unloaded).toEqual([])

    const runtime = ctx.get('runtimeExplorer') as RuntimeExplorerGateway
    const first = runtime.snapshot()
    expect(first).toMatchObject({
      schemaVersion: 6,
      bootId: expect.any(String),
      snapshotSeq: 1,
      capabilities: { payloadCapture: false },
      limits: { transitionLimit: 4096, traceEventLimit: 4 },
    })
    expect(first.refreshIntervalMs).toBe(750)
    const rootState = (ctx.root as Context & Record<PropertyKey, unknown>)[
      Symbol.for('@deepseek-ai/dsh-runtime/process-state')
    ]
    const legacyPublicState = (ctx.root as Context & Record<PropertyKey, unknown>)[
      Symbol.for('@howardchan/dsh-runtime/process-state')
    ]
    expect(legacyPublicState).toBe(rootState)
    expect(first.graph.nodes.map(node => node.moduleName)).toEqual(expect.arrayContaining([PROVIDER, CONSUMER, RUNTIME]))
    expect(first.graph.edges.some(edge => edge.services.includes('loaderDependency'))).toBe(true)

    const session = Session.create(SessionId('loader-session'))
    ctx.emit('session/event', session, {
      type: 'step/start', seq: 7, time: 100, data: { turn: 2, step: 1 },
    } as SessionEvent)
    expect(runtime.snapshot().trace).toEqual([expect.objectContaining({
      id: 'loader-session:7', type: 'step/start', turn: 2, step: 1,
    })])

    const runtimeEntry = [...ctx.loader.entries()].find(entry => entry.options.name === RUNTIME)!
    await runtimeEntry.fiber!.dispose()
    expect(ctx.get('runtimeExplorer')).toBeUndefined()
    ctx.emit('session/event', session, {
      type: 'step/end', seq: 8, time: 110, data: { turn: 2, step: 1 },
    } as SessionEvent)
    expect(runtime.snapshot().trace).toHaveLength(1)
  })
})
