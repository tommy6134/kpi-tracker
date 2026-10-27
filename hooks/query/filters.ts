/** I filtri dei report e il loro confronto con una sessione. */

import { dayOfArg, monthOfArg, type ParsedArgs } from '../commands/args'
import type { KpiSessionFile } from '../core/session-file'
import { dayKey, monthEnd } from '../core/time'
import type { I18n } from '../i18n'

export type KpiFilter = {
  projects: string[]
  sessions: string[]
  sinceDay?: string
  untilDay?: string
  models: string[]
  kinds: string[]
  branches: string[]
  repos: string[]
}

export const emptyFilter = (): KpiFilter => ({ projects: [], sessions: [], models: [], kinds: [], branches: [], repos: [] })

const KIND_ALIASES: Record<string, string> = {
  interactive: 'interattiva',
  interattiva: 'interattiva',
  interattive: 'interattiva',
  print: 'print',
  headless: 'print',
  p: 'print',
  sdk: 'sdk',
  desktop: 'desktop',
  vscode: 'vscode',
  sconosciuta: 'sconosciuta',
  unknown: 'sconosciuta',
}

/** Il filtro dagli argomenti; gli errori (date non valide) finiscono in `errors`, nella lingua di `L`. */
export function filterOf(L: I18n, args: ParsedArgs, now: number, currentProject: string | null): { filter: KpiFilter; errors: string[] } {
  const filter = emptyFilter()
  const errors: string[] = []

  for (const value of args.flags.progetto ?? []) {
    filter.projects.push(value === '.' && currentProject !== null ? `=${currentProject}` : value.toLowerCase())
  }

  filter.sessions.push(...(args.flags.sessione ?? []).map(value => value.toLowerCase()))
  filter.models.push(...(args.flags.modello ?? []).map(value => value.toLowerCase()))
  filter.branches.push(...(args.flags.branch ?? []).map(value => value.toLowerCase()))
  filter.repos.push(...(args.flags.repo ?? []).map(value => value.toLowerCase()))

  for (const value of args.flags.tipo ?? []) {
    const kind = KIND_ALIASES[value.toLowerCase()]

    if (kind === undefined) {
      errors.push(L.t('tipo di sessione sconosciuto: {value}', { value }))
    } else {
      filter.kinds.push(kind)
    }
  }

  const since = args.flags.da?.at(-1)
  const until = args.flags.a?.at(-1)
  const rawMonth = args.flags.mese?.at(-1)

  // `--mese` imposta da e a sul mese: insieme a loro sarebbe ambiguo.
  if (rawMonth !== undefined) {
    const month = monthOfArg(rawMonth)
    const flag = args.typed.mese ?? 'mese'

    if (since !== undefined || until !== undefined) {
      errors.push(L.t('--{flag} non si combina con --{since} e --{until}', { flag, since: args.typed.da ?? 'da', until: args.typed.a ?? 'a' }))
    } else if (month === null) {
      errors.push(L.t('mese non valido per --{flag}: {value} (per esempio 2026-11 o 11/2026)', { flag, value: rawMonth }))
    } else {
      filter.sinceDay = `${month}-01`
      filter.untilDay = monthEnd(month)
    }
  }

  if (since !== undefined) {
    const day = dayOfArg(since, now)

    if (day === null) {
      errors.push(L.t('data non valida per --{flag}: {value}', { flag: args.typed.da ?? 'da', value: since }))
    } else {
      filter.sinceDay = day
    }
  }

  if (until !== undefined) {
    const day = dayOfArg(until, now)

    if (day === null) {
      errors.push(L.t('data non valida per --{flag}: {value}', { flag: args.typed.a ?? 'a', value: until }))
    } else {
      filter.untilDay = day
    }
  }

  return { filter, errors }
}

/** Il progetto passa il filtro (percorso o nome contengono il testo; `=percorso` per l'uguaglianza). */
export function matchesProject(filter: KpiFilter, path: string, name: string): boolean {
  if (filter.projects.length === 0) {
    return true
  }

  const p = path.toLowerCase()
  const n = name.toLowerCase()

  return filter.projects.some(value => (value.startsWith('=') ? path === value.slice(1) : p.includes(value) || n.includes(value)))
}

/** `true` se il giorno sta nell'intervallo del filtro. */
export function inRange(filter: KpiFilter, day: string): boolean {
  return (filter.sinceDay === undefined || day >= filter.sinceDay) && (filter.untilDay === undefined || day <= filter.untilDay)
}

/** I giorni attivi della sessione (dal summary, altrimenti il giorno di creazione). */
export function daysOf(file: KpiSessionFile): string[] {
  const days = Object.keys(file.summary?.byDay ?? {})

  return days.length > 0 ? days.sort() : [dayKey(file.createdAt, file.tzOffsetMin)]
}

/** La sessione passa il filtro. */
export function matchesSession(filter: KpiFilter, file: KpiSessionFile): boolean {
  if (filter.sessions.length > 0 && !filter.sessions.some(prefix => file.sessionId.toLowerCase().startsWith(prefix))) {
    return false
  }

  if (filter.kinds.length > 0 && !filter.kinds.includes(file.kind)) {
    return false
  }

  if ((filter.sinceDay !== undefined || filter.untilDay !== undefined) && !daysOf(file).some(day => inRange(filter, day))) {
    return false
  }

  if (filter.models.length > 0) {
    const models = [...file.meta.models, ...Object.keys(file.summary?.byModel ?? {}), ...Object.keys(file.summary?.models.set ?? {})].map(model => model.toLowerCase())

    if (!filter.models.some(wanted => models.some(model => model.includes(wanted)))) {
      return false
    }
  }

  if (filter.branches.length > 0) {
    const branches = file.meta.branches.map(branch => branch.toLowerCase())

    if (!filter.branches.some(wanted => branches.some(branch => branch.includes(wanted)))) {
      return false
    }
  }

  if (filter.repos.length > 0) {
    const repo = `${file.meta.repo?.name ?? ''} ${file.meta.repo?.remote ?? ''} ${file.meta.repo?.root ?? ''}`.toLowerCase()

    if (!filter.repos.some(wanted => repo.includes(wanted))) {
      return false
    }
  }

  return true
}

/** Una descrizione leggibile del filtro, per l'intestazione dei report. */
export function describeFilter(L: I18n, filter: KpiFilter): string {
  const parts: string[] = []

  if (filter.sinceDay !== undefined || filter.untilDay !== undefined) {
    parts.push(L.t('periodo {since} → {until}', { since: filter.sinceDay ?? L.t('inizio'), until: filter.untilDay ?? L.t('oggi') }))
  }

  if (filter.projects.length > 0) parts.push(`${L.t('progetto')} ${filter.projects.map(value => value.replace(/^=/, '')).join(', ')}`)
  if (filter.sessions.length > 0) parts.push(`${L.t('sessione')} ${filter.sessions.join(', ')}`)
  if (filter.models.length > 0) parts.push(`${L.t('modello')} ${filter.models.join(', ')}`)
  if (filter.kinds.length > 0) parts.push(`${L.t('tipo')} ${filter.kinds.map(L.code).join(', ')}`)
  if (filter.branches.length > 0) parts.push(`branch ${filter.branches.join(', ')}`)
  if (filter.repos.length > 0) parts.push(`repo ${filter.repos.join(', ')}`)

  return parts.length === 0 ? L.t('tutti i dati') : parts.join(' · ')
}
