import type { PluginOptions } from 'claude-code'

import { langOf, type Lang } from './i18n/lang'

/** Aggiornamenti: installa da solo, solo avviso, nessun controllo. */
export type UpdateMode = 'auto' | 'avviso' | 'off'

/** Le opzioni del plugin, validate e con i default. */
export type KpiOptions = {
  /** La lingua di barra, pannello, /kpi, report ed export (`--lingua` la cambia per un comando). */
  language: Lang
  /** Cartella dati personalizzata ('' = `<configDir>/kpi`). */
  dataDir: string
  /** Cartella di report ed export ('' = `_reports` e `_exports` nella cartella dati). */
  reportDir: string
  /** Nome e cognome nel nome dei file di export ('' = `git config user.name`). */
  fullName: string
  /** Il file delle regole delle categorie ('' = `categorie.json` o `categories.json` nella cartella dati). */
  categoriesFile: string
  /** Comandi di build e di test personalizzati, separati da virgole (`./build.sh, npm run package:all`). */
  buildCommands: string
  testCommands: string
  /** Agganciare `turn.step` per TTFT, latenza e token per richiesta. */
  streamTiming: boolean
  /** Cosa fare quando nel marketplace c'è una versione nuova. */
  autoUpdate: UpdateMode
  /** Il valore di `autoUpdate` scritto nei settings quando non è valido (e vale `auto`). */
  badAutoUpdate: string | null
}

export const PLUGIN_NAME = 'kpi-tracker'

/** La lingua di chi installa senza sceglierla (chi aggiorna dalla 0.3.0 con dati resta in italiano, vedi i18n/migrate.ts). */
export const DEFAULT_LANGUAGE: Lang = 'en'

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
  const fullName = raw?.fullName
  const categoriesFile = raw?.categoriesFile
  const buildCommands = raw?.buildCommands
  const testCommands = raw?.testCommands
  const streamTiming = raw?.streamTiming
  const autoUpdate = typeof raw?.autoUpdate === 'string' ? raw.autoUpdate.trim() : ''
  const mode = UPDATE_MODES[autoUpdate.toLowerCase()]

  return {
    language: langOf(raw?.language) ?? DEFAULT_LANGUAGE,
    dataDir: typeof dataDir === 'string' ? dataDir : '',
    reportDir: typeof reportDir === 'string' ? reportDir : '',
    fullName: typeof fullName === 'string' ? fullName.trim() : '',
    categoriesFile: typeof categoriesFile === 'string' ? categoriesFile.trim() : '',
    buildCommands: typeof buildCommands === 'string' ? buildCommands : '',
    testCommands: typeof testCommands === 'string' ? testCommands : '',
    streamTiming: typeof streamTiming === 'boolean' ? streamTiming : true,
    autoUpdate: mode ?? 'auto',
    badAutoUpdate: mode === undefined ? autoUpdate : null,
  }
}

/** Le opzioni che in Cowork si prendono dalla CLI; non `streamTiming`, che conta già quando il modulo si registra. */
const CLI_KEYS = ['language', 'dataDir', 'reportDir', 'fullName', 'categoriesFile', 'buildCommands', 'testCommands'] as const

/**
 * Le opzioni del plugin nei settings della CLI (`pluginConfigs`), `null` se
 * non ci sono. Fra più voci `<plugin>@<origine>` vince quella abilitata in
 * `enabledPlugins`, poi una del marketplace, poi la copia `@synced`.
 */
export function cliOptionsOf(settings: unknown, plugin: string): { key: string; raw: PluginOptions } | null {
  if (typeof settings !== 'object' || settings === null) {
    return null
  }

  const { pluginConfigs, enabledPlugins } = settings as { pluginConfigs?: unknown; enabledPlugins?: unknown }

  if (typeof pluginConfigs !== 'object' || pluginConfigs === null) {
    return null
  }

  const enabled = typeof enabledPlugins === 'object' && enabledPlugins !== null ? (enabledPlugins as Record<string, unknown>) : {}
  const rank = (key: string): number => (enabled[key] === true ? 0 : 1) + (key.endsWith('@synced') ? 2 : 0)
  const entries = Object.entries(pluginConfigs as Record<string, unknown>)
    .filter(([key, value]) => key.startsWith(`${plugin}@`) && typeof value === 'object' && value !== null)
    .map(([key, value]) => ({ key, options: (value as { options?: unknown }).options }))
    .filter((entry): entry is { key: string; options: PluginOptions } => typeof entry.options === 'object' && entry.options !== null)
    .sort((a, b) => rank(a.key) - rank(b.key))
  const best = entries[0]

  return best === undefined ? null : { key: best.key, raw: best.options }
}

/** Le opzioni di Cowork con quelle della CLI dove Cowork ha lasciato il default. */
export function withCliOptions(own: KpiOptions, cli: KpiOptions): KpiOptions {
  const defaults = optionsOf(undefined)
  const out: KpiOptions = { ...own }

  for (const key of CLI_KEYS) {
    if (own[key] === defaults[key]) {
      ;(out as Record<string, unknown>)[key] = cli[key]
    }
  }

  return out
}
