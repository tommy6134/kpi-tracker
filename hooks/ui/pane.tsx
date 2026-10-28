/* @jsxRuntime classic */
/* @jsx h */
/* @jsxFrag Fragment */
import type { Elements, RenderChildren, RenderElement } from 'claude-code'

import { clockOf } from '../core/time'
import type { I18n } from '../i18n'
import type { LiveView, RateView } from './live'
import { ACCENT, BAD, GOOD, RASTER, toneColor, toneOf, WARN, worstOf, type Tone } from './palette'
import { DEFAULT_COLOR, glyphsOf, lastOf, packCells, type Cell } from './sparkline'

export const PANE_ID = 'kpi-live'

export type PaneKit = Pick<Elements['terminal'], 'Box' | 'Text' | 'Button'> & Partial<Pick<Elements['terminal'], 'Raster'>>

export type PaneActions = {
  report: () => void
  /** Apre la cartella dei report nel file manager. */
  folder: () => void
  close: () => void
}

type Row = RenderChildren

/** Una colonna di una lista: testo allineato a destra fra le righe, con il suo stile. */
type Col = { text: string; color?: string | undefined; isBold?: boolean; isMuted?: boolean }

type Item = { name: string; cols: readonly Col[] }

const BAR_FULL = '█'
const BAR_EMPTY = '░'

/** Le colonne di una card che non vanno al contenuto: due di bordo e due di rientro. */
const CARD_CHROME = 4

/** Da qui le quattro card in testa stanno in una riga sola. */
const HERO_ROW_MIN = 68

/** Da qui le card delle sezioni vanno su due colonne. */
const TWO_COLUMNS_MIN = 78

/** Una barra piena per `fraction` nel colore dato, il resto attenuato. */
function meter(kit: PaneKit, fraction: number, width: number, color: string): Row {
  const { Text } = kit
  const filled = Math.max(0, Math.min(width, Math.round(fraction * width)))

  return (
    <Text>
      <Text color={color}>{BAR_FULL.repeat(filled)}</Text>
      <Text dimColor>{BAR_EMPTY.repeat(width - filled)}</Text>
    </Text>
  )
}

/**
 * Una card: bordo arrotondato, grigio o nel colore del livello, con il titolo sul bordo superiore.
 * Il titolo è un fratello assoluto dopo il riquadro, non un suo figlio: il terminale dipinge il
 * bordo sopra i figli, mentre un elemento assoluto si dipinge sopra quelli che lo precedono.
 */
function card(kit: PaneKit, L: I18n, title: string, width: number, rows: readonly Row[], tone: Tone = 'ok'): Row {
  const { Box, Text } = kit
  const color = tone === 'ok' ? undefined : toneColor(tone)

  return (
    <Box flexDirection="column" width={width}>
      <Box flexDirection="column" flexGrow={1} borderStyle="round" borderColor={color} borderDimColor={color === undefined} paddingX={1}>
        {rows.filter(row => row !== null)}
      </Box>
      <Box position="absolute" top={0} left={1}>
        <Text bold color={color}>{` ${L.cut(title, Math.max(1, width - 6))} `}</Text>
      </Box>
    </Box>
  )
}

/** Le card a gruppi di `perRow` per riga; quelle di una riga prendono la stessa altezza. */
function grid(kit: PaneKit, cards: readonly Row[], perRow: number): Row[] {
  const { Box } = kit
  const present = cards.filter(entry => entry !== null)
  const rows: Row[] = []

  for (let index = 0; index < present.length; index += perRow) {
    rows.push(<Box gap={1}>{present.slice(index, index + perRow)}</Box>)
  }

  return rows
}

/** Una metrica: etichetta attenuata a sinistra, valore in grassetto a destra. */
function line(kit: PaneKit, label: string, value: RenderChildren, color?: string, isMuted = false): Row {
  const { Box, Text } = kit

  return (
    <Box justifyContent="space-between" gap={1}>
      <Text dimColor wrap="truncate-end">
        {label}
      </Text>
      <Box flexShrink={0}>
        <Text bold={!isMuted} dimColor={isMuted} color={color}>
          {value}
        </Text>
      </Box>
    </Box>
  )
}

