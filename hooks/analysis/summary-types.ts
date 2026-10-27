/**
 * La forma dei KPI aggregati di una sessione (`summary` in session.json) e dei
 * dettagli illimitati (details.json). Il summary si unisce tra sessioni con
 * analysis/merge.ts; i dettagli servono al report di una singola sessione.
 */

import type { BashCat, FileClass, KpiKind } from '../core/events'
import { emptyStat, type Stat } from './stats'

export type Tokens = { in: number; out: number; cr: number; cw: number }

export const emptyTokens = (): Tokens => ({ in: 0, out: 0, cr: 0, cw: 0 })

export type DayAgg = Tokens & {
  cost: number
  turns: number
  active: number
  prompts: number
  req: number
  tools: number
  toolErr: number
  add: number
  del: number
  commits: number
}

export const emptyDay = (): DayAgg => ({ ...emptyTokens(), cost: 0, turns: 0, active: 0, prompts: 0, req: 0, tools: 0, toolErr: 0, add: 0, del: 0, commits: 0 })

/** `deny` comprende le negate dal classificatore; `rej` (rifiutate dall'utente) è assente prima della 0.5.0. */
export type ToolAgg = { n: number; ok: number; err: number; deny: number; intr: number; rej?: number; ro: number; sub: number; ms: Stat; wall: number }

export const emptyToolAgg = (): ToolAgg => ({ n: 0, ok: 0, err: 0, deny: 0, intr: 0, rej: 0, ro: 0, sub: 0, ms: emptyStat(), wall: 0 })

export type OutcomeAgg = { n: number; ok: number; err: number; intr: number; to: number; bg: number; ms: number }

export const emptyOutcome = (): OutcomeAgg => ({ n: 0, ok: 0, err: 0, intr: 0, to: 0, bg: 0, ms: 0 })

export type ModelAgg = Tokens & { req: number }

export type AgentTypeAgg = { n: number; ms: number; tok: number; tools: number; bg: number; err: number }

export type ExtAgg = { n: number; add: number; del: number }

/**
 * Il ledger del costo all'inizio di un segmento: l'ultimo costo letto nel
 * segmento precedente, come è finito, e il costo di partenza di questo.
 */
export type SegLedger = {
  prev: number
  /** Ragione di fine del segmento precedente; `null` se non è finito (processo interrotto). */
  end: string | null
  cost0: number
  sw?: 0 | 1
  /** Il costo tra i due segmenti è già stato contato. */
  gap: boolean
}

/** Lo stato di lavoro del reducer: serve a rigiocare gli eventi in modo deterministico. */
export type ReducerCursor = {
  /** Ultimo costo cumulato visto nel segmento corrente. */
  lastCost: number
  /** Ragione di fine dell'ultimo segmento; `null` mentre un segmento è aperto. Assente nei summary prima della 0.4.0. */
  segEnd?: string | null
  /** Il ledger all'inizio del segmento corrente (assente nel primo). */
  seg?: SegLedger | null
  /** Fine dell'ultimo turno principale (per il tempo di risposta dell'utente). */
  lastTurnEndAt: number | null
  /** Turno principale in corso. */
  turn: { tu: string; start: number; steps: number; tools: number; errs: number } | null
  /** Richieste registrate per turno (anche dei subagent), per sapere se contare i token da turn.end. */
  stepsByTurn: Record<string, number>
  /** Subagent attivi ora (per il massimo concorrente). */
  liveAgents: string[]
  /** Branch corrente. */
  branch: string | null
}

