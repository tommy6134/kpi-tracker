/**
 * Il fold puro e deterministico: `apply(state, event)` aggiorna summary e
 * dettagli di una sessione. Rigiocare gli stessi eventi dà sempre lo stesso
 * risultato, così il summary si ricostruisce dai chunk in qualsiasi momento.
 */

import type { KpiEvent } from '../core/events'
import { dayKey, hourSlot } from '../core/time'
import { categoryOfLabels } from './bash-classify'
import { classOf } from './lines'
import { addStat, bump } from './stats'
import {
  emptyDay,
  emptyOutcome,
  emptyToolAgg,
  totalTokens,
  type DayAgg,
  type KpiDetails,
  type KpiSummary,
  type OutcomeAgg,
  type SegLedger,
  type Tokens,
} from './summary-types'

/** Limiti per tenere session.json e details.json piccoli. */
export const LIMITS = { cmds: 100, domains: 100, files: 5000, turns: 2000, compactions: 200, commits: 500, prs: 200, switches: 200, agents: 500, mcp: 50, skills: 100, commands: 100 }

export type ReduceState = { summary: KpiSummary; details: KpiDetails; tz?: number }

const tokensOf = (e: { in?: number; out?: number; cr?: number; cw?: number }): Tokens => ({
  in: e.in ?? 0,
  out: e.out ?? 0,
  cr: e.cr ?? 0,
  cw: e.cw ?? 0,
})

function addTokens(into: Tokens, from: Tokens): void {
  into.in += from.in
  into.out += from.out
  into.cr += from.cr
  into.cw += from.cw
}

function dayOf(state: ReduceState, t: number): DayAgg {
  const key = dayKey(t, state.tz)
  const days = state.summary.byDay

  days[key] ??= emptyDay()

  return days[key]
}

function outcome(map: Record<string, OutcomeAgg>, key: string): OutcomeAgg {
  map[key] ??= emptyOutcome()

  return map[key]
}

/** Attribuisce un consumo di token alla sessione, al modello, al giorno e al subagent. */
function countTokens(state: ReduceState, t: number, model: string | undefined, tokens: Tokens, agentId: string | undefined): void {
  const s = state.summary

  addTokens(s.tokens, tokens)
  addTokens(dayOf(state, t), tokens)

  if (agentId !== undefined) {
    addTokens(s.tokensSub, tokens)

    const agent = state.details.agents[agentId]

    if (agent !== undefined) {
      agent.tok = (agent.tok ?? 0) + totalTokens(tokens)

      const type = s.agents.byType[agent.type]

      if (type !== undefined) {
        type.tok += totalTokens(tokens)
      }
    }
  }

  if (model !== undefined && model !== '') {
    const entry = (s.byModel[model] ??= { in: 0, out: 0, cr: 0, cw: 0, req: 0 })

    addTokens(entry, tokens)
  }
}

/** Costo speso fuori da un turno: va alla sessione e al giorno, non a un turno. */
function countOutsideTurns(state: ReduceState, t: number, usd: number): void {
  const cost = state.summary.cost

  cost.usd += usd
  cost.outsideTurns = (cost.outsideTurns ?? 0) + usd
  dayOf(state, t).cost += usd
}

/** Fine di segmento dopo cui il processo è andato avanti con un'altra sessione. */
const SWITCH_ENDS = new Set(['cambio sessione', 'resume', 'clear'])

/**
 * Il costo tra l'ultima lettura del segmento precedente e l'inizio di questo:
 * il ledger di Claude Code lo ha, ma `session.measure` scatta solo a fine
 * turno (subagent finiti dopo, chiamate di servizio, uscita). Si conta solo se
 * il ledger è quello della sessione: dopo una ricarica del modulo, o in una
 * ripresa da un processo nuovo, dove Claude Code ripristina il costo della
 * sessione. In un cambio di sessione nello stesso processo il ledger è
 * quello dell'altra sessione, e un ledger più basso è stato azzerato.
 */
