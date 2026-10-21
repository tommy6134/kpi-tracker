import type { PluginOptions } from 'claude-code'

/** Le opzioni del plugin, validate e con i default. */
export type KpiOptions = {
  /** Cartella dati personalizzata ('' = `<configDir>/kpi`). */
  dataDir: string
  /** Cartella di report ed export ('' = `_reports` e `_exports` nella cartella dati). */
  reportDir: string
  /** Agganciare `turn.step` per TTFT, latenza e token per richiesta. */
  streamTiming: boolean
}

export const PLUGIN_NAME = 'kpi-tracker'

/** Le opzioni da quanto salvato nei settings, con i default per i valori assenti o di tipo sbagliato. */
export function optionsOf(raw: PluginOptions | undefined): KpiOptions {
  const dataDir = raw?.dataDir
  const reportDir = raw?.reportDir
  const streamTiming = raw?.streamTiming

  return {
    dataDir: typeof dataDir === 'string' ? dataDir : '',
    reportDir: typeof reportDir === 'string' ? reportDir : '',
    streamTiming: typeof streamTiming === 'boolean' ? streamTiming : true,
  }
}