export type KpiSummary = {
  v: 1
  firstAt: number
  lastAt: number
  kind: KpiKind
  segments: number
  /** Somma delle durate dei turni principali. */
  activeMs: number
  byDay: Record<string, DayAgg>
  /** Turni per cella ora × giorno della settimana (168). */
  byHour: number[]
  prompts: {
    n: number
    byOrigin: Record<string, number>
    bySource: Record<string, number>
    queued: number
    chars: Stat
    words: Stat
    lines: Stat
    att: Record<string, number>
    think: Stat
  }
  expansions: Record<string, number>
  mentions: { n: number; byType: Record<string, number> }
  turns: {
    main: number
    sub: number
    dur: Stat
    byReason: Record<string, number>
    refusal: Record<string, number>
    steps: Stat
    tools: Stat
    ans: Stat
  }
  requests: {
    n: number
    byStop: Record<string, number>
    ttft: Stat
    latency: Stat
    tps: Stat
    server: Record<string, { n: number; ms: number }>
    fallback: number
  }
  tokens: Tokens
  tokensSub: Tokens
  byModel: Record<string, ModelAgg>
  effort: Record<string, number>
  /** `outsideTurns`: la parte spesa fuori dai turni (subagent finiti dopo, servizi, uscita); assente prima della 0.4.0. */
  cost: { usd: number; perTurn: Stat; outsideTurns?: number }
  context: { window: number; maxPct: number; lastPct: number; maxTokens: number; pctEnd: Stat }
  compactions: { n: number; byTrigger: Record<string, number>; before: number; after: number; tokens: Tokens }
  rate: Record<string, { max: number; last: number; resetsAt?: string }>
  models: { switches: number; set: Record<string, number> }
  tools: {
    n: number
    byTool: Record<string, ToolAgg>
    sub: number
    batches: Stat
    bg: number
    mcp: Record<string, { n: number; err: number }>
  }
  bash: {
    n: number
    byCat: Record<string, OutcomeAgg>
    byCmd: Record<string, { n: number; ok: number; err: number }>
    pipes: number
    sandboxOff: number
  }
  tests: OutcomeAgg
  builds: OutcomeAgg
  files: {
    add: number
    del: number
    created: number
    edited: number
    written: number
    read: number
    linesRead: number
    unique: number
    uniqueModified: number
    uniqueRead: number
    userModified: number
    outside: number
    churn: number
    byExt: Record<string, ExtAgg>
    byClass: Record<string, ExtAgg>
  }
  git: { commits: number; byKind: Record<string, number>; pushes: number; branchOps: Record<string, number>; prs: Record<string, number>; branches: Record<string, number> }
  /**
   * `denied`: negate dal classificatore (PermissionDenied); `toolDenied`: tool
   * call negate da regola, modalità o hook; `rejected`: rifiutate dall'utente
   * nel dialogo, assente prima della 0.5.0 (prima contavano come interruzioni).
   */
  perms: { byDecision: Record<string, number>; byWho: Record<string, number>; dialogs: number; denied: number; toolDenied: number; rejected?: number }
  agents: { n: number; byType: Record<string, AgentTypeAgg>; byModel: Record<string, number>; workflows: number; maxConcurrent: number; bg: number }
  skills: Record<string, { n: number; ok: number; err: number }>
  commands: Record<string, number>
  web: { fetch: number; domains: Record<string, number>; bytes: number; search: number; errors: number }
  todos: { writes: number; total: number; done: number }
  errors: { api: Record<string, number>; turnErr: number; toolErr: number; interrupts: number; maxTokens: number; refusals: number }
  notif: Record<string, number>
  instr: Record<string, number>
  cwdChanges: number
  tasks: { created: number; completed: number }
  diag: { events: number; reloads: number }
  _r: ReducerCursor
}

export type FileAgg = { r: number; e: number; w: number; add: number; del: number; cr?: 1; ext: string; cls: FileClass; last: number }

export type KpiTurnPoint = {
  i: number
  t: number
  ms: number
  tok: number
  out: number
  tools: number
  err: number
  r: string
  cost: number | null
  pct: number | null
  cpt?: 1
}

export type AgentRec = { id: string; type: string; model?: string; start: number; ms?: number; tok?: number; tools?: number; bg?: 1; fork?: 1; wf?: string; st?: string; end?: number }

