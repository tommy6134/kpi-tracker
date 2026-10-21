/**
 * Sparkline: valori → glifi ▁..█, e impacchettamento delle celle per
 * l'elemento `Raster` del terminale (`columns * rows` triplette u32
 * little-endian `[codePoint, fg, bg]` in base64).
 */

export const BLOCKS = ['▁', '▂', '▃', '▄', '▅', '▆', '▇', '█']

/** Il colore predefinito del terminale, come lo scrive RasterProps. */
export const DEFAULT_COLOR = 0x01000000

export type Cell = { glyph: string; fg: number; bg: number }

/** Un glifo per valore, scalato sul massimo; `null` → spazio. */
export function glyphsOf(values: readonly (number | null)[]): string[] {
  const max = Math.max(0, ...values.map(value => value ?? 0))

  return values.map(value => {
    if (value === null || max === 0) {
      return value === null ? ' ' : (BLOCKS[0] as string)
    }

    const index = Math.min(BLOCKS.length - 1, Math.max(0, Math.round((value / max) * (BLOCKS.length - 1))))

    return BLOCKS[index] as string
  })
}

/** Gli ultimi `width` valori, così la sparkline sta nella larghezza. */
export const lastOf = <T>(values: readonly T[], width: number): T[] => values.slice(Math.max(0, values.length - Math.max(1, width)))

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

/** Base64 standard con padding, senza dipendere da `btoa`. */
export function base64Of(bytes: Uint8Array): string {
  let out = ''

  for (let index = 0; index < bytes.length; index += 3) {
    const a = bytes[index] ?? 0
    const b = bytes[index + 1] ?? 0
    const c = bytes[index + 2] ?? 0

    out +=
      (B64[a >> 2] ?? '') +
      (B64[((a & 3) << 4) | (b >> 4)] ?? '') +
      (index + 1 < bytes.length ? (B64[((b & 15) << 2) | (c >> 6)] ?? '') : '=') +
      (index + 2 < bytes.length ? (B64[c & 63] ?? '') : '=')
  }

  return out
}

/** Le celle impacchettate per la prop `cells` di un Raster. */
export function packCells(cells: readonly Cell[]): string {
  const bytes = new Uint8Array(cells.length * 12)
  const view = new DataView(bytes.buffer)

  cells.forEach((cell, index) => {
    view.setUint32(index * 12, cell.glyph.codePointAt(0) ?? 0x20, true)
    view.setUint32(index * 12 + 4, cell.fg >>> 0, true)
    view.setUint32(index * 12 + 8, cell.bg >>> 0, true)
  })

  return base64Of(bytes)
}
