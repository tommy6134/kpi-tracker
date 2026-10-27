/**
 * La 0.4.0 parla anche inglese, ed è la lingua di default. Chi aggiorna da una
 * versione precedente (tutta in italiano) senza aver mai scelto la lingua
 * resta in italiano: una volta sola, al primo avvio, se ci sono già dati KPI
 * e l'opzione `language` non è nei settings, la si imposta a `it` da /config
 * (il modulo si ricarica in italiano).
 */

import type { Host } from '../host'
import { loadProjects } from '../query/load'
import { installationOf } from '../update/install'

/** La chiave di `$.store` che segna il controllo fatto, qualunque sia l'esito. */
export const LANGUAGE_KEY = 'language-0.4.0'

type PluginConfigs = Record<string, { options?: Record<string, unknown> } | undefined>

/**
 * `true` se chi usa il plugin va lasciato in italiano. Va chiesto prima di
 * agganciare la sessione: dopo, i dati di questa sessione sembrerebbero già
 * presenti anche in una installazione nuova.
 */
export async function keepsItalian(host: Host, root: string): Promise<boolean> {
  if ((await host.storeGet(LANGUAGE_KEY).catch(() => null)) !== undefined) {
    return false
  }

  await host.storeSet(LANGUAGE_KEY, { at: await host.now() }).catch(() => undefined)

  // Con --plugin-dir (sviluppo) la lingua si sceglie a mano.
  const installation = installationOf(host.pluginRoot)

  if (installation === null) {
    return false
  }

  const configs = (await host.settingsRead('pluginConfigs').catch(() => null)) as PluginConfigs | null | undefined

  if (configs === null) {
    return false
  }

  if (configs?.[`${installation.plugin}@${installation.marketplace}`]?.options?.language !== undefined) {
    return false
  }

  return (await loadProjects(host.fs, root)).length > 0
}

/** Imposta l'italiano nell'opzione del plugin; `true` se riuscito. */
export async function setItalian(host: Host): Promise<boolean> {
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
