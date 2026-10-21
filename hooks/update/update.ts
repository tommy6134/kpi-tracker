/**
 * Aggiornamenti gestiti dal plugin. Prima di installare una versione nuova si
 * controlla che il Claude Code in uso basti (`compat.json` della release):
 * l'aggiornamento nativo dei marketplace non lo fa, e una versione che usa API
 * assenti nel motore passa la validazione ma si rompe in silenzio. Per questo
 * decide la versione già in esecuzione, che funziona.
 *
 * Flusso: `claude plugin marketplace update <mkt>` aggiorna il clone locale
 * del catalogo; versione e compat della release si leggono dal clone se il
 * catalogo indica il plugin con un percorso (`./`), dal repo git se lo indica
 * con un URL (remote.ts); se la release è più nuova e compatibile,
 * `claude plugin update <plugin>@<mkt>`. La sessione resta sulla versione
 * vecchia fino a /reload-plugins o al riavvio.
 */

import type { UpdateMode } from '../config'
import { join, META_DIR } from '../core/paths'
import { cut, dateTime } from '../format/fmt'
import { table } from '../format/markdown'
import type { Host } from '../host'
import type { Tracker, UpdateNotice } from '../tracker'
import { installationOf, knownMarketplace, releaseAt, sourceOf, type Release } from './install'
import { NO_PROMPT, releaseInRepo } from './remote'
import { compareVersions, engineOf, isVersion } from './semver'

export const UPDATE_KEY = 'update'
/** Attesa dopo l'avvio prima del controllo, per non pesare sull'apertura della sessione. */
export const CHECK_DELAY_MS = 10_000
export const CHECK_EVERY_MS = 24 * 3_600_000
export const RETRY_MS = 3_600_000
/** Quanto un controllo in corso tiene lontane le altre sessioni aperte. */
export const CLAIM_MS = 10 * 60_000
/** Fallimenti consecutivi dopo i quali lo si dice nel transcript. */
export const FAILURES_TO_SHOW = 3
const MARKETPLACE_TIMEOUT_MS = 60_000
const INSTALL_TIMEOUT_MS = 120_000
const TOAST_MS = 10_000
/** Il repo bare, tra i dati KPI, dove si scarica l'ultimo commit di un plugin indicato con un URL. */
export const UPSTREAM_DIR = 'upstream.git'

/** Ciò che resta fra le sessioni, in `$.store` sotto `update`. */
export type UpdateState = {
  /** Prossimo controllo automatico. */
  nextAt: number
  /** Il Claude Code dell'ultimo controllo: se cambia si ricontrolla subito. */
  cc?: string
  /** Fallimenti consecutivi e l'ultimo errore. */
  failures: number
  lastError?: string
  /** Ultimo controllo riuscito e la release trovata nel marketplace. */
  checkedAt?: number
  latest?: Release
  /** Avvisi già dati, `<versione>|<Claude Code>`: della release nuova e della versione in uso. */
  notified?: string
  selfNotified?: string
  /** Avvisi una tantum: auto-update nativo acceso, fallimenti ripetuti. */
  nativeShown?: boolean
  failShown?: boolean
}

/** Cosa fare con la release del marketplace. */
export type Decision = { kind: 'aggiornato' } | { kind: 'bloccato'; minClaudeCode: string } | { kind: 'compatibile' }

/** L'esito di un controllo. */
export type CheckOutcome =
  | { kind: 'cartella' }
  | { kind: 'spento'; why: string }
  | { kind: 'rinviato' }
  | { kind: 'nativo'; marketplace: string }
  | { kind: 'esterno'; why: string }
  | { kind: 'errore'; error: string }
  | { kind: 'aggiornato'; local: string }
  | { kind: 'disponibile'; local: string; remote: Release }
  | { kind: 'bloccato'; local: string; remote: Release; minClaudeCode: string }
  | { kind: 'installato'; local: string; remote: Release }

/** La release del marketplace rispetto alla versione installata e al Claude Code in uso. */
export function decide(local: string, remote: Release, engine: string): Decision {
  if (compareVersions(remote.version, local) <= 0) {
    return { kind: 'aggiornato' }
  }

  if (remote.minClaudeCode !== undefined && compareVersions(engine, remote.minClaudeCode) < 0) {
    return { kind: 'bloccato', minClaudeCode: remote.minClaudeCode }
  }

  return { kind: 'compatibile' }
}

