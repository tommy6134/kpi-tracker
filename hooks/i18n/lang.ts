/** Le lingue del plugin. */

export type Lang = 'it' | 'en'

export const LANGS: readonly Lang[] = ['it', 'en']

const ALIASES: Record<string, Lang> = {
  it: 'it',
  ita: 'it',
  italiano: 'it',
  italian: 'it',
  en: 'en',
  eng: 'en',
  english: 'en',
  inglese: 'en',
}

/** La lingua da un valore scritto (`it`, `italiano`, `English`…); `null` se non si capisce. */
export function langOf(value: unknown): Lang | null {
  return typeof value === 'string' ? (ALIASES[value.trim().toLowerCase()] ?? null) : null
}
