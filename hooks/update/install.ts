/**
 * Dove sta il plugin installato e dove sta la sua versione successiva: la
 * cache dei plugin di Claude Code (`<configDir>/plugins/cache/<marketplace>/
 * <plugin>/<versione>`), il registro dei marketplace e il catalogo nel loro
 * clone locale, che dice da dove arriva il plugin.
 */

import { isAbsolute, join, trimSlash } from '../core/paths'
import { readJson } from '../core/recover'
import type { HostFs } from '../host'
import { isVersion } from './semver'

/** Il file che dichiara la versione minima di Claude Code richiesta dalla release. */
export const COMPAT_FILE = '.claude-plugin/compat.json'
export const MANIFEST_FILE = '.claude-plugin/plugin.json'
const CATALOG_FILE = '.claude-plugin/marketplace.json'
const CACHE = '/plugins/cache/'

/** Una release del plugin: la versione e il Claude Code minimo (assente = nessun vincolo). */
export type Release = { version: string; minClaudeCode?: string }

/** Una voce del registro dei marketplace: dove sta il clone e se Claude Code lo aggiorna da sé. */
export type KnownMarketplace = { installLocation: string; autoUpdate: boolean }

/** Un plugin installato da un marketplace: la cartella di configurazione, il marketplace e il nome nel catalogo. */
export type Installation = { configDir: string; marketplace: string; plugin: string }

/**
 * Da dove il catalogo prende il plugin: una cartella del clone del marketplace
 * (`./…`), un repo git (`url`, `github`, `git-subdir`, con `ref`, `sha` e
 * sottocartella), oppure altro (npm, comando, valori non validi).
 */
export type PluginSource =
  | { kind: 'locale'; dir: string }
  | { kind: 'git'; url: string; ref?: string; sha?: string; path?: string }
  | { kind: 'altro'; what: string }

/**
 * L'installazione dal percorso del plugin; `null` se è caricato da una
 * cartella (`--plugin-dir`). La cartella di configurazione si ricava dal
 * percorso stesso, così vale con qualunque `CLAUDE_CONFIG_DIR`.
 */
export function installationOf(pluginRoot: string): Installation | null {
  const path = pluginRoot.replace(/\\/g, '/')
  const at = path.lastIndexOf(CACHE)

  if (at <= 0) {
    return null
  }

  const [marketplace, plugin, version] = path
    .slice(at + CACHE.length)
    .split('/')
    .filter(part => part !== '')

  return marketplace === undefined || plugin === undefined || version === undefined ? null : { configDir: pluginRoot.slice(0, at), marketplace, plugin }
}

/** La voce `name` di `known_marketplaces.json`; `null` se manca o non ha un clone. */
export async function knownMarketplace(fs: HostFs, configDir: string, name: string): Promise<KnownMarketplace | null> {
  const known = await readJson<Record<string, unknown>>(fs, join(configDir, 'plugins', 'known_marketplaces.json'))
  const entry = known?.[name]

  if (typeof entry !== 'object' || entry === null) {
    return null
  }

  const { installLocation, autoUpdate } = entry as { installLocation?: unknown; autoUpdate?: unknown }

  return typeof installLocation === 'string' && installLocation !== '' ? { installLocation, autoUpdate: autoUpdate === true } : null
}

/** Il Claude Code minimo dichiarato in `compat.json`; `undefined` se il file manca o non lo dichiara. */
export async function compatAt(fs: HostFs, dir: string): Promise<string | undefined> {
  const min = (await readJson<{ minClaudeCode?: unknown }>(fs, join(dir, COMPAT_FILE)))?.minClaudeCode

  return isVersion(min) ? min : undefined
}

/** La release che sta nella cartella di un plugin; `null` senza una versione leggibile in `plugin.json`. */
export async function releaseAt(fs: HostFs, dir: string): Promise<Release | null> {
  const version = (await readJson<{ version?: unknown }>(fs, join(dir, MANIFEST_FILE)))?.version

  if (!isVersion(version)) {
    return null
  }

  const min = await compatAt(fs, dir)

  return { version, ...(min !== undefined && { minClaudeCode: min }) }
}

const text = (value: unknown): string | undefined => (typeof value === 'string' && value !== '' ? value : undefined)

/** Un percorso relativo che non esce dalla sua base. */
const isSafeRelative = (path: string): boolean => !isAbsolute(path) && !path.split(/[\\/]/).includes('..')

/** Toglie `./` in testa e i separatori in coda (`.` diventa vuoto). */
const relativeOf = (path: string): string => path.replace(/^\.[\\/]/, '').replace(/[\\/]+$/, '').replace(/^\.$/, '')

/** Un URL o un ref da passare a git: niente spazi, e non può sembrare un'opzione. */
const isSafeArg = (value: string): boolean => /^[^\s-]\S*$/.test(value)

const githubUrl = (repo: string): string => `https://github.com/${repo}.git`

/** La fonte del plugin `name` nel catalogo del clone `location`; `null` se il catalogo non lo elenca. */
export async function sourceOf(fs: HostFs, location: string, name: string): Promise<PluginSource | null> {
  const catalog = await readJson<{ plugins?: unknown; metadata?: { pluginRoot?: unknown } }>(fs, join(location, CATALOG_FILE))
  const plugins = Array.isArray(catalog?.plugins) ? (catalog.plugins as unknown[]) : []
  const entry = plugins.find(one => typeof one === 'object' && one !== null && (one as { name?: unknown }).name === name) as { source?: unknown } | undefined

  if (entry === undefined) {
    return null
  }

  const source = entry.source

  if (typeof source === 'string') {
    if (!isSafeRelative(source)) {
      return { kind: 'altro', what: 'percorso non valido' }
    }

    // `metadata.pluginRoot` vale per i nomi nudi (`formatter`), non per quelli che iniziano con `./`.
    const root = text(catalog?.metadata?.pluginRoot)
    const base = root !== undefined && !/^\.[\\/]/.test(source) && isSafeRelative(root) ? join(trimSlash(location), relativeOf(root)) : trimSlash(location)
    const rest = relativeOf(source)

    return { kind: 'locale', dir: rest === '' ? base : join(base, rest) }
  }

  if (typeof source !== 'object' || source === null) {
    return { kind: 'altro', what: 'fonte non valida' }
  }

  const fields = source as Record<string, unknown>
  const type = text(fields.source) ?? 'sconosciuta'
  const repo = text(fields.repo)
  const raw = type === 'github' ? (repo === undefined ? undefined : githubUrl(repo)) : type === 'url' || type === 'git-subdir' ? text(fields.url) : undefined

  if (raw === undefined) {
    return { kind: 'altro', what: `fonte ${type}` }
  }

  // git-subdir accetta anche la forma breve `owner/repo` di GitHub.
  const url = type === 'git-subdir' && /^[\w.-]+\/[\w.-]+$/.test(raw) ? githubUrl(raw) : raw
  const ref = text(fields.ref)
  const sha = text(fields.sha)
  const path = type === 'git-subdir' ? text(fields.path) : undefined

  if (!isSafeArg(url) || (ref !== undefined && !isSafeArg(ref)) || (path !== undefined && !isSafeRelative(path))) {
    return { kind: 'altro', what: 'fonte non valida' }
  }

  const sub = path === undefined ? '' : relativeOf(path)

  return { kind: 'git', url, ...(ref !== undefined && { ref }), ...(sha !== undefined && { sha }), ...(sub !== '' && { path: sub }) }
}