export type KpiDetails = {
  v: 1
  files: Record<string, FileAgg>
  turns: KpiTurnPoint[]
  agents: Record<string, AgentRec>
  compactions: { t: number; tr: string; b?: number; af?: number }[]
  commits: { t: number; sha: string; kind: string; branch?: string }[]
  prs: { t: number; n: number; action: string; url?: string }[]
  bashCmds: Record<string, { n: number; ok: number; err: number; cat: BashCat }>
  domains: Record<string, number>
  switches: { t: number; from: string; to: string; src: string }[]
}

export const emptyCursor = (): ReducerCursor => ({ lastCost: 0, segEnd: null, seg: null, lastTurnEndAt: null, turn: null, stepsByTurn: {}, liveAgents: [], branch: null })

export function emptySummary(kind: KpiKind = 'sconosciuta'): KpiSummary {
  return {
    v: 1,
    firstAt: 0,
    lastAt: 0,
    kind,
    segments: 0,
    activeMs: 0,
    byDay: {},
    byHour: new Array<number>(168).fill(0),
    prompts: { n: 0, byOrigin: {}, bySource: {}, queued: 0, chars: emptyStat(), words: emptyStat(), lines: emptyStat(), att: {}, think: emptyStat() },
    expansions: {},
    mentions: { n: 0, byType: {} },
    turns: { main: 0, sub: 0, dur: emptyStat(), byReason: {}, refusal: {}, steps: emptyStat(), tools: emptyStat(), ans: emptyStat() },
    requests: { n: 0, byStop: {}, ttft: emptyStat(), latency: emptyStat(), tps: emptyStat(), server: {}, fallback: 0 },
    tokens: emptyTokens(),
    tokensSub: emptyTokens(),
    byModel: {},
    effort: {},
    cost: { usd: 0, perTurn: emptyStat(), outsideTurns: 0 },
    context: { window: 0, maxPct: 0, lastPct: 0, maxTokens: 0, pctEnd: emptyStat() },
    compactions: { n: 0, byTrigger: {}, before: 0, after: 0, tokens: emptyTokens() },
    rate: {},
    models: { switches: 0, set: {} },
    tools: { n: 0, byTool: {}, sub: 0, batches: emptyStat(), bg: 0, mcp: {} },
    bash: { n: 0, byCat: {}, byCmd: {}, pipes: 0, sandboxOff: 0 },
    tests: emptyOutcome(),
    builds: emptyOutcome(),
    files: {
      add: 0,
      del: 0,
      created: 0,
      edited: 0,
      written: 0,
      read: 0,
      linesRead: 0,
      unique: 0,
      uniqueModified: 0,
      uniqueRead: 0,
      userModified: 0,
      outside: 0,
      churn: 0,
      byExt: {},
      byClass: {},
    },
    git: { commits: 0, byKind: {}, pushes: 0, branchOps: {}, prs: {}, branches: {} },
    perms: { byDecision: {}, byWho: {}, dialogs: 0, denied: 0, toolDenied: 0, rejected: 0 },
    agents: { n: 0, byType: {}, byModel: {}, workflows: 0, maxConcurrent: 0, bg: 0 },
    skills: {},
    commands: {},
    web: { fetch: 0, domains: {}, bytes: 0, search: 0, errors: 0 },
    todos: { writes: 0, total: 0, done: 0 },
    errors: { api: {}, turnErr: 0, toolErr: 0, interrupts: 0, maxTokens: 0, refusals: 0 },
    notif: {},
    instr: {},
    cwdChanges: 0,
    tasks: { created: 0, completed: 0 },
    diag: { events: 0, reloads: 0 },
    _r: emptyCursor(),
  }
}

export function emptyDetails(): KpiDetails {
  return { v: 1, files: {}, turns: [], agents: {}, compactions: [], commits: [], prs: [], bashCmds: {}, domains: {}, switches: [] }
}

/** Totale di token di un record. */
export const totalTokens = (t: Tokens): number => t.in + t.out + t.cr + t.cw

/** Cache hit: letti dalla cache sul totale di input. */
export function cacheHit(t: Tokens): number {
  const input = t.in + t.cr + t.cw

  return input === 0 ? 0 : t.cr / input
}
