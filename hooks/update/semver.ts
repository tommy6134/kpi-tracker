/** Confronto di versioni `1.2.3`: contano solo le parti numeriche (`2.1.280-dev` vale `2.1.280`). */

/** Le parti numeriche di una versione (`v0.3.0-dev` → `[0, 3, 0]`); `null` se non è una versione. */
export function partsOf(version: string): number[] | null {
  const match = /^v?(\d+(?:\.\d+)*)/.exec(version.trim())

  return match === null ? null : (match[1] as string).split('.').map(Number)
}

/** `true` per una stringa che inizia con una versione numerica. */
export const isVersion = (value: unknown): value is string => typeof value === 'string' && partsOf(value) !== null

/** Negativo, zero o positivo se `a` è più vecchia, uguale o più nuova di `b`; le parti mancanti valgono 0. */
export function compareVersions(a: string, b: string): number {
  const pa = partsOf(a) ?? []
  const pb = partsOf(b) ?? []

  for (let index = 0; index < Math.max(pa.length, pb.length); index += 1) {
    const diff = (pa[index] ?? 0) - (pb[index] ?? 0)

    if (diff !== 0) {
      return Math.sign(diff)
    }
  }

  return 0
}

/** La versione di Claude Code da `$.session.version()`: la release (`base`) se c'è, altrimenti la versione completa. */
export const engineOf = (value: { version: string; base?: string }): string => value.base ?? value.version
