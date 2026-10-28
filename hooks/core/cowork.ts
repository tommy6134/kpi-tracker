/**
 * Cowork, la modalità agente dell'app desktop: da dove la si riconosce e
 * dove gira. Tutto puro: i valori d'ambiente arrivano da register.ts.
 */

import { isAbsolute, trimSlash, type EnvValues } from './paths'

/**
 * Dove gira un task Cowork: `host` è Claude Code sul computer (dall'app 3.x,
 * solo i comandi shell vanno nella VM); `vm` è Claude Code dentro la VM, che
 * si azzera a fine task; `cloud` è un task sui server di Anthropic.
 */
export type CoworkMode = 'host' | 'vm' | 'cloud'

export type CoworkEnv = EnvValues & { CLAUDE_CODE_ENTRYPOINT?: string | undefined }

/** La cartella dell'app desktop che tiene i task Cowork, ognuno con la sua `.claude`. */
export const COWORK_SESSIONS_DIR = 'local-agent-mode-sessions'

/** La home di un task nella VM di Cowork: `/sessions/<nome>`. */
const VM_HOME_RE = /^\/sessions\/[^/]+(\/|$)/

/** Dove l'app tiene i suoi dati sotto la home: macOS, Linux, Windows (anche il pacchetto MSIX, sotto `AppData`). */
const APP_DATA_RE = /^(.+?)\/(?:Library\/Application Support|\.config|AppData)\//

const slashed = (value: string | undefined): string => (value ?? '').trim().replace(/\\/g, '/')

/** `true` se il percorso sta dentro la cartella dei task Cowork dell'app desktop. */
export function isInCoworkSessions(path: string | undefined): boolean {
  return slashed(path).split('/').includes(COWORK_SESSIONS_DIR)
}

/**
 * Il modo di Cowork dai segnali d'ambiente, `null` fuori da Cowork. Cowork
 * in locale dichiara `local-agent`, nel cloud `remote_cowork`; la cartella di
 * configurazione dentro i task dell'app basta se l'entrypoint manca.
 */
export function coworkOf(env: CoworkEnv): CoworkMode | null {
  const entrypoint = slashed(env.CLAUDE_CODE_ENTRYPOINT).toLowerCase()

  if (entrypoint === 'remote_cowork') {
    return 'cloud'
  }

  const inVm = VM_HOME_RE.test(slashed(env.HOME)) || VM_HOME_RE.test(slashed(env.CLAUDE_CONFIG_DIR))

  if (entrypoint === 'local-agent') {
    return inVm ? 'vm' : 'host'
  }

  return isInCoworkSessions(env.CLAUDE_CONFIG_DIR) ? 'host' : null
}

/**
 * La home vera di chi usa Cowork: `HOME` (o `USERPROFILE`), salvo che stia
 * dentro i task dell'app, e allora la cartella prima dei dati dell'app.
 * `null` se non si ricava.
 */
export function realHomeOf(env: EnvValues): string | null {
  const home = (env.HOME ?? env.USERPROFILE)?.trim()

  if (home === undefined || home === '') {
    return null
  }

  if (!isInCoworkSessions(home)) {
    return trimSlash(home)
  }

  const prefix = APP_DATA_RE.exec(slashed(home))?.[1]

  if (prefix === undefined) {
    return null
  }

  return home.includes('\\') && !home.includes('/') ? prefix.replace(/\//g, '\\') : prefix
}

/**
 * L'ambiente dei percorsi di un task Cowork sul computer: la `.claude` della
 * CLI (`<home>/.claude`) al posto di quella del task, così radice KPI,
 * opzioni con `~` e settings sono quelli della CLI. `null` se la home non si
 * ricava. Una `CLAUDE_CONFIG_DIR` scelta per la CLI qui non si vede: per
 * quella serve l'opzione `dataDir`.
 */
export function cliPathsOf(env: EnvValues): EnvValues | null {
  const home = realHomeOf(env)

  return home === null ? null : { HOME: home, USERPROFILE: home }
}

/** Il progetto dei task Cowork che non hanno una cartella collegata visibile al plugin. */
export const COWORK_PROJECT = 'Cowork'

/** Le cartelle di lavoro vuote da cui l'app avvia i task Cowork (`/var/empty`, anche risolta su macOS). */
const PLACEHOLDER_CWDS = new Set(['/var/empty', '/private/var/empty'])

/** `true` se la cartella di lavoro di un task non è una cartella dell'utente: vuota, o dentro i dati dell'app. */
export function isPlaceholderCwd(cwd: string | null): boolean {
  if (cwd === null || cwd.trim() === '' || !isAbsolute(cwd)) {
    return true
  }

  return PLACEHOLDER_CWDS.has(trimSlash(slashed(cwd))) || isInCoworkSessions(cwd)
}

/**
 * Il progetto di un task Cowork: la cartella di lavoro se è dell'utente,
 * altrimenti la prima cartella collegata (assoluta e non dell'app),
 * altrimenti il progetto fisso `Cowork`.
 */
export function coworkProjectOf(cwd: string | null, added: readonly unknown[]): string {
  if (!isPlaceholderCwd(cwd)) {
    return trimSlash(cwd as string)
  }

  const folder = added.find((dir): dir is string => typeof dir === 'string' && !isPlaceholderCwd(dir))

  return folder === undefined ? COWORK_PROJECT : trimSlash(folder)
}