/** `true` se è ora di controllare: passato l'intervallo, o cambiato il Claude Code in uso. */
export function isDue(state: UpdateState, now: number, engine: string): boolean {
  return now >= state.nextAt || (state.cc !== undefined && state.cc !== engine)
}

// --------------------------------------------------------------- avvisi

const UPDATE_ENGINE = 'aggiorna Claude Code con `claude update`'

export function blockedNotice(version: string, min: string, engine: string): UpdateNotice {
  return {
    tone: 'warn',
    band: `⚠ kpi-tracker ${version} richiede Claude Code ≥ ${min} (in uso ${engine}) · claude update`,
    text: `kpi-tracker ${version} è disponibile ma richiede Claude Code ≥ ${min} (in uso ${engine}): ${UPDATE_ENGINE}, poi il plugin si aggiorna da solo.`,
  }
}

export function selfNotice(version: string, min: string, engine: string): UpdateNotice {
  return {
    tone: 'warn',
    band: `⚠ kpi-tracker ${version} richiede Claude Code ≥ ${min} (in uso ${engine}) · claude update`,
    text: `Questa versione di kpi-tracker (${version}) richiede Claude Code ≥ ${min} (in uso ${engine}): alcune metriche potrebbero mancare; ${UPDATE_ENGINE}.`,
  }
}

export function readyNotice(version: string): UpdateNotice {
  return {
    tone: 'info',
    band: `↻ kpi-tracker ${version} installato · /reload-plugins per attivarlo`,
    text: `kpi-tracker ${version} è installato: /reload-plugins o riavvia Claude Code per attivarlo.`,
  }
}

export function availableNotice(version: string): UpdateNotice {
  return {
    tone: 'info',
    band: `kpi-tracker ${version} disponibile · /kpi aggiorna`,
    text: `kpi-tracker ${version} è disponibile: \`/kpi aggiorna\` per installarlo.`,
  }
}

export const nativeText = (marketplace: string): string =>
  `kpi-tracker: l'aggiornamento automatico di Claude Code è acceso per il marketplace ${marketplace} e installa le versioni nuove senza controllare quale Claude Code richiedono. Spegnilo da /plugin → Marketplaces: kpi-tracker si aggiorna da solo, e solo a versioni compatibili.`

const failText = (failures: number, error: string): string =>
  `kpi-tracker: il controllo degli aggiornamenti non riesce da ${failures} tentativi (${error}). Dettagli con /kpi aggiorna.`

/** Toast e riga nel transcript. */
function announce(host: Host, text: string): void {
  host.toast(text, TOAST_MS)
  host.log(text)
}

/** Annuncia `text` una volta per `key`; `quiet` (da /kpi aggiorna, che ha il suo output) lo segna come già detto. */
function once(host: Host, state: UpdateState, key: string, text: string, quiet: boolean): UpdateState {
  if (!quiet && state.notified !== key) {
    announce(host, text)
  }

  return { ...state, notified: key }
}

// ---------------------------------------------------------------- stato

const finite = (value: unknown): number => (typeof value === 'number' && Number.isFinite(value) ? value : 0)

/** Lo stato salvato; vuoto se manca o non si legge. */
export async function loadState(host: Host): Promise<UpdateState> {
  const raw = await host.storeGet(UPDATE_KEY).catch(() => undefined)

  if (typeof raw !== 'object' || raw === null) {
    return { nextAt: 0, failures: 0 }
  }

  const state = raw as Partial<UpdateState>

  return { ...state, nextAt: finite(state.nextAt), failures: finite(state.failures), latest: isVersion(state.latest?.version) ? state.latest : undefined }
}

async function saveState(host: Host, state: UpdateState): Promise<void> {
  await host.storeSet(UPDATE_KEY, state).catch(() => undefined)
}

// ---------------------------------------------------------------- flusso

const firstLine = (text: string): string | undefined =>
  text
    .split('\n')
    .map(line => line.trim())
    .find(line => line !== '')

