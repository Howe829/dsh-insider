/** Shared lifecycle summary and Recharts Type by Status card. */

import type { ComponentType, SVGProps } from 'react'
import {
  CheckCircleIcon, ClockIcon, ExclamationTriangleIcon, MinusCircleIcon,
} from '@heroicons/react/24/outline'
import {
  Bar, BarChart, ResponsiveContainer, Tooltip as RechartsTooltip, XAxis, YAxis,
} from 'recharts'
import type {
  RuntimeCollectionOverview, RuntimeOverviewStatus, RuntimePluginCategory, RuntimeServiceOverview,
  RuntimeTypeStatusBreakdown,
} from '@deepseek-ai/dsh-api-remotes/client'
import type { RuntimeLocaleKey } from './locales.ts'
import css from './RuntimeExplorer.module.css'

type Translate = (key: RuntimeLocaleKey) => string
type StatusIcon = ComponentType<SVGProps<SVGSVGElement>>

const STATUS_ITEMS = [
  { key: 'pending', label: 'pending', Icon: ClockIcon, color: 'var(--dsw-alias-state-warn-primary)' },
  { key: 'active', label: 'active', Icon: CheckCircleIcon, color: 'var(--dsw-alias-state-success-primary)' },
  { key: 'disposed', label: 'disposed', Icon: MinusCircleIcon, color: 'var(--dsw-alias-label-tertiary)' },
  { key: 'failed', label: 'failed', Icon: ExclamationTriangleIcon, color: 'var(--dsw-alias-state-error-primary)' },
] as const satisfies ReadonlyArray<{
  key: RuntimeOverviewStatus
  label: RuntimeLocaleKey
  Icon: StatusIcon
  color: string
}>

const PROVIDER_STATUS_ITEMS = STATUS_ITEMS.filter(status => status.key !== 'disposed')

const CATEGORY_LABELS = {
  core: 'categoryCore',
  agent: 'categoryAgent',
  model: 'categoryModel',
  tool: 'categoryTool',
  session: 'categorySession',
  interface: 'categoryInterface',
  extension: 'categoryExtension',
} as const satisfies Record<RuntimePluginCategory, RuntimeLocaleKey>

interface RuntimeChartRow extends RuntimeTypeStatusBreakdown {
  readonly label: string
}

interface RuntimeTooltipProps {
  readonly active: boolean | undefined
  readonly payload: readonly { readonly payload?: unknown }[] | undefined
  readonly t: Translate
}

function RuntimeStatusTooltip({
  active, payload, t, statusItems = STATUS_ITEMS,
}: RuntimeTooltipProps & { readonly statusItems?: typeof STATUS_ITEMS | typeof PROVIDER_STATUS_ITEMS }) {
  if (active !== true || payload === undefined || payload.length === 0) return null
  const row = payload[0]?.payload as RuntimeChartRow | undefined
  if (row === undefined) return null
  return (
    <div className={css.overviewChartTooltip} role="status">
      <strong>{row.label}</strong>
      <span>{row.total.toLocaleString()} {t('items')}</span>
      <dl>
        {statusItems.map(status => (
          <div key={status.key} data-status={status.key}>
            <dt><i style={{ background: status.color }} aria-hidden />{t(status.label)}</dt>
            <dd>{row[status.key].toLocaleString()}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}

export function RuntimeStatusCard({
  kind, title, unit, chartTitle, breakdown, t, onInspect,
}: {
  kind: 'plugin' | 'fiber' | 'service'
  title: string
  unit: string
  chartTitle: string
  breakdown: RuntimeCollectionOverview | RuntimeServiceOverview
  t: Translate
  onInspect: ((
    kind: 'plugin' | 'fiber' | 'service',
    category: RuntimePluginCategory | undefined,
    status: RuntimeOverviewStatus,
  ) => void) | undefined
}) {
  const rows: RuntimeChartRow[] = breakdown.byType.map(row => ({
    ...row,
    label: t(CATEGORY_LABELS[row.category]),
  }))
  const serviceBreakdown = 'implementations' in breakdown ? breakdown : undefined
  const statusItems = serviceBreakdown === undefined ? STATUS_ITEMS : PROVIDER_STATUS_ITEMS
  const chartHeight = Math.max(36, rows.length * 30)
  return (
    <article className={css.overviewDistributionCard} aria-label={title}>
      <header>
        <h3>{title}</h3>
        <p><strong>{breakdown.total.toLocaleString()}</strong> {unit}</p>
      </header>
      {serviceBreakdown !== undefined && <h4 className={css.overviewProviderStatusTitle}>{t('providerFiberStatus')}</h4>}
      <ul
        className={css.overviewStatusSummary}
        data-columns={statusItems.length}
        aria-label={`${title} ${serviceBreakdown === undefined ? t('statusSummary') : t('providerFiberStatus')}`}
      >
        {statusItems.map(({ key, label, Icon, color }) => (
          <li key={key} data-status={key}>
            <button type="button" onClick={() => { onInspect?.(kind, undefined, key) }}>
              <span><Icon width={15} color={color} aria-hidden />{t(label)}</span>
              <strong>{breakdown.statuses[key].toLocaleString()}</strong>
            </button>
          </li>
        ))}
      </ul>
      <section className={css.overviewChartSection} aria-label={chartTitle}>
        <h4>{chartTitle}</h4>
        {rows.length === 0 ? (
          <p className={css.overviewChartEmpty}>{t('noRuntimeData')}</p>
        ) : (
          <>
            <div className={css.overviewChartLayout} style={{ height: chartHeight }}>
              <div className={css.overviewChartLabels} aria-hidden>
                {rows.map(row => <span key={row.category}>{row.label}</span>)}
              </div>
              <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                <BarChart
                  accessibilityLayer
                  data={rows}
                  layout="vertical"
                  margin={{ top: 2, right: 2, bottom: 2, left: 2 }}
                  barCategoryGap="34%"
                >
                  <XAxis type="number" hide domain={[0, 'dataMax']} />
                  <YAxis type="category" hide dataKey="category" />
                  <RechartsTooltip
                    cursor={{ fill: 'var(--dsw-alias-bg-layer-2)' }}
                    content={props => (
                      <RuntimeStatusTooltip
                        active={props.active}
                        payload={props.payload}
                        t={t}
                        statusItems={statusItems}
                      />
                    )}
                  />
                  {statusItems.map(status => (
                    <Bar
                      key={status.key}
                      dataKey={status.key}
                      name={t(status.label)}
                      stackId="status"
                      fill={status.color}
                      isAnimationActive={false}
                      onClick={(item) => {
                        const row = item.payload as RuntimeChartRow | undefined
                        if (row !== undefined) onInspect?.(kind, row.category, status.key)
                      }}
                    />
                  ))}
                </BarChart>
              </ResponsiveContainer>
              <div className={css.overviewChartTotals} aria-hidden>
                {rows.map(row => <span key={row.category}>{row.total.toLocaleString()}</span>)}
              </div>
            </div>
            <ul className={css.overviewChartLegend} aria-label={t('statusLegend')}>
              {statusItems.map(status => (
                <li key={status.key}><i style={{ background: status.color }} aria-hidden />{t(status.label)}</li>
              ))}
            </ul>
          </>
        )}
      </section>
    </article>
  )
}