export function ledgerGap(seg: SegLedger, src: string): number {
  if (seg.cost0 < seg.prev) {
    return 0
  }

  if (src === 'ricarica') {
    return seg.cost0 - seg.prev
  }

  if (src !== 'resume') {
    return 0
  }

  // Prima della 0.4.0 il cambio nello stesso processo si deduce da come è finito il segmento precedente.
  // Non si vede un /resume in un processo che ha lavorato su un'altra sessione dopo un'uscita normale
  // di questa: si conta anche il costo dell'altra. Lasciato così: sui dati reali della 0.3.0 le riprese
  // dopo un'uscita vengono da un processo nuovo, e contare il passaggio dà il costo di /cost.
  const sameProcess = seg.sw === undefined ? seg.end !== null && SWITCH_ENDS.has(seg.end) : seg.sw === 1

  return sameProcess ? 0 : seg.cost0 - seg.prev
}

/** Conta, una volta per segmento, il costo rimasto tra il segmento precedente e questo. */
function countGap(state: ReduceState, t: number, src: string): void {
  const seg = state.summary._r.seg

  if (seg === undefined || seg === null || seg.gap) {
    return
  }

  const gap = ledgerGap(seg, src)

  if (gap > 0) {
    seg.gap = true
    countOutsideTurns(state, t, gap)
  }
}

