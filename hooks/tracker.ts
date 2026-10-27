/**
 * Il tracker: lo stato del modulo e la logica che trasforma gli hook in
 * eventi KPI. Non tocca `$`: riceve un Host da register.ts.
 *
 * Ciclo di vita
 * - `session.start` (ogni caricamento del modulo) e `classic.SessionStart`
 *   (avvio, ripresa, /clear, fork) agganciano la sessione con `attach`, che è
 *   serializzato e idempotente per id di sessione.
 * - Gli eventi che arrivano prima che la sessione sia aperta vanno in una coda
 *   e si registrano appena lo store esiste.
 * - `session.end` chiude il segmento e salva entro il limite di 1,5 s.
 */

import type { KpiOptions } from './config'
import { closeSegment, openSession } from './core/binding'
import type { KpiEventBody, KpiKind, ResumeInfo } from './core/events'
import { kpiRootOf, type EnvValues } from './core/paths'
import type { KpiRepo } from './core/session-file'
import type { SessionStore } from './core/writer'
import type { Host } from './host'

export type TrackerEnv = EnvValues & { CLAUDE_CODE_ENTRYPOINT?: string | undefined; CLAUDE_CODE_EXECPATH?: string | undefined }

type Early = { body: KpiEventBody; t: number; a?: string }

/** Un avviso sugli aggiornamenti: la riga della barra e la frase per /kpi. */
export type UpdateNotice = { tone: 'warn' | 'info'; band: string; text: string }

export type Tracker = {
  options: KpiOptions
  host: Host | null
  env: TrackerEnv
  root: string | null
  launchCwd: string | null
  interactive: boolean | null
  surface: string | null
  store: SessionStore | null
  /** Coda di attach: un aggancio alla volta. */
  attaching: Promise<void>
  /** L'id della sessione che si sta aprendo (per non aprirla due volte). */
  openingId: string | null
  early: Early[]
  /** Fine dell'ultimo turno principale. */
  lastTurnEnd: number | null
  /** Un turno principale è in corso (le letture del ledger aspettano la sua fine). */
  turnOpen: boolean
  /** L'ultimo costo cumulato registrato, per leggere il ledger fuori dai turni. */
  lastCost: number | null
  /** Richieste registrate per turno. */
  stepsByTurn: Map<string, number>
  /** Durate da PostToolUse arrivate prima dell'evento tool. */
  toolMs: Map<string, { ms: number; intr: boolean }>
  /** Tool già registrati in attesa della durata (id → nome). */
  toolsAwaitingMs: Map<string, string>
  /** Ultimo id di sessione chiusa (per il collegamento dopo /clear). */
  lastClosedId: string | null
  timers: { flush?: { cancel: () => void }; heartbeat?: { cancel: () => void }; debounce?: { cancel: () => void }; update?: { cancel: () => void } }
  branch: string | null
  ui: { bandHidden: boolean; bandDisabled: boolean; paneOpen: boolean; reports: Map<string, string>; reportSeq: number }
  /**
   * Aggiornamenti: `self` se questa versione vuole un Claude Code più recente,
   * `check` l'esito dell'ultimo controllo (bloccato, disponibile, installato),
   * `installed` la versione installata in questa sessione, `queue` un controllo alla volta.
   */
  update: { self: UpdateNotice | null; check: UpdateNotice | null; installed: string | null; queue: Promise<unknown> }
  diag: { attachErrors: number; lastError?: string }
}

export const EARLY_MAX = 5000
export const FLUSH_EVERY_MS = 5000
export const HEARTBEAT_MS = 60_000

export function newTracker(options: KpiOptions): Tracker {
  return {
    options,
    host: null,
    env: {},
    root: null,
    launchCwd: null,
    interactive: null,
    surface: null,
    store: null,
    attaching: Promise.resolve(),
    openingId: null,
    early: [],
    lastTurnEnd: null,
    turnOpen: false,
    lastCost: null,
    stepsByTurn: new Map(),
    toolMs: new Map(),
    toolsAwaitingMs: new Map(),
    lastClosedId: null,
    timers: {},
    branch: null,
    ui: { bandHidden: false, bandDisabled: false, paneOpen: false, reports: new Map(), reportSeq: 0 },
    update: { self: null, check: null, installed: null, queue: Promise.resolve() },
    diag: { attachErrors: 0 },
  }
}

/** L'avviso da mostrare: prima quello sulla versione in uso, poi l'esito del controllo. */
export const noticeOf = (tracker: Tracker): UpdateNotice | null => tracker.update.self ?? tracker.update.check

