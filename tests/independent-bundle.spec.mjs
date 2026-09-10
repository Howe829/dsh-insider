import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import test from 'node:test'
import { pathToFileURL } from 'node:url'
import { load } from 'js-yaml'
import { runInContext } from 'node:vm'
import { JSDOM } from 'jsdom'
import * as React from 'react'
import * as ReactDOM from 'react-dom'
import * as jsxRuntime from 'react/jsx-runtime'
import * as clientStore from '@deepseek-ai/dsh-client-store'

const root = resolve(import.meta.dirname, '..')
const packageRoot = resolve(root, 'packages/dsh-insider')

async function text(path) {
  return readFile(resolve(packageRoot, path), 'utf8')
}

test('Desktop 2.2 module table loads the shipped client and drives its shared viewing store', async (t) => {
  let entry
  const dom = new JSDOM('', { url: 'http://localhost', runScripts: 'outside-only' })
  t.after(() => dom.window.close())
  dom.window.__ModuleLoader__ = { load: (value) => { entry = value } }
  runInContext(await text('lib/client.js'), dom.getInternalVMContext())
  const modules = new Map([
    ['react', React],
    ['react-dom', ReactDOM],
    ['react/jsx-runtime', jsxRuntime],
    ['@deepseek-ai/dsh-client-store', clientStore],
    // Components are registered but not rendered in this module-loading test.
    ['@deepseek-ai/dsh-client-ui-primitives', {}],
  ])
  const client = entry.factory((id) => {
    assert.ok(modules.has(id), `Desktop module table has no ${id}`)
    return modules.get(id)
  })
  assert.equal(entry.id, '@howardchan/dsh-insider')
  assert.equal(typeof client.apply, 'function')
  const store = client.createRuntimeStore().create()
  store.actions.setOpen(true)
  store.actions.setCategory('service')
  store.actions.select({ kind: 'service', id: 'remote.runtimeExplorer' })
  assert.equal(store.getSnapshot().open, true)
  assert.equal(store.getSnapshot().category, 'service')
  assert.equal(store.getSnapshot().selection.id, 'remote.runtimeExplorer')
  store.actions.setTab('trace')
  assert.equal(store.getSnapshot().tab, 'trace')
  assert.equal(store.getSnapshot().selection, undefined)
  assert.equal(store.getSnapshot().category, 'all')
  store.actions.setOpen(false)
  assert.equal(store.getSnapshot().open, false)
  const manifest = JSON.parse(await text('package.json'))
  assert.ok(!manifest.dsh.client.inject.includes('@deepseek-ai/dsh-client-runtime'))
  assert.equal(manifest.peerDependencies['@deepseek-ai/dsh-client-runtime'], undefined)
})

test('ships one dual-face package and one Loader row', async () => {
  const manifest = JSON.parse(await text('package.json'))
  const patch = await text('cordis.patch.yml')

  assert.equal(manifest.name, '@howardchan/dsh-insider')
  assert.equal(manifest.dsh.bundle.patch, './cordis.patch.yml')
  assert.equal(manifest.dsh.client.platform, 'web')
  assert.deepEqual(load(patch), [{
    insert: [{ id: 'dsh-insider', name: '@howardchan/dsh-insider' }],
  }])
  assert.match(patch, /id: dsh-insider/)
})

