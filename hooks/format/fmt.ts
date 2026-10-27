/**
 * Formattazione scritta a mano (Intl non è garantito nel runtime dei mod),
 * in italiano (virgola decimale, punto per le migliaia, `12/10/2026`) o in
 * inglese (punto decimale, virgola per le migliaia, `2026-10-12`).
 * `fmtOf(lang)` dà le funzioni di una lingua; quelle esportate qui sono le
 * italiane.
 */

import { partsOf } from '../core/time'
import type { Lang } from '../i18n/lang'

/** Separatori, ordine della data, unità dei giorni e nomi dei giorni della settimana di una lingua. */
export type Locale = {
  group: string
  decimal: string
  /** `dmy` = `12/10/2026`, `ymd` = `2026-10-12`. */
  date: 'dmy' | 'ymd'
  day: string
  /** Dal lunedì. */
  weekdays: readonly string[]
}

export const LOCALES: Record<Lang, Locale> = {
  it: { group: '.', decimal: ',', date: 'dmy', day: 'g', weekdays: ['lun', 'mar', 'mer', 'gio', 'ven', 'sab', 'dom'] },
  en: { group: ',', decimal: '.', date: 'ymd', day: 'd', weekdays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] },
}

const two = (value: number): string => String(value).padStart(2, '0')

/** Le funzioni di formattazione di una lingua. */
export function fmtOf(lang: Lang) {
  const locale = LOCALES[lang]

  /** Numero con `decimals` decimali e i separatori della lingua. */
  function fixed(value: number, decimals = 0): string {
    if (!Number.isFinite(value)) {
      return '–'
    }

    const negative = value < 0
    const rounded = Math.abs(value).toFixed(decimals)
    const [whole = '0', frac] = rounded.split('.')
    const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, locale.group)

    return `${negative ? '−' : ''}${grouped}${frac !== undefined ? `${locale.decimal}${frac}` : ''}`
  }

  /** Intero con separatore delle migliaia: `12.345` / `12,345`. */
  const int = (value: number): string => fixed(Math.round(value), 0)

  /** Forma compatta: `950`, `12,4k`, `312k`, `2,1M`, `1,3G`. */
  function compact(value: number): string {
    const abs = Math.abs(value)

    if (abs < 1000) {
      return int(value)
    }

    const units: [number, string][] = [
      [1e9, 'G'],
      [1e6, 'M'],
      [1e3, 'k'],
    ]

    for (const [size, unit] of units) {
      if (abs >= size) {
        const scaled = value / size

        return `${fixed(scaled, Math.abs(scaled) < 10 ? 1 : 0)}${unit}`
      }
    }

    return int(value)
  }

  /** Dollari: `$1,42`, `$0,079`, `$1.234`. */
  function usd(value: number): string {
    const abs = Math.abs(value)

    if (abs === 0) {
      return '$0'
    }

    return `$${fixed(value, abs >= 100 ? 0 : abs >= 1 ? 2 : abs >= 0.01 ? 3 : 4)}`
  }

  /** Percentuale da una frazione 0..1: `89%`. */
  const pct = (fraction: number, decimals = 0): string => `${fixed(fraction * 100, decimals)}%`

  /** Percentuale da un valore già 0..100: `46%`. */
  const pct100 = (value: number, decimals = 0): string => `${fixed(value, decimals)}%`

  /** Una parte sul totale in percentuale; `–` con totale zero. */
  const ratio = (part: number, whole: number): string => (whole === 0 ? '–' : pct(part / whole))

  /** Durata leggibile: `850ms`, `42s`, `1m 12s`, `1h 12m`, `3g 4h` / `3d 4h`. */
  function dur(ms: number): string {
    if (!Number.isFinite(ms) || ms < 0) {
      return '–'
    }

    if (ms < 1000) {
      return `${Math.round(ms)}ms`
    }

    const seconds = ms / 1000

    if (seconds < 10) {
      return `${fixed(seconds, 1)}s`
    }

    if (seconds < 60) {
      return `${Math.round(seconds)}s`
    }

    const minutes = Math.floor(seconds / 60)

    if (minutes < 60) {
      const rest = Math.round(seconds - minutes * 60)

      return rest === 0 ? `${minutes}m` : `${minutes}m ${rest}s`
    }

    const hours = Math.floor(minutes / 60)

    if (hours < 24) {
      const rest = minutes - hours * 60

      return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`
    }

    const days = Math.floor(hours / 24)
    const rest = hours - days * 24

    return rest === 0 ? `${days}${locale.day}` : `${days}${locale.day} ${rest}h`
  }

  const ymd = (year: number, month: number, day: number): string =>
    locale.date === 'dmy' ? `${two(day)}/${two(month)}/${year}` : `${year}-${two(month)}-${two(day)}`

  /** `12/10/2026 10:31` / `2026-10-12 10:31`. */
  function dateTime(ms: number, offsetMin?: number): string {
    if (!Number.isFinite(ms) || ms <= 0) {
      return '–'
    }

    const p = partsOf(ms, offsetMin)

    return `${ymd(p.year, p.month, p.day)} ${two(p.hour)}:${two(p.minute)}`
  }

  /** `12/10/2026` / `2026-10-12`. */
  function date(ms: number, offsetMin?: number): string {
    if (!Number.isFinite(ms) || ms <= 0) {
      return '–'
    }

    const p = partsOf(ms, offsetMin)

    return ymd(p.year, p.month, p.day)
  }

  /** `YYYY-MM-DD` → `12/10/2026` / `2026-10-12`. */
  function dayLabel(day: string): string {
    const [year = '', month = '', d = ''] = day.split('-')

    return locale.date === 'dmy' ? `${d}/${month}/${year}` : day
  }

  /** Plurale semplice: `1 turno`, `3 turni`. */
  const plural = (count: number, one: string, many: string): string => `${int(count)} ${count === 1 ? one : many}`

  return { locale, fixed, int, compact, usd, pct, pct100, ratio, dur, dateTime, date, dayLabel, plural, cut, weekdays: locale.weekdays }
}

export type Fmt = ReturnType<typeof fmtOf>

/** Testo tagliato a `max` caratteri con `…`. */
export function cut(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, Math.max(0, max - 1))}…`
}

const IT = fmtOf('it')

export const { fixed, int, compact, usd, pct, pct100, dur, dateTime, date, dayLabel, plural } = IT

/** Nome del giorno della settimana (0 = lunedì). */
export const WEEKDAYS = IT.weekdays
