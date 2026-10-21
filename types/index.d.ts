/**
 * Il contratto di kpi-tracker per `$.state`: i valori che restano al
 * ricaricamento del modulo (hot reload) ma non al riavvio del processo.
 */

/** La sessione a cui questo processo è agganciato: distingue un reload da una ripresa. */
export type KpiProcessBinding = { sessionId: string; at: number }

declare module 'claude-code' {
  interface PluginState {
    'kpi-tracker': { binding: KpiProcessBinding | null }
  }
}
