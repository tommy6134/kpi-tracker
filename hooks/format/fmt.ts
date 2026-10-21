/**
 * Formattazione in italiano scritta a mano (Intl non è garantito nel runtime
 * dei mod): virgola decimale, punto per le migliaia.
 */

import { partsOf } from '../core/time'

/** Numero con `decimals` decimali, virgola decimale e punto per le migliaia. */
export function fixed(value: number, decimals = 0): string {
  if (!Number.isFinite(value)) {
    return '–'
  }

  const negative = value < 0
  const rounded = Math.abs(value).toFixed(decimals)
  const [whole = '0', frac] = rounded.split('.')
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, '.')

  return `${negative ? '−' : ''}${grouped}${frac !== undefined ? `,${frac}` : ''}`
}

/** Intero con separatore delle migliaia: `12.345`. */
export const int = (value: number): string => fixed(Math.round(value), 0)

/** Forma compatta: `950`, `12,4k`, `312k`, `2,1M`, `1,3G`. */
export function compact(value: number): string {
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
export function usd(value: number): string {
  const abs = Math.abs(value)

  if (abs === 0) {
    return '$0'
  }

  return `$${fixed(value, abs >= 100 ? 0 : abs >= 1 ? 2 : abs >= 0.01 ? 3 : 4)}`
}

/** Percentuale da una frazione 0..1: `89%`. */
export const pct = (fraction: number, decimals = 0): string => `${fixed(fraction * 100, decimals)}%`

/** Percentuale da un valore già 0..100: `46%`. */
export const pct100 = (value: number, decimals = 0): string => `${fixed(value, decimals)}%`

/** Durata leggibile: `850ms`, `42s`, `1m 12s`, `1h 12m`, `3g 4h`. */
export function dur(ms: number): string {
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

  return rest === 0 ? `${days}g` : `${days}g ${rest}h`
}

const two = (value: number): string => String(value).padStart(2, '0')

/** `12/10/2026 10:31`. */
export function dateTime(ms: number, offsetMin?: number): string {
  if (!Number.isFinite(ms) || ms <= 0) {
    return '–'
  }

  const p = partsOf(ms, offsetMin)

  return `${two(p.day)}/${two(p.month)}/${p.year} ${two(p.hour)}:${two(p.minute)}`
}

/** `12/10/2026`. */
export function date(ms: number, offsetMin?: number): string {
  if (!Number.isFinite(ms) || ms <= 0) {
    return '–'
  }

  const p = partsOf(ms, offsetMin)

  return `${two(p.day)}/${two(p.month)}/${p.year}`
}

/** `YYYY-MM-DD` → `12/10/2026`. */
export function dayLabel(day: string): string {
  const [year, month, d] = day.split('-')

  return `${d}/${month}/${year}`
}

/** Testo tagliato a `max` caratteri con `…`. */
export function cut(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, Math.max(0, max - 1))}…`
}

/** Plurale semplice: `1 turno`, `3 turni`. */
export const plural = (count: number, one: string, many: string): string => `${int(count)} ${count === 1 ? one : many}`

/** Nome del giorno della settimana (0 = lunedì). */
export const WEEKDAYS = ['lun', 'mar', 'mer', 'gio', 'ven', 'sab', 'dom']
