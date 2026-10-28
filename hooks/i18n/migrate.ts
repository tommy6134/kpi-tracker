/**
 * La 0.4.0 parla anche inglese, ed è la lingua di default. Chi aggiorna da una
 * versione precedente (tutta in italiano) senza aver mai scelto la lingua
 * resta in italiano: una volta sola, al primo avvio, se ci sono dati KPI
 * scritti dalla 0.3.0 e l'opzione `language` non è nei settings, la si imposta
 * a `it` da /config (il modulo si ricarica in italiano).
 */

import { decodeEvents } from '../core/events'
import { join, parseSessionDir } from '../core/paths'
import { chunksOf } from '../core/recover'
import type { Host, HostFs } from '../host'
import { loadProjects } from '../query/load'
import { installationOf } from '../update/install'

/**
 * La chiave di `$.store` che segna la migrazione conclusa: italiano impostato,
 * oppure non dovuto (lingua già scelta, nessun dato della 0.3.0, cartella di
 * sviluppo). Dopo un errore resta assente e si riprova all'avvio successivo.
 */
export const LANGUAGE_KEY = 'language-0.4.0'

type PluginConfigs = Record<string, { options?: Record<string, unknown> } | undefined>

/**
 * `true` se la sessione nella cartella `dir` l'ha aperta la 0.3.0: il primo
 * `seg.start` non ha `sw`, che dalla 0.4.0 c'è sempre.
 */
async function openedBy030(fs: HostFs, dir: string): Promise<boolean> {
  const chunks = [...(await chunksOf(fs, dir))].sort(([a], [b]) => Number.parseInt(a.slice(1), 10) - Number.parseInt(b.slice(1), 10))
  const first = chunks[0]?.[1][0]

  if (first === undefined) {
    return false
  }

  const start = decodeEvents(await fs.read(join(dir, 'events', first.name)).catch(() => '')).find(event => event.e === 'seg.start')

  return start !== undefined && start.e === 'seg.start' && start.sw === undefined
}

/** `true` se nella radice c'è almeno una sessione registrata dalla 0.3.0; si ferma alla prima. */
async function hasDataOf030(fs: HostFs, root: string): Promise<boolean> {
  for (const project of await loadProjects(fs, root)) {
    let entries: { name: string; kind: string }[] = []

    try {
      entries = await fs.list(project.dir)
    } catch {
      continue
    }

    for (const entry of entries) {
      if (entry.kind === 'dir' && parseSessionDir(entry.name) !== null && (await openedBy030(fs, join(project.dir, entry.name)))) {
        return true
      }
    }
  }

  return false
}

/**
 * `true` se chi usa il plugin va lasciato in italiano, `null` se non si può
 * dire (settings illeggibili). Contano solo i dati della 0.3.0: quelli scritti
 * dopo (questa sessione, una sessione `-p`) non dicono che chi usa il plugin è
 * abituato all'italiano.
 */
async function keepsItalian(host: Host, root: string): Promise<boolean | null> {
  // Con --plugin-dir (sviluppo) la lingua si sceglie a mano.
  const installation = installationOf(host.pluginRoot)

  if (installation === null) {
    return false
  }

  const configs = (await host.settingsRead('pluginConfigs').catch(() => null)) as PluginConfigs | null | undefined

  if (configs === null) {
    return null
  }

  if (configs?.[`${installation.plugin}@${installation.marketplace}`]?.options?.language !== undefined) {
    return false
  }

  return hasDataOf030(host.fs, root)
}

/** Imposta l'italiano nell'opzione del plugin; `true` se riuscito. */
async function setItalian(host: Host): Promise<boolean> {
  const wanted = `${host.pluginName}.language`
  const keys = await host.configKeys().catch(() => [wanted])
  // La riga si chiama `<plugin>.language`; se il motore la qualifica col marketplace, si prende quella.
  const key = keys.includes(wanted) ? wanted : keys.find(one => one.startsWith(`${host.pluginName}@`) && one.endsWith('.language'))

  if (key === undefined) {
    return false
  }

  const result = await host.configSet(key, 'it').catch(() => ({ deny: 'errore' }))

  return result.deny === undefined
}

/**
 * Lascia in italiano chi aggiorna dalla 0.3.0; `true` se ha impostato la
 * lingua. Il segno si scrive solo a esito definitivo: dopo un errore (settings,
 * /config) si riprova all'avvio successivo. Se la ricarica che segue
 * `config.set` impedisce di scriverlo, all'avvio dopo la lingua risulta scelta
 * e lo si scrive allora.
 */
export async function migrateLanguage(host: Host, root: string): Promise<boolean> {
  if ((await host.storeGet(LANGUAGE_KEY).catch(() => null)) !== undefined) {
    return false
  }

  const keep = await keepsItalian(host, root)

  if (keep === null || (keep && !(await setItalian(host)))) {
    return false
  }

  await host.storeSet(LANGUAGE_KEY, { at: await host.now() }).catch(() => undefined)

  return keep
}
