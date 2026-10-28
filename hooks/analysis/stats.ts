/**
 * Statistiche compatte e unibili: conteggio, somma, minimo, massimo e un
 * istogramma logaritmico sparso (4 bucket per raddoppio) da cui stimare
 * mediana e percentili senza tenere ogni valore.
 */

export type Stat = {
  n: number
  sum: number
  min: number
  max: number
  /** bucket → conteggio; bucket 0 = valori < 1. */
  h: Record<string, number>
}

export const emptyStat = (): Stat => ({ n: 0, sum: 0, min: 0, max: 0, h: {} })

const PER_DOUBLING = 4

/** Il bucket di un valore. */
export function bucketOf(value: number): number {
  return value < 1 ? 0 : Math.floor(PER_DOUBLING * Math.log2(value)) + 1
}

/** Il valore rappresentativo (media geometrica dei bordi) di un bucket. */
export function bucketMid(bucket: number): number {
  return bucket <= 0 ? 0.5 : 2 ** ((bucket - 0.5) / PER_DOUBLING)
}

/** Aggiunge un valore (ignora NaN e infiniti; i negativi contano come 0). */
export function addStat(stat: Stat, raw: number): void {
  if (!Number.isFinite(raw)) {
    return
  }

  const value = Math.max(0, raw)

  stat.min = stat.n === 0 ? value : Math.min(stat.min, value)
  stat.max = stat.n === 0 ? value : Math.max(stat.max, value)
  stat.n += 1
  stat.sum += value

  const key = String(bucketOf(value))

  stat.h[key] = (stat.h[key] ?? 0) + 1
}

/** Unisce `from` dentro `into`. */
export function mergeStat(into: Stat, from: Stat | undefined): void {
  if (from === undefined || from.n === 0) {
    return
  }

  into.min = into.n === 0 ? from.min : Math.min(into.min, from.min)
  into.max = into.n === 0 ? from.max : Math.max(into.max, from.max)
  into.n += from.n
  into.sum += from.sum

  for (const [key, count] of Object.entries(from.h)) {
    into.h[key] = (into.h[key] ?? 0) + count
  }
}

/** Media, 0 se vuota. */
export const meanOf = (stat: Stat | undefined): number => (stat === undefined || stat.n === 0 ? 0 : stat.sum / stat.n)

/** Percentile stimato dall'istogramma (`p` da 0 a 1), limitato a [min, max]; 0 se vuota. */
export function percentileOf(stat: Stat | undefined, p: number): number {
  if (stat === undefined || stat.n === 0) {
    return 0
  }

  const target = Math.max(1, Math.ceil(p * stat.n))
  const buckets = Object.entries(stat.h)
    .map(([key, count]) => [Number(key), count] as const)
    .sort((a, b) => a[0] - b[0])

  let seen = 0

  for (const [bucket, count] of buckets) {
    seen += count

    if (seen >= target) {
      return Math.min(stat.max, Math.max(stat.min, bucketMid(bucket)))
    }
  }

  return stat.max
}

/** Percentile esatto di un elenco di valori. */
export function exactPercentile(values: readonly number[], p: number): number {
  if (values.length === 0) {
    return 0
  }

  const sorted = [...values].sort((a, b) => a - b)
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(p * sorted.length) - 1))

  return sorted[index] ?? 0
}

/** Incrementa un contatore in una mappa. */
export function bump(map: Record<string, number>, key: string, by = 1): void {
  map[key] = (map[key] ?? 0) + by
}

/** La somma dei valori di una mappa di contatori (0 se manca). */
export const totalOf = (map: Record<string, number> | undefined): number => Object.values(map ?? {}).reduce((a, b) => a + b, 0)

/** Unisce mappe di contatori. */
export function mergeCounts(into: Record<string, number>, from: Record<string, number> | undefined): void {
  for (const [key, value] of Object.entries(from ?? {})) {
    into[key] = (into[key] ?? 0) + value
  }
}

/** Le prime `limit` voci per valore decrescente. */
export function topOf(map: Record<string, number>, limit: number): [string, number][] {
  return Object.entries(map)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
}