/** Una quantità: attenuata a zero, nel colore `hot` sopra zero. */
function amount(kit: PaneKit, L: I18n, label: string, value: number, text = L.int(value), hot?: string): Row {
  return line(kit, label, text, value > 0 ? hot : undefined, value === 0)
}

/** Una voce per riga: il nome a sinistra, le colonne a destra allineate fra le righe. */
function list(kit: PaneKit, items: readonly Item[], wrap: 'truncate-end' | 'truncate-start' = 'truncate-end'): Row[] {
  const { Box, Text } = kit
  const widths = items.reduce<number[]>((acc, item) => item.cols.map((col, index) => Math.max(acc[index] ?? 0, col.text.length)), [])

  return items.map(item => (
    <Box justifyContent="space-between" gap={1}>
      <Text wrap={wrap}>{item.name}</Text>
      <Box flexShrink={0}>
        <Text>
          {item.cols.map((col, index) => {
            const colWidth = widths[index] ?? 0

            return colWidth === 0 ? null : (
              <Text bold={col.isBold} dimColor={col.isMuted} color={col.color}>
                {(index === 0 ? '' : '  ') + col.text.padStart(colWidth)}
              </Text>
            )
          })}
        </Text>
      </Box>
    </Box>
  ))
}

/** Una sparkline: Raster sul terminale (colori per turni con errori o compattazioni), testo altrove. */
function spark(kit: PaneKit, key: string, label: string, values: readonly (number | null)[], marks: readonly ('err' | 'cpt' | null)[], width: number): Row {
  const { Box, Text, Raster } = kit
  const room = Math.max(4, width - label.length - 1)
  const shown = lastOf(values, room)
  const shownMarks = lastOf(marks, room)
  const glyphs = glyphsOf(shown)

  if (glyphs.length === 0) {
    return null
  }

  if (Raster === undefined) {
    return (
      <Text wrap="truncate-end">
        <Text dimColor>{label} </Text>
        {glyphs.join('')}
      </Text>
    )
  }

  const cells: Cell[] = glyphs.map((glyph, index) => ({
    glyph,
    fg: shownMarks[index] === 'err' ? RASTER.error : shownMarks[index] === 'cpt' ? RASTER.compact : RASTER.bar,
    bg: DEFAULT_COLOR,
  }))

  return (
    <Box gap={1}>
      <Text dimColor>{label}</Text>
      <Raster key={key} columns={cells.length} rows={1} cells={packCells(cells)} />
    </Box>
  )
}

