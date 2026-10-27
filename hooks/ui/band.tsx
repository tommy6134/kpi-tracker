/* @jsxRuntime classic */
/* @jsx h */
/* @jsxFrag Fragment */
import type { Elements, RenderElement } from 'claude-code'

import type { I18n } from '../i18n'
import type { LiveView } from './live'
import { ACCENT, WARN } from './palette'

export type BandKit = Pick<Elements['terminal'], 'Box' | 'Text' | 'Button'>

export type BandActions = {
  details: () => void
  hide: () => void
}

/** La riga di avviso sugli aggiornamenti sotto la barra. */
export type BandNotice = { tone: 'warn' | 'info'; band: string }

/** Le parti della riga, dalla più alla meno importante, per una larghezza data. */
export function bandParts(L: I18n, live: LiveView, columns: number): string[] {
  const { compact, pct, pct100, usd } = L
  const rate = (label: string, view: LiveView['rate5h']) => (view === null ? null : `${label} ${pct100(view.pct)}`)
  const ctx = live.ctxPct === null ? null : `ctx ${pct100(live.ctxPct)}`

  if (columns >= 110) {
    return [
      usd(live.cost),
      `${compact(live.total)} tok (in ${compact(live.input)} · out ${compact(live.tokens.out)})`,
      `cache ${pct(live.cacheHit)}`,
      ctx,
      rate('5h', live.rate5h),
      rate(L.t('7g'), live.rate7d),
    ].filter((part): part is string => part !== null)
  }

  if (columns >= 80) {
    return [usd(live.cost), `${compact(live.total)} tok`, `cache ${pct(live.cacheHit)}`, ctx, rate('5h', live.rate5h)].filter(
      (part): part is string => part !== null,
    )
  }

  if (columns >= 50) {
    return [usd(live.cost), ctx, rate('5h', live.rate5h)].filter((part): part is string => part !== null)
  }

  return [usd(live.cost), ctx].filter((part): part is string => part !== null)
}

/** La barra sopra il prompt: una riga con i pulsanti a destra, più l'eventuale avviso sugli aggiornamenti. */
export function bandView(kit: BandKit, L: I18n, live: LiveView, columns: number, actions: BandActions, notice: BandNotice | null = null): RenderElement {
  const { Box, Text } = kit
  const row = bandRow(kit, L, live, columns, actions)

  if (notice === null) {
    return row
  }

  return (
    <Box flexDirection="column">
      {row}
      <Box paddingRight={5}>
        <Text wrap="truncate-end" color={notice.tone === 'warn' ? WARN : ACCENT}>
          {notice.band}
        </Text>
      </Box>
    </Box>
  )
}

function bandRow(kit: BandKit, L: I18n, live: LiveView, columns: number, actions: BandActions): RenderElement {
  const { Box, Text, Button } = kit
  const parts = bandParts(L, live, columns)
  const isWide = columns >= 80
  const isTiny = columns < 50

  return (
    // La barra disegna il suo `[-]` sul bordo destro: gli si lascia spazio.
    <Box justifyContent="space-between" paddingRight={5}>
      <Text wrap="truncate-end">
        {isWide && (
          <Text bold color="claude">
            KPI{'  '}
          </Text>
        )}
        <Text dimColor>{parts.join(' · ')}</Text>
      </Text>
      <Box gap={1}>
        {!isTiny && <Button key="kpi-details" label={isWide ? L.t('Dettagli') : 'D'} onPress={actions.details} />}
        <Button key="kpi-hide" label={columns >= 110 ? L.t('Nascondi') : '×'} onPress={actions.hide} />
      </Box>
    </Box>
  )
}
