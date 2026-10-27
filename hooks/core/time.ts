/**
 * Tempo locale: chiavi di giorno, ora e giorno della settimana per i KPI.
 * `offsetMin` (minuti a est di UTC) si può fissare nei test; altrimenti si usa
 * il fuso del runtime per quell'istante (ora legale compresa).
 */

export type LocalParts = {
  year: number
  month: number
  day: number
  hour: number
  minute: number
  second: number
  /** 0 = lunedì … 6 = domenica. */
  weekday: number
}

/** Minuti a est di UTC nel fuso del runtime all'istante `ms`. */
export function localOffsetMin(ms: number): number {
  const offset = -new Date(ms).getTimezoneOffset()

  return Number.isFinite(offset) ? offset : 0
}

/** Le parti locali di `ms`, nel fuso `offsetMin` o in quello del runtime. */
export function partsOf(ms: number, offsetMin: number = localOffsetMin(ms)): LocalParts {
  const shifted = new Date(ms + offsetMin * 60_000)

  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
    hour: shifted.getUTCHours(),
    minute: shifted.getUTCMinutes(),
    second: shifted.getUTCSeconds(),
    weekday: (shifted.getUTCDay() + 6) % 7,
  }
}

const two = (value: number): string => String(value).padStart(2, '0')

/** `YYYY-MM-DD` locale. */
export function dayKey(ms: number, offsetMin?: number): string {
  const p = partsOf(ms, offsetMin)

  return `${p.year}-${two(p.month)}-${two(p.day)}`
}

/** `YYYY-MM-DD_HH-mm-ss` locale: sicuro come nome di file anche su Windows. */
export function stampOf(ms: number, offsetMin?: number): string {
  const p = partsOf(ms, offsetMin)

  return `${p.year}-${two(p.month)}-${two(p.day)}_${two(p.hour)}-${two(p.minute)}-${two(p.second)}`
}

/** Indice 0..167 della cella ora × giorno della settimana (lunedì 00 = 0). */
export function hourSlot(ms: number, offsetMin?: number): number {
  const p = partsOf(ms, offsetMin)

  return p.weekday * 24 + p.hour
}

/** `HH:mm` locale. */
export function clockOf(ms: number, offsetMin?: number): string {
  const p = partsOf(ms, offsetMin)

  return `${two(p.hour)}:${two(p.minute)}`
}

/** L'istante della mezzanotte locale del giorno `YYYY-MM-DD`. */
export function dayStartMs(day: string, offsetMin = 0): number {
  const [year, month, date] = day.split('-').map(Number)

  return Date.UTC(year ?? 1970, (month ?? 1) - 1, date ?? 1) - offsetMin * 60_000
}

/** Il lunedì (`YYYY-MM-DD`) della settimana del giorno dato. */
export function weekKey(day: string): string {
  const start = dayStartMs(day)
  const weekday = (new Date(start).getUTCDay() + 6) % 7

  return dayKeyUtc(start - weekday * 86_400_000)
}

/** `YYYY-MM` del giorno dato. */
export function monthKey(day: string): string {
  return day.slice(0, 7)
}

/** L'ultimo giorno (`YYYY-MM-DD`) del mese `YYYY-MM`. */
export function monthEnd(month: string): string {
  const [year, number] = month.split('-').map(Number)

  return `${month}-${two(new Date(Date.UTC(year ?? 1970, number ?? 1, 0)).getUTCDate())}`
}

function dayKeyUtc(ms: number): string {
  const d = new Date(ms)

  return `${d.getUTCFullYear()}-${two(d.getUTCMonth() + 1)}-${two(d.getUTCDate())}`
}

/** Il giorno `YYYY-MM-DD` spostato di `days` giorni. */
export function addDays(day: string, days: number): string {
  return dayKeyUtc(dayStartMs(day) + days * 86_400_000)
}