/** Il pannello della sessione corrente: card in testa, poi una card per sezione; il corpo scorre. */
export function paneView(kit: PaneKit, L: I18n, live: LiveView | null, columns: number, actions: PaneActions): RenderElement {
  const { Box, Text, Button } = kit
  const { compact, dur, fixed, int, pct, pct100, usd } = L
  const width = Math.max(30, columns - 1)

  if (live === null) {
    return (
      <Box flexDirection="column">
        <Text dimColor>{L.t('Nessuna sessione registrata in questo momento.')}</Text>
        <Box gap={1}>
          <Button key="kpi-close" label={L.t('Chiudi')} role="dismiss" onPress={actions.close} />
        </Box>
      </Box>
    )
  }

  const heroPerRow = width >= HERO_ROW_MIN ? 4 : 2
  const heroWidth = Math.floor((width - heroPerRow + 1) / heroPerRow)
  const heroInner = heroWidth - CARD_CHROME
  const perRow = width >= TWO_COLUMNS_MIN ? 2 : 1
  const cardWidth = Math.floor((width - perRow + 1) / perRow)
  const inner = cardWidth - CARD_CHROME
  const section = (title: string, rows: readonly Row[], tone?: Tone): Row => card(kit, L, title, cardWidth, rows, tone)
  const count = (label: string, value: number, text?: string, hot?: string): Row => amount(kit, L, label, value, text, hot)

  // ------------------------------------------------------------ intestazione

  const title = [live.project, live.branch].filter(part => part !== null && part !== '').join(' · ')
  const meta = [live.model, live.id8, L.code(live.kind)].filter(part => part !== null && part !== '').join(' · ')
  const header = (
    <Box flexDirection="column">
      <Box justifyContent="space-between" gap={1}>
        <Text wrap="truncate-end">
          <Text bold color={ACCENT}>
            KPI
          </Text>
          {'  '}
          <Text bold>{L.cut(title, Math.max(10, width - 30))}</Text>
        </Text>
        <Box gap={1} flexShrink={0}>
          <Button key="kpi-report" label={L.t('Report HTML')} onPress={actions.report} />
          <Button key="kpi-folder" label={L.t('Cartella')} onPress={actions.folder} />
          <Button key="kpi-close" label={L.t('Chiudi')} role="dismiss" onPress={actions.close} />
        </Box>
      </Box>
      <Text dimColor wrap="truncate-end">
        {meta}
      </Text>
      <Text dimColor wrap="truncate-end">
        {L.t('avviata {time}', { time: clockOf(live.startedAt) })} · {L.count(live.segments, 'segmento', 'segmenti')}
        {live.version !== '' ? ` · v${live.version}` : ''}
      </Text>
    </Box>
  )

  // ---------------------------------------------------------- card in testa

  const ctxTone = toneOf(live.ctxPct)
  const activeShare = live.durationMs > 0 ? pct(Math.min(1, live.activeMs / live.durationMs)) : null
  const activeLong = `${L.t('attivo {time}', { time: dur(live.activeMs) })}${activeShare !== null ? ` (${activeShare})` : ''}`
  const turnNote =
    live.turns.errors > 0 ? (
      <Text color={BAD}>{L.count(live.turns.errors, 'errore', 'errori')}</Text>
    ) : live.turns.aborted > 0 ? (
      <Text color={WARN}>{L.count(live.turns.aborted, 'interrotto', 'interrotti')}</Text>
    ) : (
      <Text dimColor>{L.count(0, 'errore', 'errori')}</Text>
    )

  const hero: Row[] = [
    card(kit, L, L.t('Costo'), heroWidth, [
      <Text bold wrap="truncate-end">
        {usd(live.cost)}
      </Text>,
      <Text dimColor wrap="truncate-end">
        {live.turns.n > 0 ? L.t('{cost}/turno', { cost: usd(live.costPerTurn) }) : L.t('nessun turno')}
      </Text>,
    ]),
    card(
      kit,
      L,
      L.t('Contesto'),
      heroWidth,
      [
        <Text wrap="truncate-end">
          <Text bold color={live.ctxPct === null ? undefined : toneColor(ctxTone)}>
            {live.ctxPct === null ? '–' : pct100(live.ctxPct)}
          </Text>
          <Text dimColor>{live.ctxWindow > 0 ? ` ${L.t('di {window}', { window: compact(live.ctxWindow) })}` : ''}</Text>
        </Text>,
        meter(kit, (live.ctxPct ?? 0) / 100, Math.max(1, Math.min(heroInner, 20)), toneColor(ctxTone)),
      ],
      ctxTone,
    ),
    card(kit, L, L.t('Durata'), heroWidth, [
      <Text bold wrap="truncate-end">
        {dur(live.durationMs)}
      </Text>,
      <Text dimColor wrap="truncate-end">
        {activeLong.length <= heroInner || activeShare === null ? activeLong : L.t('attivo {time}', { time: activeShare })}
      </Text>,
    ]),
    card(kit, L, L.t('Turni'), heroWidth, [
      <Text bold wrap="truncate-end">
        {int(live.turns.n)}
      </Text>,
      turnNote,
    ]),
  ]

  // ------------------------------------------------------------------ sezioni

  const errorTotal = live.errors.tool + live.errors.api + live.errors.refusals + live.errors.interrupts
  const errorCard = section(
    L.t('Errori'),
    [
      count('Tool', live.errors.tool, undefined, BAD),
      count('API', live.errors.api, undefined, BAD),
      count(L.t('Rifiuti'), live.errors.refusals, undefined, BAD),
      count(L.t('Interruzioni'), live.errors.interrupts, undefined, BAD),
    ],
    errorTotal > 0 ? 'bad' : 'ok',
  )

  const tokenCard = section('Token', [
    count('Input', live.tokens.in, compact(live.tokens.in)),
    count('Output', live.tokens.out, compact(live.tokens.out)),
    count(L.t('Cache lettura'), live.tokens.cr, compact(live.tokens.cr)),
    count(L.t('Cache scrittura'), live.tokens.cw, compact(live.tokens.cw)),
    count('Cache hit', live.cacheHit, pct(live.cacheHit)),
  ])

  const rateLine = (label: string, view: RateView | null): Row =>
    view === null ? line(kit, label, '–', undefined, true) : line(kit, label, pct100(view.pct), toneColor(toneOf(view.pct)))
  const limitCard = section(
    L.t('Limiti'),
    [
      rateLine('Rate limit 5h', live.rate5h),
      rateLine(`Rate limit ${L.t('7g')}`, live.rate7d),
      count(
        L.t('Compattazioni'),
        live.compactions.n,
        live.compactions.n > 0
          ? `${int(live.compactions.n)} (${int(live.compactions.auto)} auto${live.compactions.reduction !== null ? `, −${pct(live.compactions.reduction)}` : ''})`
          : '0',
      ),
    ],
    worstOf(toneOf(live.rate5h?.pct ?? null), toneOf(live.rate7d?.pct ?? null)),
  )

  const series = live.series
  const marks = series.map(point => (point.err > 0 || point.r === 'error' || point.r === 'aborted' ? 'err' : point.cpt === 1 ? 'cpt' : null) as 'err' | 'cpt' | null)
  // Le due etichette delle sparkline hanno la stessa larghezza, così i grafici partono allineati.
  const sparkLabels = [L.t('costo'), L.t('durata')]
  const sparkWidth = Math.max(...sparkLabels.map(label => label.length))
  const [costLabel = '', durLabel = ''] = sparkLabels.map(label => label.padEnd(sparkWidth))
  const turnCard = section(`${L.t('Turni')} · ${int(live.turns.n)}`, [
    spark(kit, 'kpi-spark-cost', costLabel, series.map(point => point.cost), marks, inner),
    spark(kit, 'kpi-spark-dur', durLabel, series.map(point => point.ms), marks, inner),
    line(kit, L.t('Durata media'), dur(live.turns.durMean)),
    line(kit, L.t('Durata p90'), dur(live.turns.durP90)),
    count(L.t('Completati'), live.turns.ok),
    count(L.t('Interrotti'), live.turns.aborted, undefined, WARN),
    count(L.t('Errori'), live.turns.errors, undefined, BAD),
    live.turns.reqPerTurn > 0 ? line(kit, L.t('Richieste per turno'), fixed(live.turns.reqPerTurn, 1)) : null,
    live.turns.ttftMedian > 0 ? line(kit, L.t('TTFT mediano'), dur(live.turns.ttftMedian)) : null,
  ])

  const toolCard = section(
    `Tool · ${int(live.tools.n)}${live.tools.errors > 0 ? ` · ${int(live.tools.errors)} ✗` : ''}`,
    live.tools.top.length === 0
      ? [<Text dimColor>{L.t('nessuna chiamata')}</Text>]
      : list(
          kit,
          live.tools.top.map(tool => ({
            name: tool.name,
            cols: [
              { text: int(tool.n), isBold: true },
              { text: tool.msMean > 0 ? dur(tool.msMean) : '', isMuted: true },
              { text: tool.err > 0 ? `✗${int(tool.err)}` : '', color: BAD },
            ],
          })),
        ),
  )

  const bashCard =
    live.bash.length === 0
      ? null
      : section(
          'Bash',
          list(
            kit,
            live.bash.map(cat => {
              const isCheck = cat.cat === 'test' || cat.cat === 'build'

              return {
                name: L.code(cat.cat),
                cols: [
                  { text: int(cat.n), isBold: true },
                  { text: isCheck ? `${int(cat.ok)}✓` : '', color: cat.ok > 0 ? GOOD : undefined, isMuted: cat.ok === 0 },
                  { text: isCheck || cat.err > 0 ? `${int(cat.err)}✗` : '', color: cat.err > 0 ? BAD : undefined, isMuted: cat.err === 0 },
                ],
              }
            }),
          ),
        )

  const subtitle = (text: string): Row => (
    <Box marginTop={1}>
      <Text bold dimColor>
        {text}
      </Text>
    </Box>
  )
  const changed = live.files.add + live.files.del
  const fileCard = section(L.t('File e codice'), [
    changed === 0
      ? line(kit, L.t('Righe'), '+0 −0', undefined, true)
      : line(kit, L.t('Righe'), [<Text color={GOOD}>+{int(live.files.add)}</Text>, ' ', <Text color={BAD}>−{int(live.files.del)}</Text>]),
    count(L.t('Creati'), live.files.created),
    count(L.t('Modificati'), live.files.modified),
    count(L.t('Letti'), live.files.read),
    count(L.t('Documenti creati'), live.files.docs),
    ...(live.files.byClass.length > 0 ? [subtitle(L.t('Per classe')), ...live.files.byClass.map(cls => count(L.code(cls.cls), cls.add, `+${int(cls.add)}`, GOOD))] : []),
    ...(live.files.top.length > 0
      ? [
          subtitle(L.t('Più modificati')),
          ...list(
            kit,
            live.files.top.map(file => ({
              name: file.path,
              cols: [
                { text: `+${int(file.add)}`, color: file.add > 0 ? GOOD : undefined, isMuted: file.add === 0 },
                { text: `−${int(file.del)}`, color: file.del > 0 ? BAD : undefined, isMuted: file.del === 0 },
              ],
            })),
            'truncate-start',
          ),
        ]
      : []),
  ])

  const gitCard =
    live.git.commits + live.git.pushes + live.git.prs.length === 0
      ? null
      : section('Git', [
          count('Commit', live.git.commits),
          count('Push', live.git.pushes),
          ...live.git.prs.map(pr => line(kit, `PR #${pr.n}`, pr.action)),
        ])

  const agentCard =
    live.agents.length === 0
      ? null
      : section(
          'Subagent',
          list(
            kit,
            live.agents.map(agent => ({
              name: `${L.code(agent.type)} ×${int(agent.n)}`,
              cols: [
                { text: dur(agent.ms), isMuted: true },
                { text: `${compact(agent.tok)} tok`, isMuted: true },
              ],
            })),
          ),
        )

  const permCard = section(L.t('Permessi'), [
    count(L.t('Consentiti'), live.perms.allow),
    count(L.t('Chiesti'), live.perms.ask),
    count(L.t('Dialoghi'), live.perms.dialogs),
    count(L.t('Negati'), live.perms.denied, undefined, WARN),
    count(L.t('Rifiutati da te'), live.perms.rejected, undefined, WARN),
  ])

  // Con errori la card Errori sale subito sotto quelle in testa, così si vede senza scorrere.
  const cards = [
    ...(errorTotal > 0 ? [errorCard] : []),
    tokenCard,
    limitCard,
    turnCard,
    toolCard,
    bashCard,
    fileCard,
    gitCard,
    agentCard,
    permCard,
    ...(errorTotal > 0 ? [] : [errorCard]),
  ]

  return (
    <Box flexDirection="column" gap={1}>
      {header}
      <Box flexDirection="column">{grid(kit, hero, heroPerRow)}</Box>
      <Box flexDirection="column">{grid(kit, cards, perRow)}</Box>
    </Box>
  )
}