const errorText = (error: unknown): string => cut(firstLine(error instanceof Error ? error.message : String(error)) ?? 'errore sconosciuto', 200)

/** Lancia la CLI di Claude Code (il binario in uso, altrimenti `claude` dal PATH); rifiuta con la prima riga dell'errore. */
async function claude(tracker: Tracker, host: Host, args: string[], timeoutMs: number): Promise<void> {
  const exec = tracker.env.CLAUDE_CODE_EXECPATH?.trim()
  const result = await host.run([exec === undefined || exec === '' ? 'claude' : exec, ...args], { timeoutMs, env: NO_PROMPT })

  if (result.exitCode !== 0) {
    throw new Error(firstLine(result.stderr) ?? firstLine(result.stdout) ?? `claude ${args.slice(0, 2).join(' ')}: codice di uscita ${result.exitCode}`)
  }
}

/** Il repo bare per i plugin indicati con un URL, tra i dati KPI (`_meta/upstream.git`). */
function upstreamDirOf(tracker: Tracker): string {
  if (tracker.root === null) {
    throw new Error('cartella dati non disponibile')
  }

  return join(tracker.root, META_DIR, UPSTREAM_DIR)
}

/** Avvisi di un controllo: barra e /kpi sempre; toast e transcript una volta per release e Claude Code. */
function report(tracker: Tracker, host: Host, outcome: CheckOutcome, engine: string, state: UpdateState, quiet: boolean): UpdateState {
  let next = state

  if (outcome.kind === 'bloccato') {
    tracker.update.check = blockedNotice(outcome.remote.version, outcome.minClaudeCode, engine)
    next = once(host, state, `${outcome.remote.version}|${engine}`, tracker.update.check.text, quiet)
  } else if (outcome.kind === 'disponibile') {
    tracker.update.check = availableNotice(outcome.remote.version)
    next = once(host, state, `${outcome.remote.version}|${engine}`, tracker.update.check.text, quiet)
  } else if (outcome.kind === 'installato') {
    tracker.update.check = readyNotice(outcome.remote.version)
    tracker.update.installed = outcome.remote.version

    if (!quiet) {
      host.toast(tracker.update.check.text, TOAST_MS)
    }
  } else {
    tracker.update.check = null
  }

  host.invalidate()

  return next
}

/**
 * Un controllo: legge la release nel marketplace e, se `install` e la release
 * è più nuova e compatibile, la installa. `force` (da /kpi aggiorna) salta
 * l'intervallo, l'opzione `off` e il tipo di sessione.
 */
