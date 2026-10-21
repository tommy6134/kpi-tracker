/* @jsxRuntime classic */
/* @jsx h */
/* @jsxFrag Fragment */
import type { Elements, RenderElement } from 'claude-code'

import { compact, pct, pct100, usd } from '../format/fmt'
import type { LiveView } from './live'

export type BandKit = Pick<Elements['terminal'], 'Box' | 'Text' | 'Button'>

export type BandActions = {
  details: () => void
  hide: () => void
}

/** Le parti della riga, dalla più alla meno importante, per una larghezza data. */
export function bandParts(live: LiveView, columns: number): string[] {
  const rate = (label: string, view: LiveView['rate5h']) => (view === null ? null : `${label} ${pct100(view.pct)}`)
  const ctx = live.ctxPct === null ? null : `ctx ${pct100(live.ctxPct)}`

  if (columns >= 110) {
    return [
      usd(live.cost),
      `${compact(live.total)} tok (in ${compact(live.input)} · out ${compact(live.tokens.out)})`,
      `cache ${pct(live.cacheHit)}`,
      ctx,
      rate('5h', live.rate5h),
      rate('7g', live.rate7d),
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

/** La barra sopra il prompt: una riga sola, con i pulsanti a destra. */
export function bandView(kit: BandKit, live: LiveView, columns: number, actions: BandActions): RenderElement {
  const { Box, Text, Button } = kit
  const parts = bandParts(live, columns)
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
        {!isTiny && <Button key="kpi-details" label={isWide ? 'Dettagli' : 'D'} onPress={actions.details} />}
        <Button key="kpi-hide" label={columns >= 110 ? 'Nascondi' : '×'} onPress={actions.hide} />
      </Box>
    </Box>
  )
}
