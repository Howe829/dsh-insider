/** DSH Insider sidebar entry and frame overlay assembly. */

import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import runtimeExplorerRemote from '@deepseek-ai/dsh-runtime/remote'
import type { RuntimeActionFace, RuntimeExplorerFace } from './faces.ts'
import { en, zh, type RuntimeLocaleKey } from './locales.ts'
import { RuntimeAction } from './RuntimeAction.tsx'
import { RuntimeExplorer } from './RuntimeExplorer.tsx'
import { createRuntimeSource } from './source.ts'
import { createRuntimeStore } from './store.ts'

export type { RuntimeLocaleKey } from './locales.ts'
export type { RuntimeLifecycleStatus } from './graph.ts'
export type { RuntimeCategoryFilter, RuntimePhaseFilter, RuntimeSelection, RuntimeStoreState, RuntimeTab } from './store.ts'
export { createRuntimeStore } from './store.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** DSH Insider graph and request trace copy. */
    runtime: RuntimeLocaleKey
  }
}

const NS = 'runtime'

/** Services required by the Remote source and both slot contributions. */
export const inject = ['slots', 'locale', 'remote']

/** Mount DSH Insider as one sidebar action and one frame overlay. */
export async function apply(ctx: ClientContext): Promise<void> {
  if (ctx.get('remote.runtimeExplorer') === undefined) {
    await ctx.effect(
      () => ctx.remote.$mount(runtimeExplorerRemote),
      'ui-runtime: runtimeExplorer Remote contribution',
    )
  }
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-runtime: dictionaries')
  await ctx.inject(['remote.runtimeExplorer'], (runtimeCtx) => {
    const store = createRuntimeStore()
    const source = createRuntimeSource(async () => {
      const result = await runtimeCtx.remote.runtimeExplorer.snapshot()
      if (!result.ok) {
        throw new Error(`runtimeExplorer.snapshot failed: ${result.error.code}: ${result.error.message}`)
      }
      return result.value
    }, (error) => { console.error('[dsh-insider] reading the runtime snapshot failed:', error) })
    const onVisibilityChange = (open: boolean): void => { source.setActive(open) }
    const onRefresh = (): void => { source.refresh() }
    runtimeCtx.effect(() => () => { source.dispose() }, 'ui-runtime: source lifecycle')

    runtimeCtx.slots.inject('sidebar.footer.action', () => runtimeCtx.slots.register({
      name: 'sidebar.footer.action',
      id: 'dsh-insider',
      order: 80,
      locale: NS,
      store,
      inject: (): RuntimeActionFace => ({ onVisibilityChange }),
    }, RuntimeAction))

    runtimeCtx.slots.inject('shell.overlay', () => runtimeCtx.slots.register({
      name: 'shell.overlay',
      id: 'dsh-insider',
      order: 80,
      locale: NS,
      store,
      inject: (): RuntimeExplorerFace => ({
        hooks: { runtime: source },
        onVisibilityChange,
        onRefresh,
      }),
    }, RuntimeExplorer))
  })
}