/** Applica un evento. Muta `state` e lo restituisce. */
export function apply(state: ReduceState, event: KpiEvent): ReduceState {
  const s = state.summary
  const d = state.details
  const r = s._r
  const t = event.t

  s.diag.events += 1

  if (s.firstAt === 0 || t < s.firstAt) {
    s.firstAt = t
  }

  if (t > s.lastAt) {
    s.lastAt = t
  }

  switch (event.e) {
    case 'seg.start': {
      r.seg =
        s.segments === 0
          ? null
          : { prev: r.lastCost, end: r.segEnd ?? null, cost0: event.cost0, ...(event.sw !== undefined && { sw: event.sw }), gap: false }
      s.segments += 1
      s.kind = event.kind
      state.tz = event.tz
      countGap(state, t, event.src)
      r.lastCost = event.cost0
      r.segEnd = null
      r.lastTurnEndAt = null
      r.turn = null
      r.liveAgents = []

      if (event.model !== undefined) {
        bump(s.models.set, event.model)
      }

      break
    }

    case 'seg.src':
      if (event.model !== undefined && s.models.set[event.model] === undefined) {
        bump(s.models.set, event.model)
      }

      // La ripresa può arrivare dopo l'apertura del segmento come `startup`.
      countGap(state, t, event.src)
      break

    case 'seg.end':
      r.turn = null
      r.segEnd = event.reason
      break

    case 'meta':
      if (typeof event.branch === 'string' && event.branch !== '') {
        if (r.branch !== event.branch) {
          bump(s.git.branches, event.branch)
        }

        r.branch = event.branch
      }

      break

    case 'prompt': {
      s.prompts.n += 1
      bump(s.prompts.byOrigin, event.o)
      addStat(s.prompts.chars, event.ch)
      addStat(s.prompts.words, event.w)
      addStat(s.prompts.lines, event.ln)

      if (event.qd === 1) {
        s.prompts.queued += 1
      }

      for (const [type, count] of Object.entries(event.att ?? {})) {
        bump(s.prompts.att, type, count)
      }

      if (event.th !== undefined) {
        addStat(s.prompts.think, event.th)
      }

      dayOf(state, t).prompts += 1
      break
    }

    case 'psrc':
      bump(s.prompts.bySource, event.s)
      break

    case 'expand':
      bump(s.expansions, `${event.k}:${event.name}`)
      break

    case 'mention':
      s.mentions.n += 1
      bump(s.mentions.byType, event.type)
      break

    case 'turn.start':
      r.turn = { tu: event.tu, start: t, steps: 0, tools: 0, errs: 0 }
      break

    case 'step': {
      const tokens = tokensOf(event)

      s.requests.n += 1
      dayOf(state, t).req += 1
      bump(s.requests.byStop, event.stop ?? 'nessuna')
      r.stepsByTurn[event.tu] = (r.stepsByTurn[event.tu] ?? 0) + 1

      if (event.ttft !== undefined) {
        addStat(s.requests.ttft, event.ttft)
      }

      addStat(s.requests.latency, event.ms)

      if (event.gen !== undefined && event.gen > 0 && event.out > 0) {
        addStat(s.requests.tps, (event.out * 1000) / event.gen)
      }

      for (const [name, ms] of event.srv ?? []) {
        const entry = (s.requests.server[name] ??= { n: 0, ms: 0 })

        entry.n += 1
        entry.ms += ms
      }

      if (event.um !== undefined && event.um !== event.m && !event.um.startsWith(event.m) && !event.m.startsWith(event.um)) {
        s.requests.fallback += 1
      }

      if (event.ef !== undefined) {
        bump(s.effort, event.ef)
      }

      if (event.stop === 'max_tokens') {
        s.errors.maxTokens += 1
      }

      const model = event.um ?? event.m

      countTokens(state, t, model, tokens, event.a)

      const entry = s.byModel[model]

      if (entry !== undefined) {
        entry.req += 1
      }

      if (event.a === undefined && r.turn !== null && r.turn.tu === event.tu) {
        r.turn.steps += 1
      }

      break
    }

    case 'turn.end': {
      bump(s.turns.byReason, event.r)
      addStat(s.turns.ans, event.ans)

      if (event.r === 'error') {
        s.errors.turnErr += 1
      } else if (event.r === 'aborted') {
        s.errors.interrupts += 1
      } else if (event.r === 'refusal') {
        s.errors.refusals += 1
        bump(s.turns.refusal, event.rc ?? 'sconosciuta')
      }

      const steps = r.stepsByTurn[event.tu] ?? 0

      // Senza metriche per richiesta (streamTiming spento) i token arrivano dal turno.
      if (steps === 0 && event.ns === 0) {
        countTokens(state, t, event.m, tokensOf(event), event.a)

        if (event.m !== undefined && s.byModel[event.m] !== undefined) {
          ;(s.byModel[event.m] as { req: number }).req += 1
        }
      }

      delete r.stepsByTurn[event.tu]

      if (event.a !== undefined) {
        s.turns.sub += 1

        const agent = d.agents[event.a]

        if (agent !== undefined) {
          agent.ms = (agent.ms ?? 0) + event.ms

          const type = s.agents.byType[agent.type]

          if (type !== undefined) {
            type.ms += event.ms

            if (event.r === 'error') {
              type.err += 1
            }
          }
        }

        break
      }

      s.turns.main += 1
      s.activeMs += event.ms
      addStat(s.turns.dur, event.ms)

      const day = dayOf(state, t)

      day.turns += 1
      day.active += event.ms
      s.byHour[hourSlot(t, state.tz)] = (s.byHour[hourSlot(t, state.tz)] ?? 0) + 1

      const current = r.turn !== null && r.turn.tu === event.tu ? r.turn : null

      addStat(s.turns.steps, current?.steps ?? steps)
      addStat(s.turns.tools, current?.tools ?? 0)

      d.turns.push({
        i: s.turns.main,
        t,
        ms: event.ms,
        tok: totalTokens(tokensOf(event)),
        out: event.out ?? 0,
        tools: current?.tools ?? 0,
        err: current?.errs ?? 0,
        r: event.r,
        cost: null,
        pct: null,
      })

      if (d.turns.length > LIMITS.turns) {
        d.turns.splice(0, d.turns.length - LIMITS.turns)
      }

      r.turn = null
      r.lastTurnEndAt = t
      break
    }

    case 'measure': {
      if (event.cost !== undefined) {
        const delta = event.cost >= r.lastCost ? event.cost - r.lastCost : event.cost

        r.lastCost = event.cost

        if (delta > 0 && event.p === 1) {
          countOutsideTurns(state, t, delta)
        } else if (delta > 0) {
          s.cost.usd += delta
          dayOf(state, t).cost += delta

          const last = d.turns.at(-1)

          if (last !== undefined) {
            last.cost = (last.cost ?? 0) + delta
          }

          addStat(s.cost.perTurn, delta)
        }
      }

      if (event.win !== undefined && event.win > 0) {
        s.context.window = event.win
      }

      if (event.ctx !== undefined) {
        s.context.maxTokens = Math.max(s.context.maxTokens, event.ctx)
      }

      if (event.pct !== undefined) {
        s.context.lastPct = event.pct
        s.context.maxPct = Math.max(s.context.maxPct, event.pct)
        addStat(s.context.pctEnd, event.pct)

        const last = d.turns.at(-1)

        if (last !== undefined) {
          last.pct = event.pct
        }
      }

      for (const [kind, pct, resetsAt] of event.rl ?? []) {
        const entry = (s.rate[kind] ??= { max: 0, last: 0 })

        entry.last = pct
        entry.max = Math.max(entry.max, pct)

        if (resetsAt !== undefined) {
          entry.resetsAt = resetsAt
        }
      }

      break
    }

    case 'tool':
      applyTool(state, event)
      break

    case 'tool.ms': {
      const agg = s.tools.byTool[event.tool]

      if (agg !== undefined) {
        addStat(agg.ms, event.ms)
      }

      break
    }

    case 'batch':
      addStat(s.tools.batches, event.n)
      break

    case 'perm':
      bump(s.perms.byDecision, event.d)
      bump(s.perms.byWho, event.by)
      break

    case 'perm.dialog':
      s.perms.dialogs += 1
      break

    case 'perm.denied':
      s.perms.denied += 1
      break

    case 'agent.spawn': {
      s.agents.n += 1
      bump(s.agents.byModel, event.m ?? 'eredita')

      const type = (s.agents.byType[event.type] ??= { n: 0, ms: 0, tok: 0, tools: 0, bg: 0, err: 0 })

      type.n += 1

      if (event.bg === 1) {
        type.bg += 1
        s.agents.bg += 1
      }

      if (event.wf !== undefined) {
        const seen = Object.values(d.agents).some(agent => agent.wf === event.wf)

        if (!seen) {
          s.agents.workflows += 1
        }
      }

      if (event.id !== undefined) {
        d.agents[event.id] = {
          id: event.id,
          type: event.type,
          start: t,
          ...(event.m !== undefined && { model: event.m }),
          ...(event.bg === 1 && { bg: 1 as const }),
          ...(event.fork === 1 && { fork: 1 as const }),
          ...(event.wf !== undefined && { wf: event.wf }),
        }
        capRecords(d.agents, LIMITS.agents)
      }

      break
    }

    case 'agent.start':
      if (!r.liveAgents.includes(event.id)) {
        r.liveAgents.push(event.id)
      }

      s.agents.maxConcurrent = Math.max(s.agents.maxConcurrent, r.liveAgents.length)
      d.agents[event.id] ??= { id: event.id, type: event.type, start: t }
      break

    case 'agent.stop': {
      r.liveAgents = r.liveAgents.filter(id => id !== event.id)

      const agent = d.agents[event.id]

      if (agent !== undefined) {
        agent.end = t
      }

      break
    }

    case 'compact': {
      s.compactions.n += 1
      bump(s.compactions.byTrigger, event.tr)
      s.compactions.before += event.b ?? 0
      s.compactions.after += event.af ?? 0

      const tokens = tokensOf(event)

      addTokens(s.compactions.tokens, tokens)
      countTokens(state, t, undefined, tokens, event.a)
      d.compactions.push({ t, tr: event.tr, ...(event.b !== undefined && { b: event.b }), ...(event.af !== undefined && { af: event.af }) })

      if (d.compactions.length > LIMITS.compactions) {
        d.compactions.shift()
      }

      const last = d.turns.at(-1)

      if (last !== undefined) {
        last.cpt = 1
      }

      break
    }

    case 'cmd':
      bump(s.commands, event.name)
      capCounts(s.commands, LIMITS.commands)
      break

    case 'skill':
      // Conteggio dal prompt della skill; esiti dal tool Skill.
      ;(s.skills[event.name] ??= { n: 0, ok: 0, err: 0 }).n += 1
      break

    case 'model.switch':
      s.models.switches += 1
      bump(s.models.set, event.to)
      d.switches.push({ t, from: event.from, to: event.to, src: event.src })

      if (d.switches.length > LIMITS.switches) {
        d.switches.shift()
      }

      break

    case 'stop.fail':
      bump(s.errors.api, event.err)
      break

    case 'notif':
      bump(s.notif, event.type)
      break

    case 'instr':
      bump(s.instr, event.mt)
      break

    case 'cwd':
      s.cwdChanges += 1
      break

    case 'task':
      if (event.ev === 'created') {
        s.tasks.created += 1
      } else {
        s.tasks.completed += 1
      }

      break

    case 'docs': {
      const docs = (s.docs ??= { created: {}, regen: {} })

      for (const [ext, count] of Object.entries(event.cr ?? {})) {
        bump(docs.created, ext, count)
      }

      for (const [ext, count] of Object.entries(event.rg ?? {})) {
        bump(docs.regen, ext, count)
      }

      break
    }
  }

  return state
}

