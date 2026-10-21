import type { PluginOptions } from 'claude-code'

/** Aggiornamenti: installa da solo, solo avviso, nessun controllo. */
export type UpdateMode = 'auto' | 'avviso' | 'off'

/** Le opzioni del plugin, validate e con i default. */
export type KpiOptions = {
  /** Cartella dati personalizzata ('' = `<configDir>/kpi`). */
  dataDir: string
  /** Cartella di report ed export ('' = `_reports` e `_exports` nella cartella dati). */
  reportDir: string
  /** Agganciare `turn.step` per TTFT, latenza e token per richiesta. */
  streamTiming: boolean
  /** Cosa fare quando nel marketplace c'è una versione nuova. */
  autoUpdate: UpdateMode
  /** Il valore di `autoUpdate` scritto nei settings quando non è valido (e vale `auto`). */
  badAutoUpdate: string | null
}

export const PLUGIN_NAME = 'kpi-tracker'

const UPDATE_MODES: Record<string, UpdateMode> = {
  '': 'auto',
  auto: 'auto',
  on: 'auto',
  si: 'auto',
  sì: 'auto',
  avviso: 'avviso',
  notifica: 'avviso',
  notify: 'avviso',
  off: 'off',
  no: 'off',
}

/** Le opzioni da quanto salvato nei settings, con i default per i valori assenti o di tipo sbagliato. */
export function optionsOf(raw: PluginOptions | undefined): KpiOptions {
  const dataDir = raw?.dataDir
  const reportDir = raw?.reportDir
  const streamTiming = raw?.streamTiming
  const autoUpdate = typeof raw?.autoUpdate === 'string' ? raw.autoUpdate.trim() : ''
  const mode = UPDATE_MODES[autoUpdate.toLowerCase()]

  return {
    dataDir: typeof dataDir === 'string' ? dataDir : '',
    reportDir: typeof reportDir === 'string' ? reportDir : '',
    streamTiming: typeof streamTiming === 'boolean' ? streamTiming : true,
    autoUpdate: mode ?? 'auto',
    badAutoUpdate: mode === undefined ? autoUpdate : null,
  }
}