/** Il tipo di sessione dai segnali disponibili. */
export function kindOf(interactive: boolean | null, surface: string | null, entrypoint?: string): KpiKind {
  if (surface === 'desktop') {
    return 'desktop'
  }

  if (surface === 'vscode') {
    return 'vscode'
  }

  if (interactive === true) {
    return 'interattiva'
  }

  // `claude -p` dichiara `sdk-cli`; l'Agent SDK `sdk-ts` / `sdk-py`.
  if (entrypoint !== undefined && /^sdk/i.test(entrypoint) && !/^sdk-cli$/i.test(entrypoint)) {
    return 'sdk'
  }

  return interactive === false ? 'print' : 'sconosciuta'
}

const nowMs = (): number => Date.now()

/** Registra un evento: nello store se c'è, altrimenti in coda. */
export function record(tracker: Tracker, body: KpiEventBody, agentId?: string, t: number = nowMs()): void {
  const store = tracker.store

  if (body.e === 'measure' && body.cost !== undefined) {
    tracker.lastCost = body.cost
  }

  if (store !== null && tracker.openingId === null) {
    store.emit(body, t, agentId)

    return
  }

  if (tracker.early.length < EARLY_MAX) {
    tracker.early.push({ body, t, ...(agentId !== undefined && { a: agentId }) })
  }

  ensureAttached(tracker)
}

/** Se non c'è una sessione aperta né in apertura, ne avvia l'aggancio con l'id corrente. */
export function ensureAttached(tracker: Tracker): void {
  const host = tracker.host

  if (host === null || tracker.store !== null || tracker.openingId !== null) {
    return
  }

  void host
    .sessionId()
    .then(id => attach(tracker, id, 'sconosciuta'))
    .catch(() => undefined)
}

/** Il branch git corrente della cartella di avvio, o `null`. */
export async function readBranch(host: Host, cwd: string | null): Promise<string | null> {
  try {
    const result = await host.run(['git', 'rev-parse', '--abbrev-ref', 'HEAD'], { ...(cwd !== null && { cwd }), timeoutMs: 3000 })
    const branch = result.exitCode === 0 ? result.stdout.trim() : ''

    return branch === '' ? null : branch === 'HEAD' ? '(detached)' : branch.slice(0, 200)
  } catch {
    return null
  }
}

export type AttachExtra = {
  resume?: ResumeInfo
  model?: string
  permissionMode?: string
  previousSessionId?: string
}

/**
 * Aggancia la sessione `sessionId`. Se è già quella aperta, al più affina la
 * sorgente del segmento. Altrimenti chiude la precedente e apre questa.
 */
export function attach(tracker: Tracker, sessionId: string, source: string, extra: AttachExtra = {}): Promise<void> {
  const run = async () => {
    const host = tracker.host

    if (host === null || tracker.root === null) {
      return
    }

    const current = tracker.store

    if (current !== null && current.file.sessionId === sessionId) {
      refineSource(tracker, current, source, extra)

      return
    }

    tracker.openingId = sessionId

    try {
      if (current !== null) {
        closeSegment(current, nowMs(), 'cambio sessione', false)
        await current.flush(nowMs())
      }

      const [usage, version, model, repo, binding] = await Promise.all([
        host.usage().catch(() => null),
        host.version().catch(() => ({ version: 'sconosciuta' })),
        host.model().catch(() => undefined),
        host.repo().catch(() => null),
        host.bindingGet().catch(() => null),
      ])

      if (tracker.launchCwd === null) {
        tracker.launchCwd = await host.sessionRoot().catch(() => null)
      }

      const launchCwd = tracker.launchCwd ?? '/'
      const branch = await readBranch(host, launchCwd)
      // Un reload rifà session.start ma non classic.SessionStart: solo un avvio 'startup' può esserlo.
      const isReload = (source === 'startup' || source === 'sconosciuta') && binding !== null && binding.sessionId === sessionId && current === null
      const effectiveSource = isReload ? 'ricarica' : source
      const kpiRepo: KpiRepo | null = repo === null ? null : { root: repo.root, remote: repo.remote, name: repo.name }
      const previous = extra.previousSessionId ?? (source === 'clear' ? (current?.file.sessionId ?? tracker.lastClosedId ?? undefined) : undefined)
      const costNow = usage?.cost?.usd ?? 0

      const store = await openSession(host.fs, {
        root: tracker.root,
        launchCwd,
        sessionId,
        now: nowMs(),
        ...(usage !== null && usage.startedAt > 0 && { startedAt: usage.startedAt }),
        kind: kindOf(tracker.interactive, tracker.surface, tracker.env.CLAUDE_CODE_ENTRYPOINT),
        interactive: tracker.interactive === true,
        source: effectiveSource,
        version,
        ...((extra.model ?? model) !== undefined && { model: extra.model ?? model }),
        ...(extra.permissionMode !== undefined && { permissionMode: extra.permissionMode }),
        costNow,
        switched: current !== null || tracker.lastClosedId !== null,
        repo: kpiRepo,
        branch,
        ...(previous !== undefined && { previousSessionId: previous }),
        ...(extra.resume !== undefined && { resume: extra.resume }),
      })

      tracker.branch = branch
      tracker.store = store
      tracker.openingId = null
      tracker.lastTurnEnd = null
      tracker.lastCost = usage?.cost === undefined ? null : costNow

      if (current !== null && previous === current.file.sessionId) {
        current.file.links.nextSessionId = sessionId
        current.touch()
        void current.flush(nowMs())
      }

      for (const item of tracker.early.splice(0)) {
        // Un costo letto prima dell'aggancio è già nella base del segmento: dopo `seg.start` sembrerebbe un azzeramento.
        const body = item.body.e === 'measure' && item.body.cost !== undefined && item.body.cost <= costNow ? withoutCost(item.body) : item.body

        if (body.e === 'measure' && body.cost !== undefined) {
          tracker.lastCost = Math.max(tracker.lastCost ?? 0, body.cost)
        }

        store.emit(body, item.t, item.a)
      }

      await host.bindingSet({ sessionId, at: nowMs() }).catch(() => undefined)
      await store.flush(nowMs())
      host.invalidate()
    } catch (error) {
      tracker.diag.attachErrors += 1
      tracker.diag.lastError = error instanceof Error ? error.message : String(error)
      tracker.openingId = null
    }
  }

  tracker.attaching = tracker.attaching.then(run, run)

  return tracker.attaching
}