async function runCheck(tracker: Tracker, request: { force: boolean; install: boolean }): Promise<CheckOutcome> {
  const host = tracker.host
  const installation = host === null ? null : installationOf(host.pluginRoot)

  if (host === null || installation === null) {
    return { kind: 'cartella' }
  }

  const { configDir, marketplace, plugin } = installation

  if (!request.force) {
    if (tracker.options.autoUpdate === 'off') {
      return { kind: 'spento', why: 'aggiornamenti spenti dall\'opzione autoUpdate.' }
    }

    // `claude plugin …` passa da $.process.run, che c'è solo nella CLI.
    if (tracker.interactive !== true || tracker.surface === 'desktop') {
      return { kind: 'spento', why: 'controllo automatico solo nelle sessioni interattive della CLI.' }
    }
  }

  const now = await host.now()
  const engine = engineOf(await host.version())
  let state = await loadState(host)

  if (!request.force && !isDue(state, now, engine)) {
    return { kind: 'rinviato' }
  }

  const known = await knownMarketplace(host.fs, configDir, marketplace)

  if (known?.autoUpdate === true) {
    if (state.nativeShown !== true && !request.force) {
      announce(host, nativeText(marketplace))
    }

    tracker.update.check = null
    await saveState(host, { ...state, nativeShown: true, nextAt: now + CHECK_EVERY_MS, cc: engine })

    return { kind: 'nativo', marketplace }
  }

  // Prenota il controllo: le altre sessioni aperte non lo ripetono.
  state = { ...state, nextAt: now + CLAIM_MS, cc: engine }
  await saveState(host, state)

  try {
    if (known === null) {
      throw new Error(`marketplace ${marketplace} assente da known_marketplaces.json`)
    }

    const local = await releaseAt(host.fs, host.pluginRoot)

    if (local === null) {
      throw new Error('versione installata illeggibile')
    }

    await claude(tracker, host, ['plugin', 'marketplace', 'update', marketplace], MARKETPLACE_TIMEOUT_MS)

    const source = await sourceOf(host.fs, known.installLocation, plugin)

    if (source === null) {
      throw new Error(`il marketplace ${marketplace} non elenca ${plugin}`)
    }

    // Commit fissato o fonte che non è un repo git: le versioni le decide il marketplace, non è un errore.
    const pinned = source.kind === 'git' ? source.sha : undefined

    if (source.kind === 'altro' || pinned !== undefined) {
      const why =
        pinned !== undefined
          ? `il marketplace ${marketplace} fissa ${plugin} al commit ${pinned.slice(0, 12)}: le versioni le decide chi gestisce il marketplace.`
          : `il marketplace ${marketplace} indica ${plugin} con una ${source.kind === 'altro' ? source.what : 'fonte non supportata'}: aggiornalo con \`claude plugin update ${plugin}@${marketplace}\`.`

      tracker.update.check = null
      host.invalidate()
      await saveState(host, { ...state, nextAt: now + CHECK_EVERY_MS, failures: 0, lastError: undefined, failShown: false, checkedAt: now, latest: undefined })

      return { kind: 'esterno', why }
    }

    const remote = source.kind === 'locale' ? await releaseAt(host.fs, source.dir) : await releaseInRepo(host, upstreamDirOf(tracker), source)

    if (remote === null) {
      throw new Error(`release di ${plugin} illeggibile nel marketplace ${marketplace}`)
    }

    const decision = decide(local.version, remote, engine)
    let outcome: CheckOutcome

    if (decision.kind === 'aggiornato') {
      outcome = { kind: 'aggiornato', local: local.version }
    } else if (decision.kind === 'bloccato') {
      outcome = { kind: 'bloccato', local: local.version, remote, minClaudeCode: decision.minClaudeCode }
    } else if (!request.install) {
      outcome = { kind: 'disponibile', local: local.version, remote }
    } else {
      if (tracker.update.installed !== remote.version) {
        await claude(tracker, host, ['plugin', 'update', `${plugin}@${marketplace}`], INSTALL_TIMEOUT_MS)
      }

      outcome = { kind: 'installato', local: local.version, remote }
    }

    state = { ...state, nextAt: now + CHECK_EVERY_MS, failures: 0, lastError: undefined, failShown: false, checkedAt: now, latest: remote }
    await saveState(host, report(tracker, host, outcome, engine, state, request.force))

    return outcome
  } catch (error) {
    const message = errorText(error)
    const failures = state.failures + 1
    const show = failures >= FAILURES_TO_SHOW && state.failShown !== true && !request.force

    host.debug(`aggiornamenti: ${message}`)

    if (show) {
      host.log(failText(failures, message))
    }

    await saveState(host, { ...state, nextAt: now + RETRY_MS, failures, lastError: message, failShown: state.failShown === true || show })

    return { kind: 'errore', error: message }
  }
}

/** Un controllo, in coda agli altri di questo processo; non rifiuta mai. */
export function checkForUpdates(tracker: Tracker, request: { force: boolean; install: boolean }): Promise<CheckOutcome> {
  const run = tracker.update.queue.then(() => runCheck(tracker, request)).catch((error: unknown) => ({ kind: 'errore', error: errorText(error) }) as CheckOutcome)

  tracker.update.queue = run

  return run
}

/**
 * All'avvio: avvisa se questa versione vuole un Claude Code più recente,
 * ripropone l'avviso di una release già vista e programma il controllo.
 */
