/**
 * Percorsi: dove vivono i dati KPI, come si codifica una cartella di progetto
 * e come si chiama la cartella di una sessione. Tutto puro: i valori
 * d'ambiente arrivano da register.ts.
 */

import { hash36 } from './ids'
import { stampOf } from './time'

/** Lunghezza oltre la quale Claude Code accorcia il nome codificato e aggiunge un hash. */
export const MAX_ENCODED = 200

/** Le cartelle di servizio iniziano con `_`: un nome codificato contiene solo [A-Za-z0-9-] e non collide mai. */
export const META_DIR = '_meta'
export const REPORTS_DIR = '_reports'
export const EXPORTS_DIR = '_exports'
export const ROOT_MARKER = `${META_DIR}/kpi-root.json`

/** Nome della cartella di una sessione: `YYYY-MM-DD_HH-mm-ss_<id8>`. */
export const SESSION_DIR_RE = /^(\d{4})-(\d{2})-(\d{2})_(\d{2})-(\d{2})-(\d{2})_([0-9A-Za-z-]{8})$/

/** Nome del file chunk di eventi: `<segmento>-<NNNN>.jsonl`. */
export const CHUNK_RE = /^(s\d{2,}-[0-9a-f]{4})-(\d{4,})\.jsonl$/

export type EnvValues = {
  CLAUDE_CONFIG_DIR?: string | undefined
  HOME?: string | undefined
  USERPROFILE?: string | undefined
}

/** `true` per un percorso assoluto POSIX (`/x`) o Windows (`C:\x`, `C:/x`, `\\server\x`). */
export function isAbsolute(path: string): boolean {
  return path.startsWith('/') || /^[A-Za-z]:[\\/]/.test(path) || path.startsWith('\\\\')
}

/** Il separatore che il percorso usa già: `\` per un percorso Windows senza `/`. */
function sepOf(path: string): string {
  return path.includes('\\') && !path.includes('/') ? '\\' : '/'
}

/** Unisce segmenti di percorso senza duplicare i separatori. */
export function join(base: string, ...parts: string[]): string {
  const sep = sepOf(base)
  let out = base

  for (const raw of parts) {
    if (raw === '') {
      continue
    }

    const part = raw.replace(/^[\\/]+/, '')

    out = out === '' ? part : out.endsWith('/') || out.endsWith('\\') ? `${out}${part}` : `${out}${sep}${part}`
  }

  return out
}

/** Toglie i separatori finali (non dalla radice `/`). */
export function trimSlash(path: string): string {
  return path.length > 1 ? path.replace(/[\\/]+$/, '') : path
}

/** Ultimo segmento di un percorso. */
export function baseName(path: string): string {
  const trimmed = trimSlash(path)
  const index = Math.max(trimmed.lastIndexOf('/'), trimmed.lastIndexOf('\\'))

  return index >= 0 ? trimmed.slice(index + 1) : trimmed
}

/** La cartella che contiene il percorso (`/a/b/c.csv` → `/a/b`, `C:\x\y.csv` → `C:\x`); la radice resta la radice. */
export function dirName(path: string): string {
  const trimmed = trimSlash(path)
  const index = Math.max(trimmed.lastIndexOf('/'), trimmed.lastIndexOf('\\'))

  if (index < 0) {
    return trimmed
  }

  const parent = trimmed.slice(0, index)

  // `/x` → `/`, `C:\x` → `C:\`.
  return parent === '' ? trimmed.slice(0, 1) : /^[A-Za-z]:$/.test(parent) ? `${parent}${trimmed.charAt(index)}` : parent
}

/**
 * L'URL `file://` di un percorso assoluto, per un link nel report HTML:
 * `/a b` → `file:///a%20b`, `C:\x` → `file:///C:/x`, `\\srv\share` → `file://srv/share`.
 */
export function fileUrlOf(path: string): string {
  const slashed = path.replace(/\\/g, '/')
  const encoded = slashed
    .split('/')
    .map((part, index) => (index === 0 && /^[A-Za-z]:$/.test(part) ? part : encodeURIComponent(part)))
    .join('/')

  if (slashed.startsWith('//')) {
    return `file:${encoded}`
  }

  return /^[A-Za-z]:\//.test(slashed) ? `file:///${encoded}` : `file://${encoded}`
}

/** Estensione minuscola senza punto (`ts`), `''` se assente; i file nascosti senza estensione danno `''`. */
export function extOf(path: string): string {
  const name = baseName(path)
  const dot = name.lastIndexOf('.')

  return dot > 0 && dot < name.length - 1 ? name.slice(dot + 1).toLowerCase().slice(0, 16) : ''
}