/** Su una sessione già aperta, `classic.SessionStart` precisa la sorgente del segmento. */
function refineSource(tracker: Tracker, store: SessionStore, source: string, extra: AttachExtra): void {
  if (source === 'sconosciuta' || source === store.segment.source) {
    return
  }

  // Un reload resta tale: classic.SessionStart non scatta su un reload.
  if (store.segment.source === 'ricarica' && source === 'startup') {
    return
  }

  store.segment.source = source
  store.emit({ e: 'seg.src', src: source, ...(extra.model !== undefined && { model: extra.model }), ...(extra.resume !== undefined && { resume: extra.resume }) }, nowMs())
  store.touch()
  tracker.host?.invalidate()
}

/** Imposta la radice dei dati dalle variabili d'ambiente e dall'opzione. */
export function setRoot(tracker: Tracker, env: TrackerEnv): void {
  tracker.env = env
  tracker.root = kpiRootOf(env, tracker.options.dataDir)
}

/** Salva subito quanto in attesa. */
export async function flushNow(tracker: Tracker): Promise<void> {
  await tracker.attaching.catch(() => undefined)

  const store = tracker.store

  if (store !== null) {
    await store.flush(nowMs())
  }
}

/** Una misurazione senza costo (le altre letture restano). */
function withoutCost(body: Extract<KpiEventBody, { e: 'measure' }>): KpiEventBody {
  const copy = { ...body }

  delete copy.cost

  return copy
}

/** Una lettura del ledger fuori dai turni, se il costo è cresciuto dall'ultima registrata. */
async function ledgerReading(host: Host, last: number | null): Promise<KpiEventBody | null> {
  const usd = (await host.usage().catch(() => null))?.cost?.usd

  return usd === undefined || last === null || usd <= last ? null : { e: 'measure', p: 1, cost: usd }
}

/**
 * Legge il ledger del costo fuori da un turno: `session.measure` scatta solo a
 * fine turno, quindi i subagent che finiscono dopo, le chiamate di servizio e
 * l'ultimo tratto prima dell'uscita non arriverebbero mai. Durante un turno
 * non legge: ci pensa la misurazione di fine turno.
 */
export async function pollCost(tracker: Tracker): Promise<void> {
  const host = tracker.host
  const store = tracker.store

  if (host === null || store === null || tracker.openingId !== null || tracker.turnOpen) {
    return
  }

  emitReading(tracker, store, await ledgerReading(host, tracker.lastCost))
}

/** Registra la lettura nello store da cui è partita, se è ancora quello aperto. */
function emitReading(tracker: Tracker, store: SessionStore, body: KpiEventBody | null): void {
  if (body === null || tracker.store !== store || tracker.openingId !== null) {
    return
  }

  record(tracker, body)
}

/** Flush posticipato di poco: accorpa la fine del turno e la misurazione che la segue. */
export function scheduleFlush(tracker: Tracker, delayMs = 250): void {
  const host = tracker.host

  if (host === null || tracker.timers.debounce !== undefined) {
    return
  }

  tracker.timers.debounce = host.after(delayMs, () => {
    tracker.timers.debounce = undefined
    void flushNow(tracker)
  })
}