export async function startUpdates(tracker: Tracker): Promise<void> {
  const host = tracker.host

  if (host === null) {
    return
  }

  const engine = engineOf(await host.version())
  const local = await releaseAt(host.fs, host.pluginRoot)
  let state = await loadState(host)
  const before = state

  if (local?.minClaudeCode !== undefined && compareVersions(engine, local.minClaudeCode) < 0) {
    tracker.update.self = selfNotice(local.version, local.minClaudeCode, engine)

    const key = `${local.version}|${engine}`

    if (state.selfNotified !== key) {
      announce(host, tracker.update.self.text)
      state = { ...state, selfNotified: key }
    }
  } else {
    tracker.update.self = null
  }

  const latest = state.latest
  const decision = local === null || latest === undefined ? null : decide(local.version, latest, engine)

  if (latest !== undefined && decision?.kind === 'bloccato') {
    tracker.update.check = blockedNotice(latest.version, decision.minClaudeCode, engine)
  } else if (latest !== undefined && decision?.kind === 'compatibile' && tracker.options.autoUpdate === 'avviso') {
    tracker.update.check = availableNotice(latest.version)
  }

  if (state !== before) {
    await saveState(host, state)
  }

  host.invalidate()
  tracker.timers.update?.cancel()
  tracker.timers.update = host.after(CHECK_DELAY_MS, () => {
    tracker.timers.update = undefined
    void checkForUpdates(tracker, { force: false, install: tracker.options.autoUpdate === 'auto' }).then(outcome => {
      host.debug(`aggiornamenti: ${outcome.kind}`)
    })
  })
}

// -------------------------------------------------------- /kpi aggiorna

const MODE_LABELS: Record<UpdateMode, string> = {
  auto: 'auto: installa da solo le versioni compatibili',
  avviso: 'avviso: segnala le versioni nuove, si installano con `/kpi aggiorna`',
  off: 'off: nessun controllo automatico',
}

const releaseLabel = (release: Release | null | undefined): string =>
  release === null || release === undefined ? '–' : `${release.version}${release.minClaudeCode !== undefined ? ` (richiede Claude Code ≥ ${release.minClaudeCode})` : ''}`

function outcomeText(outcome: CheckOutcome, engine: string): string {
  switch (outcome.kind) {
    case 'cartella':
      return 'kpi-tracker è caricato da una cartella (`--plugin-dir`), non da un marketplace: gli aggiornamenti automatici sono disattivati.'
    case 'spento':
      return outcome.why
    case 'rinviato':
      return 'il prossimo controllo è più tardi.'
    case 'nativo':
      return nativeText(outcome.marketplace)
    case 'esterno':
      return outcome.why
    case 'errore':
      return `controllo non riuscito: ${outcome.error.replace(/\.$/, '')}.`
    case 'aggiornato':
      return `kpi-tracker ${outcome.local} è l'ultima versione.`
    case 'disponibile':
      return availableNotice(outcome.remote.version).text
    case 'bloccato':
      return blockedNotice(outcome.remote.version, outcome.minClaudeCode, engine).text
    case 'installato':
      return readyNotice(outcome.remote.version).text
  }
}

/** Il testo di `/kpi aggiorna`: versioni, opzione, ultimo controllo ed esito. */
export async function updateReport(tracker: Tracker, host: Host, outcome: CheckOutcome): Promise<string> {
  const engine = engineOf(await host.version())
  const local = await releaseAt(host.fs, host.pluginRoot)
  const state = await loadState(host)
  const bad = tracker.options.badAutoUpdate
  const rows: [string, string][] = [
    ['Versione installata', releaseLabel(local)],
    ['Ultima nel marketplace', releaseLabel(state.latest)],
    ['Claude Code in uso', engine],
    ['Aggiornamento automatico', `${MODE_LABELS[tracker.options.autoUpdate]}${bad !== null ? ` (valore "${bad}" dell'opzione autoUpdate non valido)` : ''}`],
    ['Ultimo controllo', state.checkedAt === undefined ? '–' : dateTime(state.checkedAt)],
    ...(state.lastError !== undefined ? [['Ultimo errore', state.lastError] as [string, string]] : []),
  ]
  const self = tracker.update.self

  return [
    '## kpi-tracker · aggiornamenti',
    ...(self !== null ? [`> ⚠ ${self.text}`] : []),
    table(['Voce', 'Valore'], rows),
    `**Esito:** ${outcomeText(outcome, engine)}`,
  ].join('\n\n')
}
