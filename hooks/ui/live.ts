/**
 * La vista live della sessione corrente: numeri pronti per barra e pannello,
 * proiettati dal summary in memoria. Puro.
 */

import { meanOf, percentileOf, topOf, totalOf } from '../analysis/stats'
import { cacheHit, totalTokens, type KpiDetails, type KpiSummary, type KpiTurnPoint, type Tokens } from '../analysis/summary-types'
import type { KpiSessionFile } from '../core/session-file'

export type RateView = { pct: number; resetsAt?: string }

export type LiveView = {
  id8: string
  project: string
  branch: string | null
  model: string | null
  kind: string
  startedAt: number
  durationMs: number
  activeMs: number
  segments: number
  version: string
  cost: number
  costPerTurn: number
  tokens: Tokens
  total: number
  input: number
  cacheHit: number
  ctxPct: number | null
  ctxWindow: number
  rate5h: RateView | null
  rate7d: RateView | null
  turns: { n: number; ok: number; aborted: number; errors: number; refusals: number; reqPerTurn: number; durMean: number; durP90: number; ttftMedian: number }
  compactions: { n: number; auto: number; reduction: number | null }
  tools: { n: number; errors: number; top: { name: string; n: number; err: number; msMean: number }[] }
  bash: { cat: string; n: number; ok: number; err: number }[]
  tests: { n: number; ok: number; err: number }
  files: { add: number; del: number; created: number; modified: number; read: number; docs: number; top: { path: string; add: number; del: number }[]; byClass: { cls: string; add: number }[] }
  git: { commits: number; pushes: number; prs: { n: number; action: string }[] }
  /** `denied`: tool call negate da regola, modalità, hook o classificatore; `rejected`: rifiutate dall'utente nel dialogo. */
  perms: { allow: number; ask: number; dialogs: number; denied: number; rejected: number }
  agents: { type: string; n: number; ms: number; tok: number }[]
  errors: { tool: number; api: number; refusals: number; interrupts: number }
  series: KpiTurnPoint[]
}

function rateOf(summary: KpiSummary, kind: string): RateView | null {
  const entry = summary.rate[kind]

  return entry === undefined ? null : { pct: entry.last, ...(entry.resetsAt !== undefined && { resetsAt: entry.resetsAt }) }
}

const sum = (values: Record<string, number>): number => Object.values(values).reduce((a, b) => a + b, 0)

/** La vista live di una sessione aperta. */
export function liveOf(file: KpiSessionFile, details: KpiDetails, now: number): LiveView {
  const s = file.summary
  const lastModel = Object.keys(s.models.set).at(-1) ?? file.meta.models.at(-1) ?? null
  const turnsMain = s.turns.main
  const relPath = (path: string): string => (path.startsWith(`${file.project.path}/`) ? path.slice(file.project.path.length + 1) : path)

  return {
    id8: file.sessionId.slice(0, 8),
    project: file.project.name,
    branch: s._r.branch ?? file.meta.branches.at(-1) ?? null,
    model: lastModel,
    kind: file.kind,
    startedAt: file.createdAt,
    durationMs: Math.max(0, now - file.createdAt),
    activeMs: s.activeMs,
    segments: file.segments.length,
    version: file.segments.at(-1)?.version ?? '',
    cost: s.cost.usd,
    costPerTurn: turnsMain === 0 ? 0 : s.cost.usd / turnsMain,
    tokens: s.tokens,
    total: totalTokens(s.tokens),
    input: s.tokens.in + s.tokens.cr + s.tokens.cw,
    cacheHit: cacheHit(s.tokens),
    ctxPct: s.context.pctEnd.n > 0 || s.context.lastPct > 0 ? s.context.lastPct : null,
    ctxWindow: s.context.window,
    rate5h: rateOf(s, 'five_hour'),
    rate7d: rateOf(s, 'seven_day'),
    turns: {
      n: turnsMain,
      ok: s.turns.byReason.answer ?? 0,
      aborted: s.turns.byReason.aborted ?? 0,
      errors: s.turns.byReason.error ?? 0,
      refusals: s.turns.byReason.refusal ?? 0,
      reqPerTurn: meanOf(s.turns.steps),
      durMean: meanOf(s.turns.dur),
      durP90: percentileOf(s.turns.dur, 0.9),
      ttftMedian: percentileOf(s.requests.ttft, 0.5),
    },
    compactions: {
      n: s.compactions.n,
      auto: s.compactions.byTrigger.auto ?? 0,
      reduction: s.compactions.before > 0 ? 1 - s.compactions.after / s.compactions.before : null,
    },
    tools: {
      n: s.tools.n,
      errors: s.errors.toolErr,
      top: Object.entries(s.tools.byTool)
        .sort((a, b) => b[1].n - a[1].n)
        .slice(0, 8)
        .map(([name, agg]) => ({ name, n: agg.n, err: agg.err, msMean: meanOf(agg.ms) })),
    },
    bash: Object.entries(s.bash.byCat)
      .sort((a, b) => b[1].n - a[1].n)
      .map(([cat, agg]) => ({ cat, n: agg.n, ok: agg.ok, err: agg.err })),
    tests: { n: s.tests.n, ok: s.tests.ok, err: s.tests.err },
    files: {
      add: s.files.add,
      del: s.files.del,
      created: s.files.created,
      modified: s.files.uniqueModified,
      read: s.files.uniqueRead,
      docs: totalOf(s.docs?.created),
      top: Object.entries(details.files)
        .filter(([, file]) => file.add + file.del > 0)
        .sort((a, b) => b[1].add + b[1].del - (a[1].add + a[1].del))
        .slice(0, 5)
        .map(([path, file]) => ({ path: relPath(path), add: file.add, del: file.del })),
      byClass: Object.entries(s.files.byClass)
        .sort((a, b) => b[1].add - a[1].add)
        .map(([cls, agg]) => ({ cls, add: agg.add })),
    },
    git: { commits: s.git.commits, pushes: s.git.pushes, prs: details.prs.slice(-3).map(pr => ({ n: pr.n, action: pr.action })) },
    perms: {
      allow: s.perms.byDecision.allow ?? 0,
      ask: s.perms.byDecision.ask ?? 0,
      dialogs: s.perms.dialogs,
      denied: s.perms.toolDenied + s.perms.denied,
      rejected: s.perms.rejected ?? 0,
    },
    agents: topOf(Object.fromEntries(Object.entries(s.agents.byType).map(([type, agg]) => [type, agg.n])), 6).map(([type]) => {
      const agg = s.agents.byType[type] as { n: number; ms: number; tok: number }

      return { type, n: agg.n, ms: agg.ms, tok: agg.tok }
    }),
    errors: { tool: s.errors.toolErr, api: sum(s.errors.api), refusals: s.errors.refusals, interrupts: s.errors.interrupts },
    series: details.turns.slice(-200),
  }
}
