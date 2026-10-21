/**
 * Argomenti di /kpi: sottocomando (nomi italiani con alias inglesi), opzioni
 * con valore, opzioni booleane, date relative o assolute.
 */

import { addDays, dayKey } from '../core/time'

export type Subcommand =
  | 'riepilogo'
  | 'live'
  | 'barra'
  | 'statistiche'
  | 'sessioni'
  | 'progetti'
  | 'sessione'
  | 'report'
  | 'esporta'
  | 'pulisci'
  | 'ricostruisci'
  | 'aiuto'

const SUBCOMMANDS: Record<string, Subcommand> = {
  riepilogo: 'riepilogo',
  summary: 'riepilogo',
  live: 'live',
  pannello: 'live',
  panel: 'live',
  barra: 'barra',
  band: 'barra',
  statistiche: 'statistiche',
  stats: 'statistiche',
  sessioni: 'sessioni',
  sessions: 'sessioni',
  progetti: 'progetti',
  projects: 'progetti',
  sessione: 'sessione',
  session: 'sessione',
  report: 'report',
  esporta: 'esporta',
  export: 'esporta',
  pulisci: 'pulisci',
  prune: 'pulisci',
  ricostruisci: 'ricostruisci',
  rebuild: 'ricostruisci',
  aiuto: 'aiuto',
  help: 'aiuto',
}

/** Opzioni con valore: nome canonico per ogni alias. */
const VALUE_FLAGS: Record<string, string> = {
  progetto: 'progetto',
  project: 'progetto',
  sessione: 'sessione',
  session: 'sessione',
  da: 'da',
  since: 'da',
  dal: 'da',
  a: 'a',
  until: 'a',
  al: 'a',
  modello: 'modello',
  model: 'modello',
  tipo: 'tipo',
  kind: 'tipo',
  branch: 'branch',
  repo: 'repo',
  per: 'per',
  by: 'per',
  limite: 'limite',
  limit: 'limite',
  livello: 'livello',
  level: 'livello',
  'piu-vecchie-di': 'piu-vecchie-di',
  'più-vecchie-di': 'piu-vecchie-di',
  'older-than': 'piu-vecchie-di',
  out: 'out',
}

/** Opzioni booleane: nome canonico per ogni alias. */
const BOOL_FLAGS: Record<string, string> = {
  ctx: 'ctx',
  'al-modello': 'ctx',
  'to-model': 'ctx',
  'no-apri': 'no-apri',
  'no-open': 'no-apri',
  standard: 'standard',
  excel: 'excel',
  prova: 'prova',
  'dry-run': 'prova',
  si: 'si',
  sì: 'si',
  yes: 'si',
  tutto: 'tutto',
  all: 'tutto',
}

export type ParsedArgs = {
  sub: Subcommand
  /** Il sottocomando scritto non era riconosciuto. */
  unknown?: string
  positional: string[]
  flags: Record<string, string[]>
  bools: Set<string>
  errors: string[]
}

/** Divide la riga in parole, rispettando virgolette singole e doppie. */
export function words(text: string): string[] {
  const out: string[] = []
  const re = /"([^"]*)"|'([^']*)'|(\S+)/g
  let match: RegExpExecArray | null

  while ((match = re.exec(text)) !== null) {
    out.push(match[1] ?? match[2] ?? match[3] ?? '')
  }

  return out
}

/** Analizza gli argomenti di /kpi. */
export function parseArgs(text: string): ParsedArgs {
  const list = words(text.trim())
  const parsed: ParsedArgs = { sub: 'riepilogo', positional: [], flags: {}, bools: new Set(), errors: [] }
  let index = 0
  const first = list[0]

  if (first !== undefined && !first.startsWith('--')) {
    const sub = SUBCOMMANDS[first.toLowerCase()]

    if (sub !== undefined) {
      parsed.sub = sub
    } else {
      parsed.unknown = first
    }

    index = 1
  }

  while (index < list.length) {
    const word = list[index] as string

    if (!word.startsWith('--')) {
      parsed.positional.push(word)
      index += 1
      continue
    }

    const [rawName = '', inline] = word.slice(2).split(/=(.*)/s, 2)
    const name = rawName.toLowerCase()
    const valueFlag = VALUE_FLAGS[name]
    const boolFlag = BOOL_FLAGS[name]

    if (valueFlag !== undefined) {
      const value = inline ?? list[index + 1]

      if (value === undefined || (inline === undefined && value.startsWith('--'))) {
        parsed.errors.push(`--${name} richiede un valore`)
        index += 1
        continue
      }

      ;(parsed.flags[valueFlag] ??= []).push(...value.split(',').map(part => part.trim()).filter(part => part !== ''))
      index += inline === undefined ? 2 : 1
      continue
    }

    if (boolFlag !== undefined) {
      parsed.bools.add(boolFlag)
      index += 1
      continue
    }

    parsed.errors.push(`opzione sconosciuta --${name}`)
    index += 1
  }

  return parsed
}

/**
 * Una data di filtro come giorno locale `YYYY-MM-DD`: `oggi`, `ieri`,
 * `7d`/`7g` (giorni), `24h`, `2w`/`2s` (settimane), `3m` (mesi), oppure
 * una data `YYYY-MM-DD` o `DD/MM/YYYY`. `null` se non si capisce.
 */
export function dayOfArg(value: string, now: number, offsetMin?: number): string | null {
  const v = value.trim().toLowerCase()
  const today = dayKey(now, offsetMin)

  if (v === 'oggi' || v === 'today') {
    return today
  }

  if (v === 'ieri' || v === 'yesterday') {
    return addDays(today, -1)
  }

  const relative = /^(\d{1,4})\s*(d|g|h|w|s|m|y|a)$/.exec(v)

  if (relative !== null) {
    const amount = Number(relative[1])
    const unit = relative[2]

    if (unit === 'h') {
      return dayKey(now - amount * 3_600_000, offsetMin)
    }

    const days = unit === 'w' || unit === 's' ? amount * 7 : unit === 'm' ? amount * 30 : unit === 'y' || unit === 'a' ? amount * 365 : amount

    // "7d" = gli ultimi 7 giorni, oggi compreso.
    return addDays(today, -Math.max(0, days - 1))
  }

  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v)

  if (iso !== null) {
    return realDay(Number(iso[1]), Number(iso[2]), Number(iso[3]))
  }

  const it = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(v)

  if (it !== null) {
    return realDay(Number(it[3]), Number(it[2]), Number(it[1]))
  }

  return null
}

/** `YYYY-MM-DD` se il giorno esiste nel calendario (niente 32/13 né 30/02), altrimenti `null`. */
function realDay(year: number, month: number, day: number): string | null {
  const date = new Date(Date.UTC(year, month - 1, day))

  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    return null
  }

  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

/** Una durata come `180d`, `6m`, `1y` in giorni; `null` se non si capisce. */
export function daysOfAge(value: string): number | null {
  const match = /^(\d{1,5})\s*(d|g|w|s|m|y|a)$/.exec(value.trim().toLowerCase())

  if (match === null) {
    return null
  }

  const amount = Number(match[1])
  const unit = match[2]

  return unit === 'w' || unit === 's' ? amount * 7 : unit === 'm' ? amount * 30 : unit === 'y' || unit === 'a' ? amount * 365 : amount
}