/** Avvia (o riavvia dopo un reload) i timer di flush periodico e heartbeat. */
export function startTimers(tracker: Tracker): void {
  const host = tracker.host

  if (host === null) {
    return
  }

  tracker.timers.flush?.cancel()
  tracker.timers.heartbeat?.cancel()
  tracker.timers.flush = host.every(FLUSH_EVERY_MS, () => {
    if (tracker.store?.isDirty() === true) {
      void flushNow(tracker)
    }
  })
  tracker.timers.heartbeat = host.every(HEARTBEAT_MS, () => {
    tracker.store?.touch()
    void pollCost(tracker)
      .catch(() => undefined)
      .then(() => flushNow(tracker))
  })
}

/** Chiude la sessione corrente (session.end) e salva entro `budgetMs`. */
export async function endSession(tracker: Tracker, reason: string, budgetMs: number): Promise<void> {
  const host = tracker.host

  if (host === null) {
    return
  }

  await Promise.race([tracker.attaching.catch(() => undefined), sleep(host, Math.min(300, budgetMs))])

  const store = tracker.store

  if (store === null) {
    return
  }

  // L'ultima lettura del ledger: quanto speso dopo l'ultimo turno. Non con clear e resume,
  // dove il ledger può già essere quello della sessione che segue.
  if (reason !== 'clear' && reason !== 'resume') {
    emitReading(tracker, store, await Promise.race([ledgerReading(host, tracker.lastCost), sleep(host, Math.min(200, budgetMs / 4)).then(() => null)]))
  }

  // Anche con clear e resume la conversazione finisce: il processo prosegue con un'altra sessione,
  // e se questa viene ripresa più tardi l'aggancio la rimette attiva.
  closeSegment(store, nowMs(), reason, true)
  tracker.lastClosedId = store.file.sessionId
  tracker.store = null
  tracker.lastTurnEnd = null
  tracker.turnOpen = false
  tracker.lastCost = null
  tracker.stepsByTurn.clear()
  tracker.toolMs.clear()
  tracker.toolsAwaitingMs.clear()
  void host.bindingSet(null).catch(() => undefined)

  await Promise.race([store.flush(nowMs()), sleep(host, Math.max(100, budgetMs - 100))])
}

function sleep(host: Host, ms: number): Promise<void> {
  return new Promise(resolve => {
    host.after(ms, resolve)
  })
}

/** Aggiorna il branch dopo un comando git che può averlo cambiato. */
export function refreshBranch(tracker: Tracker): void {
  const host = tracker.host

  if (host === null) {
    return
  }

  void readBranch(host, tracker.launchCwd).then(branch => {
    if (branch !== null && branch !== tracker.branch) {
      tracker.branch = branch
      record(tracker, { e: 'meta', branch })

      const store = tracker.store

      if (store !== null && !store.file.meta.branches.includes(branch)) {
        store.file.meta.branches.push(branch)
        store.touch()
      }
    }
  })
}

/** Registra la durata di una tool call, appena sono noti sia l'evento tool sia la durata. */
export function noteToolMs(tracker: Tracker, id: string, ms: number, intr: boolean, agentId?: string): void {
  const tool = tracker.toolsAwaitingMs.get(id)

  if (tool !== undefined) {
    tracker.toolsAwaitingMs.delete(id)
    record(tracker, { e: 'tool.ms', id, tool, ms: Math.round(ms), ...(intr && { intr: 1 as const }) }, agentId)

    return
  }

  tracker.toolMs.set(id, { ms, intr })

  if (tracker.toolMs.size > 500) {
    const first = tracker.toolMs.keys().next().value

    if (first !== undefined) {
      tracker.toolMs.delete(first)
    }
  }
}

/** Dopo l'evento tool: la durata se è già arrivata, altrimenti si attende. */
export function awaitToolMs(tracker: Tracker, id: string, tool: string, agentId?: string): void {
  if (id === '') {
    return
  }

  const known = tracker.toolMs.get(id)

  if (known !== undefined) {
    tracker.toolMs.delete(id)
    record(tracker, { e: 'tool.ms', id, tool, ms: Math.round(known.ms), ...(known.intr && { intr: 1 as const }) }, agentId)

    return
  }

  tracker.toolsAwaitingMs.set(id, tool)

  if (tracker.toolsAwaitingMs.size > 500) {
    const first = tracker.toolsAwaitingMs.keys().next().value

    if (first !== undefined) {
      tracker.toolsAwaitingMs.delete(first)
    }
  }
}
