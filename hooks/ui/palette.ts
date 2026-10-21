/** Colori dell'interfaccia: chiavi del tema dove possibile, così seguono il tema della persona. */

export const ACCENT = 'claude'
export const GOOD = 'success'
export const BAD = 'error'
export const WARN = 'warning'

/** Il livello di una percentuale (contesto, rate limit): normale sotto 50, attenzione sotto 80, poi critico. */
export type Tone = 'ok' | 'warn' | 'bad'

export function toneOf(pct100: number | null): Tone {
  if (pct100 === null || !Number.isFinite(pct100) || pct100 < 50) {
    return 'ok'
  }

  return pct100 < 80 ? 'warn' : 'bad'
}

/** Il colore di un valore a quel livello. */
export const toneColor = (tone: Tone): string => (tone === 'bad' ? BAD : tone === 'warn' ? WARN : GOOD)

/** Il livello peggiore fra più valori. */
export const worstOf = (...tones: Tone[]): Tone => (tones.includes('bad') ? 'bad' : tones.includes('warn') ? 'warn' : 'ok')

/** Colori RGB per le celle del Raster (0x00RRGGBB). */
export const RASTER = {
  bar: 0x6a9fb5,
  error: 0xd9534f,
  compact: 0xe0a030,
}
