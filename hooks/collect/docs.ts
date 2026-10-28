/**
 * I documenti (Word, Excel, PowerPoint, PDF, OpenDocument) creati nella
 * sessione. Nascono quasi sempre da comandi Bash (pandoc, python-docx,
 * openpyxl, script generati), di cui il plugin salva solo programma e
 * sottocomando: si vedono confrontando `git status` del repo prima e dopo i
 * turni con comandi Bash. I percorsi restano in memoria; su disco vanno solo i
 * conteggi per estensione.
 *
 * Non si vedono i file fuori dal repo, quelli che git ignora e quelli creati e
 * cancellati nello stesso turno; senza repo git la funzione non fa nulla.
 */

import { extOf } from '../core/paths'

/** Le estensioni dei documenti che si contano (sono anche nella classe doc). */
export const DOCUMENT_EXT: readonly string[] = ['docx', 'doc', 'odt', 'pdf', 'xlsx', 'xls', 'ods', 'pptx', 'ppt', 'odp']

/** Le estensioni come pathspec di tutto il repo, senza distinzione di maiuscole. */
const PATHSPECS = DOCUMENT_EXT.map(ext => `:(top,glob,icase)**/*.${ext}`)

/**
 * `git status` dei documenti, con l'oid di HEAD. `--no-optional-locks` non
 * prende `index.lock`, che farebbe fallire un comando git lanciato da Claude
 * nello stesso momento.
 */
export const statusArgv = (): string[] => ['git', '--no-optional-locks', 'status', '--porcelain=v2', '--branch', '-z', '-uall', '--', ...PATHSPECS]

/** I documenti aggiunti o cambiati tra due commit (creati e committati nello stesso turno). */
export const diffArgv = (from: string, to: string): string[] => ['git', '--no-optional-locks', 'diff', '--name-status', '-z', from, to, '--', ...PATHSPECS]

/** Un documento nello stato di git: `new` non tracciato o aggiunto, `changed` tracciato e modificato. */
export type DocState = 'new' | 'changed'

/** L'istantanea dei documenti: HEAD, e per percorso (relativo alla radice del repo) stato e ora di modifica. */
export type DocSnapshot = { head: string | null; files: Map<string, { state: DocState; mtime: number | null }> }

/** I conteggi per estensione di un confronto. */
export type DocCounts = { created: Record<string, number>; regen: Record<string, number> }

const isDocument = (path: string): boolean => DOCUMENT_EXT.includes(extOf(path))

/** L'output di `statusArgv`: HEAD e lo stato dei documenti (quelli cancellati non ci sono). */
export function parseStatus(text: string): { head: string | null; files: Map<string, DocState> } {
  const files = new Map<string, DocState>()
  const tokens = text.split('\0')
  let head: string | null = null

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index] as string
    const oid = /^# branch\.oid ([0-9a-f]{7,64})$/.exec(token)

    if (oid !== null) {
      head = oid[1] as string
      continue
    }

    if (token.startsWith('? ')) {
      files.set(token.slice(2), 'new')
      continue
    }

    // `1 XY …` modificato, `2 XY … score path` rinominato (il percorso d'origine è il token dopo), `u XY …` in conflitto.
    const entry = /^1 (\S\S)(?: \S+){6} (.+)$/s.exec(token) ?? /^2 (\S\S)(?: \S+){7} (.+)$/s.exec(token) ?? /^u (\S\S)(?: \S+){8} (.+)$/s.exec(token)

    if (token.startsWith('2 ')) {
      index += 1
    }

    if (entry === null) {
      continue
    }

    const xy = entry[1] as string

    if (!xy.includes('D')) {
      files.set(entry[2] as string, xy[0] === 'A' ? 'new' : 'changed')
    }
  }

  return { head, files: new Map([...files].filter(([path]) => isDocument(path))) }
}

/** L'output di `diffArgv`: documenti aggiunti e modificati. */
export function parseDiff(text: string): { added: string[]; modified: string[] } {
  const tokens = text.split('\0')
  const added: string[] = []
  const modified: string[] = []

  for (let index = 0; index < tokens.length; index += 1) {
    const status = tokens[index] as string

    // Rinominati e copiati portano due percorsi: vale il nuovo.
    if (/^[RC]\d*$/.test(status)) {
      index += 2

      continue
    }

    const path = tokens[index + 1]

    if (path === undefined || status === '') {
      continue
    }

    index += 1

    if (status === 'A') {
      added.push(path)
    } else if (status === 'M' || status === 'T') {
      modified.push(path)
    }
  }

  return { added: added.filter(isDocument), modified: modified.filter(isDocument) }
}

const bump = (map: Record<string, number>, path: string): void => {
  const ext = extOf(path)

  map[ext] = (map[ext] ?? 0) + 1
}

/**
 * I documenti creati e rigenerati tra due istantanee. Creato: nuovo (non
 * tracciato o aggiunto) e prima non c'era, oppure aggiunto in un commit fatto
 * nel frattempo. Rigenerato: tracciato che ora risulta modificato, o già
 * presente con un'ora di modifica diversa, oppure modificato in un commit.
 */
export function compareDocs(before: DocSnapshot, after: DocSnapshot, committed: { added: string[]; modified: string[] } | null): DocCounts {
  const counts: DocCounts = { created: {}, regen: {} }
  const seen = new Set<string>()

  for (const [path, file] of after.files) {
    const old = before.files.get(path)

    seen.add(path)

    if (old === undefined) {
      bump(file.state === 'new' ? counts.created : counts.regen, path)
    } else if (file.mtime !== null && old.mtime !== null && file.mtime !== old.mtime) {
      bump(counts.regen, path)
    }
  }

  for (const path of committed?.added ?? []) {
    if (!seen.has(path) && !before.files.has(path)) {
      bump(counts.created, path)
    }
  }

  for (const path of committed?.modified ?? []) {
    if (!seen.has(path) && !before.files.has(path)) {
      bump(counts.regen, path)
    }
  }

  return counts
}