function applyTool(state: ReduceState, event: Extract<KpiEvent, { e: 'tool' }>): void {
  const s = state.summary
  const d = state.details
  const r = s._r
  const t = event.t
  const agg = (s.tools.byTool[event.tool] ??= emptyToolAgg())
  const day = dayOf(state, t)

  s.tools.n += 1
  agg.n += 1
  agg.wall += event.wall
  day.tools += 1

  if (event.st === 'ok') {
    agg.ok += 1
  } else if (event.st === 'err') {
    agg.err += 1
    s.errors.toolErr += 1
    day.toolErr += 1
  } else if (event.st === 'deny') {
    agg.deny += 1
    s.perms.toolDenied += 1
  } else if (event.st === 'cls') {
    // Il classificatore si conta da PermissionDenied (perms.denied): qui solo la colonna del tool.
    agg.deny += 1
  } else if (event.st === 'rej') {
    agg.rej = (agg.rej ?? 0) + 1
    s.perms.rejected = (s.perms.rejected ?? 0) + 1
  } else {
    agg.intr += 1
    s.errors.interrupts += 1
  }

  if (event.ro === 1) {
    agg.ro += 1
  }

  if (event.a !== undefined) {
    agg.sub += 1
    s.tools.sub += 1

    const agent = d.agents[event.a]

    if (agent !== undefined) {
      agent.tools = (agent.tools ?? 0) + 1

      const type = s.agents.byType[agent.type]

      if (type !== undefined) {
        type.tools += 1
      }
    }
  } else if (r.turn !== null) {
    r.turn.tools += 1
  }

  if (event.st === 'err' && event.a === undefined && r.turn !== null) {
    r.turn.errs += 1
  }

  if (event.mcp !== undefined) {
    const server = (s.tools.mcp[event.mcp] ??= { n: 0, err: 0 })

    server.n += 1

    if (event.st === 'err') {
      server.err += 1
    }

    capRecords(s.tools.mcp, LIMITS.mcp)
  }

  const x = event.x

  if (x === undefined) {
    return
  }

  switch (x.k) {
    case 'bash': {
      s.bash.n += 1

      // La categoria con le regole di adesso, dalle etichette (salvo un comando personalizzato o etichette che non bastano).
      const category = x.cus === 1 ? x.cat : (categoryOfLabels(x.cmds) ?? x.cat)
      // Riuscito per il motore, ma l'output diceva che la build o il test è fallito.
      const status = event.st === 'ok' && x.fx === 1 ? 'err' : event.st
      const cat = outcome(s.bash.byCat, category)

      countOutcome(cat, status, x)

      if (category === 'test') {
        countOutcome(s.tests, status, x)
      } else if (category === 'build') {
        countOutcome(s.builds, status, x)
      }

      if (x.pipe === 1) {
        s.bash.pipes += 1
      }

      if (x.sbx === 1) {
        s.bash.sandboxOff += 1
      }

      if (x.bg === 1) {
        s.tools.bg += 1
      }

      for (const cmd of new Set(x.cmds)) {
        const entry = (s.bash.byCmd[cmd] ??= { n: 0, ok: 0, err: 0 })

        entry.n += 1

        if (status === 'ok') {
          entry.ok += 1
        } else if (status === 'err') {
          entry.err += 1
        }

        const full = (d.bashCmds[cmd] ??= { n: 0, ok: 0, err: 0, cat: category })

        full.n += 1

        if (status === 'ok') {
          full.ok += 1
        } else if (status === 'err') {
          full.err += 1
        }
      }

      capRecords(s.bash.byCmd, LIMITS.cmds, value => value.n)

      if (x.git !== undefined) {
        applyGit(state, t, x.git)
      }

      break
    }

    case 'file': {
      applyFile(state, t, x)
      break
    }

    case 'agent':
      if (x.st !== undefined && x.id !== undefined) {
        const agent = d.agents[x.id]

        if (agent !== undefined) {
          agent.st = x.st
        }
      }

      if (x.st === 'error' && x.type !== undefined) {
        const type = s.agents.byType[x.type]

        if (type !== undefined) {
          type.err += 1
        }
      }

      break

    case 'skill': {
      const entry = (s.skills[x.name] ??= { n: 0, ok: 0, err: 0 })

      if (x.ok) {
        entry.ok += 1
      } else {
        entry.err += 1
      }

      capRecords(s.skills, LIMITS.skills, value => value.n)
      break
    }

    case 'web':
      s.web.fetch += 1
      bump(s.web.domains, x.host)
      bump(d.domains, x.host)
      capCounts(s.web.domains, 30)
      capCounts(d.domains, LIMITS.domains)
      s.web.bytes += x.bytes ?? 0

      if (event.st === 'err' || (x.code !== undefined && x.code >= 400)) {
        s.web.errors += 1
      }

      break

    case 'search':
      s.web.search += x.n ?? 1
      break

    case 'todo':
      s.todos.writes += 1
      s.todos.total = x.total
      s.todos.done = x.done
      break

    case 'wf':
      break
  }
}

