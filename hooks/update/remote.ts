/**
 * La release nel repo git del plugin, quando il catalogo del marketplace lo
 * indica con un URL (`url`, `github`, `git-subdir`) invece che con una cartella
 * del proprio clone: `git fetch --depth 1` in un repo bare tra i dati KPI, poi
 * `git show` di plugin.json e compat.json, senza checkout. Git usa le
 * credenziali già configurate e non le chiede mai a terminale.
 */

import { join } from '../core/paths'
import type { Host } from '../host'
import { COMPAT_FILE, MANIFEST_FILE, type PluginSource, type Release } from './install'
import { isVersion } from './semver'

/** Per git e per la CLI di Claude Code: mai una richiesta di credenziali a terminale (anche Git Credential Manager su Windows). */
export const NO_PROMPT: Record<string, string> = { GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'never' }

const FETCH_TIMEOUT_MS = 60_000
const LOCAL_TIMEOUT_MS = 15_000

type GitSource = Extract<PluginSource, { kind: 'git' }>

/** Lancia git; rifiuta con quanto ha scritto su stderr se esce con errore. */
async function git(host: Host, args: string[], timeoutMs = LOCAL_TIMEOUT_MS): Promise<string> {
  const result = await host.run(['git', ...args], { timeoutMs, env: NO_PROMPT })

  if (result.exitCode !== 0) {
    throw new Error(result.stderr.trim() === '' ? `git: codice di uscita ${result.exitCode}` : result.stderr)
  }

  return result.stdout
}

const field = (json: string, key: string): unknown => {
  try {
    return (JSON.parse(json) as Record<string, unknown>)[key]
  } catch {
    return undefined
  }
}

/** La release all'ultimo commit di `source` (o al suo `ref`), scaricato nel repo bare `gitDir`. */
export async function releaseInRepo(host: Host, gitDir: string, source: GitSource): Promise<Release> {
  if (!(await host.fs.exists(join(gitDir, 'HEAD')).catch(() => false))) {
    await git(host, ['init', '--bare', '-q', gitDir])
  }

  await git(host, ['--git-dir', gitDir, 'fetch', '--depth', '1', '--no-tags', '-q', source.url, source.ref ?? 'HEAD'], FETCH_TIMEOUT_MS)

  const prefix = source.path === undefined ? '' : `${source.path}/`
  const version = field(await git(host, ['--git-dir', gitDir, 'show', `FETCH_HEAD:${prefix}${MANIFEST_FILE}`]), 'version')

  if (!isVersion(version)) {
    throw new Error(`versione illeggibile in ${prefix}${MANIFEST_FILE} di ${source.url}`)
  }

  // compat.json manca nelle release precedenti alla 0.3.0: nessun vincolo.
  const min = await git(host, ['--git-dir', gitDir, 'show', `FETCH_HEAD:${prefix}${COMPAT_FILE}`]).then(
    json => field(json, 'minClaudeCode'),
    () => undefined,
  )

  return { version, ...(isVersion(min) && { minClaudeCode: min }) }
}
