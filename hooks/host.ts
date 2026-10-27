import type {
  CommandSpec,
  FsEntry,
  FsStat,
  PaneCloseArgs,
  PaneOpenArgs,
  ProcessRunResult,
  SessionRepo,
  SessionUsage,
  TimerCall,
} from 'claude-code'

/** Cosa risponde `$.ui.open`: disegnato o tenuto da parte (con il motivo). */
export type OpenResult = { isPlaced: boolean; reason?: string } | void

/** Il filesystem come lo usa il tracker. */
export type HostFs = {
  read: (path: string) => Promise<string>
  write: (path: string, text: string) => Promise<void>
  list: (path: string) => Promise<FsEntry[]>
  exists: (path: string) => Promise<boolean>
  stat: (path: string) => Promise<FsStat>
}

/**
 * Il motore come lo lega register.ts da `$`: ogni hook, timer e pulsante
 * passa da qui, così il resto del modulo è fatto di funzioni pure su
 * un'interfaccia piccola che un test può sostituire.
 */
export type Host = {
  fs: HostFs
  now: () => Promise<number>
  after: TimerCall
  every: TimerCall
  storeGet: (key: string) => Promise<unknown>
  storeSet: (key: string, value: unknown) => Promise<void>
  invalidate: () => void
  log: (text: string) => void
  /** Una riga nel solo log di debug (`claude --debug`), niente a schermo. */
  debug: (text: string) => void
  toast: (text: string, timeoutMs?: number) => void
  openPane: (pane: PaneOpenArgs) => Promise<OpenResult>
  closePane: (pane: PaneCloseArgs) => Promise<void>
  registerCommand: (spec: CommandSpec) => Promise<unknown>
  run: (argv: readonly string[], init?: { cwd?: string; timeoutMs?: number; env?: Record<string, string> }) => Promise<ProcessRunResult>
  bindingGet: () => Promise<{ sessionId: string; at: number } | null>
  bindingSet: (value: { sessionId: string; at: number } | null) => Promise<void>
  sessionId: () => Promise<string>
  sessionRoot: () => Promise<string>
  usage: () => Promise<SessionUsage>
  repo: () => Promise<SessionRepo | null>
  version: () => Promise<{ version: string; base?: string }>
  model: () => Promise<string>
  /** Il valore di una chiave dei settings uniti (`pluginConfigs`…), `undefined` se manca. */
  settingsRead: (key: string) => Promise<unknown>
  /** Le chiavi delle righe di /config (`<plugin>.<campo>` per le opzioni dei plugin). */
  configKeys: () => Promise<string[]>
  /** Cambia una riga di /config; `deny` se rifiutata. */
  configSet: (key: string, value: string) => Promise<{ deny?: string }>
  pluginName: string
  pluginRoot: string
}