test('client bundle registers itself and mounts its Remote contribution', async () => {
  const client = await text('lib/client.js')

  assert.match(client, /id: "dsh-insider"/)
  assert.match(client, /runtimeExplorer\/snapshot/)
  assert.match(client, /ctx\.remote\.\$mount\(TYPERT_REMOTE\)/)
  assert.match(client, /ctx\.get\("remote\.runtimeExplorer"\)/)
  assert.match(client, /inject\(\["remote\.runtimeExplorer"\]/)
  assert.match(client, /FOOTER_SLOT = "\[data-slot=\\"sidebar\.footer\.action\\"\]"/)
  assert.match(client, /style\.setProperty\("display", "flex"\)/)
  assert.match(client, /style\.setProperty\("flex-direction", "column"\)/)
  assert.match(client, /footer\.boundary\.getBoundingClientRect\(\)/)
  assert.match(client, /footer\.restore\(\)/)
  assert.match(client, /#4ade80/)
  assert.match(client, /#5eead4/)
  assert.doesNotMatch(client, /#6ee7b7/)
  assert.doesNotMatch(client, /@deepseek-ai\/dsh-client-ui-runtime/)
  assert.doesNotMatch(client, /@deepseek-ai\/dsh-runtime/)
})

test('Host and generated Remote artifacts share the public package identity', async () => {
  const host = await text('lib/index.js')
  const hostTypert = await text('lib/typert.host.js')
  const client = await text('lib/client.js')
  const remote = await text('lib/typert.remote-client.js')
  const remoteTypes = await text('lib/typert.remote-client.d.ts')

  assert.match(host, /Symbol\.for\("@howardchan\/dsh-insider\/process-state"\)/)
  assert.match(host, /Symbol\.for\("@howardchan\/dsh-runtime\/process-state"\)/)
  assert.match(remote, /package: '@howardchan\/dsh-insider'/)
  assert.match(remote, /@howardchan\/dsh-insider#runtimeExplorer\/snapshot/)
  assert.match(remoteTypes, /from '@howardchan\/dsh-insider\/types'/)
  assert.match(hostTypert, /'schemaVersion': z\.literal\(6\)/)
  assert.match(hostTypert, /'fibers': z\.array\(z\.object\(/)
  assert.match(remote, /'schemaVersion': z\.literal\(6\)/)
  assert.match(remote, /'fibers': z\.array\(z\.object\(/)
  assert.match(client, /"schemaVersion": literal\(6\)/)
  assert.match(client, /"fibers": array\(object\(/)
})

test('generated transport schema accepts the Fiber-aware snapshot contract', async () => {
  const { TYPERT } = await import(pathToFileURL(resolve(root, 'packages/runtime/lib/typert.host.js')))
  const schema = TYPERT.invocations[0].result.schema
  const statuses = { pending: 1, active: 0, disposed: 0, failed: 0 }
  const emptyCollection = { total: 0, statuses: { pending: 0, active: 0, disposed: 0, failed: 0 }, byType: [] }
  const result = schema.safeParse({
    schemaVersion: 6,
    bootId: 'boot',
    snapshotSeq: 1,
    profile: 'desktop',
    observedAt: 1,
    refreshIntervalMs: 1000,
    overview: {
      status: 'running', uptimeMs: 1, contexts: 2, plugins: 1, fibers: 1, turns: 0,
      active: 0, effects: 0, events: 0, errors: 0,
      loaderBreakdown: emptyCollection,
      fiberBreakdown: { total: 1, statuses, byType: [] },
      serviceBreakdown: { ...emptyCollection, implementations: 0 },
    },
    effectActivity: {
      windowMs: 300000, availableSince: 1, complete: true, droppedTransitions: 0,
      current: 0, created: 0, disposed: 0, delta: 0, churn: 0, plugins: [], recent: [],
    },
    graph: {
      nodes: [], edges: [], services: [], serviceRelations: [],
      fibers: [{
        id: 'boot:41', uid: 41, name: 'nested-tools', moduleName: '@fixture/nested-tools',
        ownerNodeId: 'provider', ownerEntryId: 'provider-entry', parentFiberId: 'boot:40',
        entryRoot: false, phase: 'pending', provides: [], injects: ['tools'], missing: ['tools'], effectCount: 0,
      }],
    },
    trace: [],
    capabilities: {
      fiberInstances: true, ownershipEdges: true, scopes: false, lifecycleTransitions: true,
      turnPluginAttribution: false, eventDispatch: 'none', payloadCapture: false,
    },
    limits: { transitionLimit: 4096, traceEventLimit: 256 },
  })

  assert.equal(result.success, true, result.success ? undefined : result.error.message)
})
