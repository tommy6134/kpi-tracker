/**
 * Cowork, la modalità agente dell'app desktop: da dove la si riconosce e
 * dove gira. Tutto puro: i valori d'ambiente arrivano da register.ts.
 */

import type { EnvValues } from './paths'

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
