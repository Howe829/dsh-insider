/** DSH Insider sidebar entry and frame overlay assembly. */
import type { Context as ClientContext } from '@deepseek-ai/cordis';
import { type RuntimeLocaleKey } from './locales.ts';
export type { RuntimeLocaleKey } from './locales.ts';
export type { RuntimeLifecycleStatus } from './graph.ts';
export type { RuntimeCategoryFilter, RuntimePhaseFilter, RuntimeSelection, RuntimeStoreState, RuntimeTab } from './store.ts';
export { createRuntimeStore } from './store.ts';
declare module '@deepseek-ai/dsh-client-ui-slots' {
    interface LocaleNamespaceMap {
        /** DSH Insider graph and request trace copy. */
        runtime: RuntimeLocaleKey;
    }
}
/** Services required by the Remote source and both slot contributions. */
export declare const inject: string[];
/** Mount DSH Insider as one sidebar action and one frame overlay. */
export declare function apply(ctx: ClientContext): Promise<void>;
//# sourceMappingURL=index.d.ts.map