function countOutcome(agg: OutcomeAgg, status: string, x: { to?: 1; bg?: 1; intr?: 1 }): void {
  agg.n += 1

  if (x.bg === 1) {
    agg.bg += 1
  }

  if (x.to === 1) {
    agg.to += 1
  }

  if (status === 'ok') {
    agg.ok += 1
  } else if (status === 'err') {
    agg.err += 1
  } else if (status === 'intr' || x.intr === 1) {
    agg.intr += 1
  }
}

function applyGit(state: ReduceState, t: number, git: NonNullable<Extract<NonNullable<Extract<KpiEvent, { e: 'tool' }>['x']>, { k: 'bash' }>['git']>): void {
  const s = state.summary
  const d = state.details

  if (git.c !== undefined) {
    const [sha, kind, branch] = git.c

    s.git.commits += 1
    bump(s.git.byKind, kind)
    dayOf(state, t).commits += 1
    d.commits.push({ t, sha, kind, ...(branch !== undefined && { branch }) })

    if (d.commits.length > LIMITS.commits) {
      d.commits.shift()
    }
  }

  if (git.p !== undefined) {
    s.git.pushes += 1
  }

  if (git.b !== undefined) {
    bump(s.git.branchOps, git.b[0])
  }

  if (git.pr !== undefined) {
    const [number, action, url] = git.pr

    bump(s.git.prs, action)
    d.prs.push({ t, n: number, action, ...(url !== undefined && { url }) })

    if (d.prs.length > LIMITS.prs) {
      d.prs.shift()
    }
  }
}