/** `true` se `path` sta dentro `dir` (o coincide). Confronto testuale su percorsi assoluti normalizzati. */
export function isInside(path: string, dir: string): boolean {
  const p = trimSlash(path.replace(/\\/g, '/'))
  const d = trimSlash(dir.replace(/\\/g, '/'))

  return p === d || p.startsWith(`${d}/`)
}

/**
 * La cartella di configurazione di Claude Code: `$CLAUDE_CONFIG_DIR` se
 * definita, altrimenti `$HOME/.claude` (o `%USERPROFILE%\.claude`).
 */
export function configDirOf(env: EnvValues): string | null {
  const explicit = env.CLAUDE_CONFIG_DIR?.trim()

  if (explicit !== undefined && explicit !== '') {
    return trimSlash(explicit)
  }

  const home = (env.HOME ?? env.USERPROFILE)?.trim()

  return home !== undefined && home !== '' ? join(trimSlash(home), '.claude') : null
}

/** Un percorso scritto dall'utente (opzione o `--out`): assoluto, o `~`/`~/…` nella home. `null` se relativo. */
export function resolvePath(env: EnvValues, value: string): string | null {
  const path = value.trim()

  if (path === '~' || /^~[\\/]/.test(path)) {
    const home = (env.HOME ?? env.USERPROFILE)?.trim()

    return home !== undefined && home !== '' ? trimSlash(join(trimSlash(home), path.slice(1))) : null
  }

  return isAbsolute(path) ? trimSlash(path) : null
}

/** `true` se un segmento del percorso è nascosto (`.claude`): i browser snap e flatpak non lo leggono. */
export function hasHiddenSegment(path: string): boolean {
  return path.split(/[\\/]/).some(part => part.startsWith('.') && part !== '.' && part !== '..')
}

/** La radice dei dati KPI: l'opzione `dataDir` se valorizzata (assoluta), altrimenti `<configDir>/kpi`. */
export function kpiRootOf(env: EnvValues, dataDir: string): string | null {
  if (dataDir.trim() !== '') {
    return resolvePath(env, dataDir)
  }

  const config = configDirOf(env)

  return config === null ? null : join(config, 'kpi')
}

/**
 * Il nome della cartella di un progetto, con la stessa regola di Claude Code
 * (`projects/`): ogni carattere non alfanumerico diventa `-`; oltre 200
 * caratteri si accorcia e si aggiunge un hash del percorso.
 */
export function encodeProject(path: string): string {
  const encoded = path.replace(/[^a-zA-Z0-9]/g, '-')

  return encoded.length > MAX_ENCODED ? `${encoded.slice(0, MAX_ENCODED)}-${hash36(path)}` : encoded
}

/** La variante del nome usata quando un altro percorso occupa già la cartella codificata (`/a/b-c` e `/a/b/c`). */
export function encodeProjectAlt(path: string): string {
  return `${encodeProject(path)}-${hash36(`kpi:${path}`)}`
}

/** I primi 8 caratteri dell'id di sessione, ripuliti da caratteri non sicuri. */
export function id8Of(sessionId: string): string {
  const clean = sessionId.replace(/[^0-9A-Za-z-]/g, '').slice(0, 8)

  return clean.padEnd(8, '0')
}

/** `2026-10-12_10-31-07_3f9a1c2e` per una sessione iniziata a `ms` (ora locale). */
export function sessionDirName(ms: number, sessionId: string, offsetMin?: number): string {
  return `${stampOf(ms, offsetMin)}_${id8Of(sessionId)}`
}

/** Le parti di un nome di cartella sessione, o `null` se il nome non lo è. */
export function parseSessionDir(name: string): { date: string; id8: string } | null {
  const match = SESSION_DIR_RE.exec(name)

  if (match === null) {
    return null
  }

  return { date: `${match[1]}-${match[2]}-${match[3]}`, id8: match[7] ?? '' }
}

/** Nome del file chunk numero `index` (da 1) del segmento `segId`. */
export function chunkName(segId: string, index: number): string {
  return `${segId}-${String(index).padStart(4, '0')}.jsonl`
}

/** Le parti di un nome di chunk, o `null`. */
export function parseChunk(name: string): { segId: string; index: number } | null {
  const match = CHUNK_RE.exec(name)

  return match === null ? null : { segId: match[1] ?? '', index: Number(match[2]) }
}

/** Il nome leggibile di un progetto: l'ultimo segmento del percorso. */
export function projectNameOf(path: string): string {
  return baseName(path) || path
}
