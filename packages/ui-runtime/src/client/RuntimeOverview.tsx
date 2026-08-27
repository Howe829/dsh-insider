/** Read-only process, Cordis, and Agent health summary. */

import type {
  RuntimeEffectActivitySnapshot, RuntimeOverviewSnapshot, RuntimeOverviewStatus, RuntimePluginCategory,
} from '@deepseek-ai/dsh-api-remotes/client'
import type { RuntimeLocaleKey } from './locales.ts'
import css from './RuntimeExplorer.module.css'
import { RuntimeStatusCard } from './RuntimeStatusCard.tsx'
import { RuntimeActivity } from './RuntimeActivity.tsx'

const METRICS = [
  'effects', 'turns', 'events',
] as const satisfies readonly RuntimeLocaleKey[]

/** Format a process duration as an unambiguous hours:minutes:seconds clock. */
export function formatRuntimeUptime(uptimeMs: number): string {
  const totalSeconds = Math.max(0, Math.floor(uptimeMs / 1000))
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  return [hours, minutes, seconds].map(value => String(value).padStart(2, '0')).join(':')
}

export function RuntimeOverview({
  overview, activity, t, onInspect,
}: {
  overview: RuntimeOverviewSnapshot
  activity: RuntimeEffectActivitySnapshot
  t: (key: RuntimeLocaleKey) => string
  onInspect?: (
    kind: 'plugin' | 'fiber' | 'service',
    category: RuntimePluginCategory | undefined,
    status: RuntimeOverviewStatus,
  ) => void
}) {
  const values: Record<typeof METRICS[number], number> = {
    turns: overview.turns,
    effects: overview.effects,
    events: overview.events,
  }
  const fiberContexts = Math.max(0, overview.contexts - 1)
  return (
    <section className={css.overviewView} aria-labelledby="runtime-overview-title">
      <div className={css.overviewHeading}>
        <div>
          <span className={css.overviewEyebrow}>DSH · Cordis</span>
          <h2 id="runtime-overview-title">{t('overviewTitle')}</h2>
          <p>{t('overviewDescription')}</p>
        </div>
        <dl className={css.overviewStatus} aria-label={t('runtimeStatus')}>
          <div data-status="running">
            <dt>{t('runtimeStatus')}</dt>
            <dd><i aria-hidden />{t('running')}</dd>
          </div>
          <div>
            <dt>{t('uptime')}</dt>
            <dd><time>{formatRuntimeUptime(overview.uptimeMs)}</time></dd>
          </div>
        </dl>
      </div>
      <dl className={css.overviewMetrics} aria-label={t('overviewMetrics')}>
        <div className={`${css.overviewMetricCard} ${css.overviewContextMetric}`} data-metric="contexts">
          <dt>{t('contexts')}</dt>
          <dd className={css.overviewContextTotal}>{overview.contexts.toLocaleString()}</dd>
          <dd className={css.overviewContextMetricBody}>
            <dl className={css.overviewContextBreakdown} aria-label={t('contextComposition')}>
              <div>
                <dt>{t('rootContext')}</dt>
                <dd>1</dd>
              </div>
              <div>
                <dt>{t('fiberContexts')}</dt>
                <dd>{fiberContexts.toLocaleString()}</dd>
              </div>
            </dl>
          </dd>
        </div>
        {METRICS.map(key => (
          <div className={css.overviewMetricCard} key={key} data-metric={key}>
            <dt>{t(key)}</dt>
            <dd>{values[key].toLocaleString()}</dd>
          </div>
        ))}
      </dl>
      <RuntimeActivity activity={activity} t={t} />
      <div className={css.overviewDistributions}>
        <RuntimeStatusCard
          kind="plugin"
          title={t('loaderTitle')}
          unit={t('pluginsUnit')}
          chartTitle={t('pluginsByType')}
          breakdown={overview.loaderBreakdown}
          t={t}
          onInspect={onInspect}
        />
        <RuntimeStatusCard
          kind="fiber"
          title={t('fibers')}
          unit={t('fibersUnit')}
          chartTitle={t('fibersByPluginType')}
          breakdown={overview.fiberBreakdown}
          t={t}
          onInspect={onInspect}
        />
        <RuntimeStatusCard
          kind="service"
          title={t('servicesTitle')}
          unit={t('serviceNamesUnit')}
          chartTitle={t('servicesByProviderType')}
          breakdown={overview.serviceBreakdown}
          t={t}
          onInspect={onInspect}
        />
      </div>
    </section>
  )
}