function applyFile(state: ReduceState, t: number, x: Extract<NonNullable<Extract<KpiEvent, { e: 'tool' }>['x']>, { k: 'file' }>): void {
  const s = state.summary
  const d = state.details
  const files = s.files
  // La classe dal percorso, non quella salvata: così le classi nuove valgono anche per gli eventi vecchi.
  const cls = classOf(x.path)
  const isNew = d.files[x.path] === undefined
  const file = (d.files[x.path] ??= { r: 0, e: 0, w: 0, add: 0, del: 0, ext: x.ext, cls, last: t })
  const wasModified = file.e + file.w > 0
  const wasRead = file.r > 0
  const add = x.add ?? 0
  const del = x.del ?? 0

  file.last = t

  if (isNew) {
    files.unique += 1

    if (x.out === 1) {
      files.outside += 1
    }
  }

  if (x.op === 'read') {
    files.read += 1
    file.r += 1
    files.linesRead += x.lines ?? 0

    if (!wasRead) {
      files.uniqueRead += 1
    }
  } else {
    if (x.op === 'write') {
      files.written += 1
      file.w += 1
    } else {
      files.edited += 1
      file.e += 1
    }

    if (!wasModified) {
      files.uniqueModified += 1
    }

    if (file.e + file.w === 3) {
      files.churn += 1
    }

    if (x.cr === 1 && file.cr !== 1) {
      file.cr = 1
      files.created += 1
    }

    if (x.um === 1) {
      files.userModified += 1
    }

    file.add += add
    file.del += del
    files.add += add
    files.del += del

    const day = dayOf(state, t)

    day.add += add
    day.del += del

    const ext = x.ext === '' ? '(nessuna)' : x.ext
    const byExt = (files.byExt[ext] ??= { n: 0, add: 0, del: 0 })

    byExt.n += 1
    byExt.add += add
    byExt.del += del
    capRecords(files.byExt, 60, value => value.add + value.del + value.n)

    const byClass = (files.byClass[cls] ??= { n: 0, add: 0, del: 0 })

    byClass.n += 1
    byClass.add += add
    byClass.del += del
  }

  capFiles(d)
}

