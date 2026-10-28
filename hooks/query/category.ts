/**
 * Le categorie di attività: regole in un file JSON facoltativo (opzione
 * `categoriesFile`, altrimenti `categorie.json` o `categories.json` nella
 * cartella dati). Senza file la funzione è spenta. La categoria si calcola
 * alla lettura, mai salvata: vale per tutte le sessioni registrate, e cambiare
 * le regole non richiede ricalcoli.
 *
 * Regola: una parola chiave nel nome del branch (diviso su - _ / ., parole
 * intere, senza maiuscole); più branch nella sessione → vale l'ultimo che ne
 * contiene una, più parole nel branch → vale la prima da sinistra. Senza parola
 * chiave, la classe di file con più righe aggiunte tra quelle di ripiego (a
 * parità l'ordine delle chiavi); con zero righe nessuna categoria.
 */

import type { FileClass } from '../core/events'
import type { KpiSessionFile } from '../core/session-file'
import type { I18n } from '../i18n'

export type CategoryRules = {
  /** Il nome della colonna negli export; `null` = `categoria` / `category` secondo la lingua. */
  column: string | null
  /** Parola chiave (minuscola) → etichetta. */
  words: Map<string, string>
  /** Classe di file → etichetta, nell'ordine del file. */
  fallback: [FileClass, string][]
}

/** Le categorie pronte per un comando: il nome della colonna e la categoria di una sessione. */
export type Categories = {
  column: string
  of: (file: KpiSessionFile) => string | null
  /** La sessione passa `--categoria` (etichette o parole chiave, `nessuna`/`none` = senza categoria). */
  matches: (file: KpiSessionFile, wanted: readonly string[]) => boolean
}

/** I valori di `--categoria` per le sessioni senza categoria. */
export const NO_CATEGORY: readonly string[] = ['nessuna', 'none']

/** Il nome del gruppo senza categoria in `--per categoria` (un codice tradotto quando si mostra). */
export const NO_CATEGORY_GROUP = '(nessuna)'

const CLASSES: Readonly<Record<string, FileClass>> = {
  src: 'src',
  test: 'test',
  doc: 'doc',
  cobol: 'cobol',
  mainframe: 'mainframe',
  config: 'config',
  altro: 'altro',
  other: 'altro',
}

/** Il separatore delle parole di un branch. */
const SEPARATORS = /[-_/.]+/

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)

/** Un oggetto da testo a testo, o il messaggio d'errore. */
function textMap(L: I18n, raw: Record<string, unknown>, keys: readonly string[]): { key: string; entries: [string, string][] } | string | null {
  const key = keys.find(one => raw[one] !== undefined)

  if (key === undefined) {
    return null
  }

  const value = raw[key]

  if (!isRecord(value) || Object.values(value).some(label => typeof label !== 'string' || label.trim() === '')) {
    return L.t('"{key}" deve essere un oggetto da testo a testo', { key })
  }

  return { key, entries: Object.entries(value as Record<string, string>).map(([name, label]) => [name.trim().toLowerCase(), label.trim()]) }
}

/** Le regole dal testo del file (chiavi in italiano o in inglese), o il motivo per cui non valgono. */
export function parseRules(L: I18n, text: string): { rules: CategoryRules } | { error: string } {
  let raw: unknown

  try {
    raw = JSON.parse(text)
  } catch (error) {
    return { error: L.t('JSON non valido: {error}', { error: error instanceof Error ? error.message : String(error) }) }
  }

  if (!isRecord(raw)) {
    return { error: L.t('il file deve contenere un oggetto JSON') }
  }

  const columnKey = ['colonna', 'column'].find(key => raw[key] !== undefined)
  const column = columnKey === undefined ? null : raw[columnKey]

  if (columnKey !== undefined && (typeof column !== 'string' || column.trim() === '')) {
    return { error: L.t('"{key}" deve essere un testo', { key: columnKey }) }
  }

  const words = textMap(L, raw, ['parole', 'keywords'])
  const fallback = textMap(L, raw, ['ripiego', 'fallback'])

  if (typeof words === 'string') {
    return { error: words }
  }

  if (typeof fallback === 'string') {
    return { error: fallback }
  }

  for (const [word] of words?.entries ?? []) {
    if (word === '' || SEPARATORS.test(word) || /\s/.test(word)) {
      return { error: L.t('la parola chiave "{word}" contiene un separatore (- _ / . o uno spazio): non può essere una parola del branch', { word }) }
    }
  }

  const classes: [FileClass, string][] = []

  for (const [name, label] of fallback?.entries ?? []) {
    const cls = CLASSES[name]

    if (cls === undefined) {
      return { error: L.t('classe di ripiego sconosciuta "{cls}" (valori: src, test, doc, cobol, mainframe, config, altro)', { cls: name }) }
    }

    classes.push([cls, label])
  }

  if ((words?.entries.length ?? 0) === 0 && classes.length === 0) {
    return { error: L.t('nessuna regola: servono "parole" o "ripiego"') }
  }

  return { rules: { column: typeof column === 'string' ? column.trim() : null, words: new Map(words?.entries ?? []), fallback: classes } }
}

/** I branch della sessione dal più recente: l'ultimo esatto dal summary, poi quelli di `meta.branches` all'indietro. */
function branchesOf(file: KpiSessionFile): string[] {
  const last = file.summary._r?.branch ?? null

  return [...new Set([...(last === null ? [] : [last]), ...[...file.meta.branches].reverse()])]
}

/** La categoria di una sessione, o `null`. */
export function categoryOf(rules: CategoryRules, file: KpiSessionFile): string | null {
  for (const branch of branchesOf(file)) {
    for (const word of branch.toLowerCase().split(SEPARATORS)) {
      const label = rules.words.get(word)

      if (label !== undefined) {
        return label
      }
    }
  }

  let best: string | null = null
  let most = 0

  for (const [cls, label] of rules.fallback) {
    const added = file.summary.files.byClass[cls]?.add ?? 0

    if (added > most) {
      best = label
      most = added
    }
  }

  return best
}

/** Le categorie per un comando nella lingua di `L`. */
export function categoriesOf(L: I18n, rules: CategoryRules): Categories {
  const of = (file: KpiSessionFile) => categoryOf(rules, file)

  return {
    column: rules.column ?? L.t('categoria'),
    of,
    matches: (file, wanted) => {
      const label = of(file)?.toLowerCase() ?? null

      return wanted.some(value => (NO_CATEGORY.includes(value) ? label === null : label !== null && (label === value || rules.words.get(value)?.toLowerCase() === label)))
    },
  }
}