/** Oltre il limite si tengono i file con più attività. */
function capFiles(d: KpiDetails): void {
  const keys = Object.keys(d.files)

  if (keys.length <= LIMITS.files) {
    return
  }

  const weight = (key: string): number => {
    const file = d.files[key]

    return file === undefined ? 0 : file.add + file.del + file.e + file.w + file.r
  }

  for (const key of keys.sort((a, b) => weight(a) - weight(b)).slice(0, keys.length - LIMITS.files)) {
    delete d.files[key]
  }
}

function capCounts(map: Record<string, number>, limit: number): void {
  const keys = Object.keys(map)

  if (keys.length <= limit) {
    return
  }

  const sorted = keys.filter(key => key !== 'altro').sort((a, b) => (map[b] ?? 0) - (map[a] ?? 0))

  for (const key of sorted.slice(limit - 1)) {
    map.altro = (map.altro ?? 0) + (map[key] ?? 0)
    delete map[key]
  }
}

function capRecords<T extends object>(map: Record<string, T>, limit: number, weight?: (value: T) => number): void {
  const keys = Object.keys(map)

  if (keys.length <= limit) {
    return
  }

  const w = weight ?? ((value: T) => ((value as { n?: number }).n ?? 0))
  const sorted = keys.filter(key => key !== 'altro').sort((a, b) => w(map[b] as T) - w(map[a] as T))

  for (const key of sorted.slice(limit - 1)) {
    const value = map[key] as T
    const other = map.altro

    if (other === undefined) {
      map.altro = value
    } else {
      for (const [field, amount] of Object.entries(value)) {
        if (typeof amount === 'number') {
          const holder = other as Record<string, unknown>

          holder[field] = (typeof holder[field] === 'number' ? (holder[field] as number) : 0) + amount
        }
      }
    }

    delete map[key]
  }
}

/** Fold di una sequenza di eventi a partire da uno stato. */
export function foldEvents(state: ReduceState, events: readonly KpiEvent[]): ReduceState {
  for (const event of events) {
    apply(state, event)
  }

  return state
}
