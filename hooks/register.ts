import type { EngineInterface, On, PluginOptions } from 'claude-code'

import { runKpi, type KpiCommandContext } from './commands/kpi'
import { optionsOf, PLUGIN_NAME } from './config'
import type { ResumeInfo } from './core/events'
import { extOf } from './core/paths'
import { lengthsOf, safeName, toolEventOf } from './collect/tool-extract'
import type { Host, OpenResult } from './host'
import {
  attach,
  awaitToolMs,
  endSession,
  flushNow,
  newTracker,
  noteToolMs,
  noticeOf,
  record,
  refreshBranch,
  scheduleFlush,
  setRoot,
  startTimers,
  type AttachExtra,
  type Tracker,
} from './tracker'
import { startUpdates } from './update/update'
import { bandView } from './ui/band'
import { liveOf } from './ui/live'
import { PANE_ID, paneView } from './ui/pane'

const REPORT_REF = /\(rif\. (kpi:r\d+)\)/

/**
 * Lega un Host da `$`. Ogni membro è scritto `$.nome.metodo(...)` in questo
 * file, così il motore legge dal sorgente cosa chiama il modulo.
 */
function hostOf($: EngineInterface): Host {
  return {
    fs: {
      read: path => $.fs.read(path),
      write: (path, text) => $.fs.write(path, text),
      list: path => $.fs.list(path),
      exists: path => $.fs.exists(path),
      stat: path => $.fs.stat(path),
    },
    now: () => $.clock.now(),
    after: (ms, fn) => $.clock.after(ms, fn),
    every: (ms, fn) => $.clock.every(ms, fn),
    storeGet: key => $.store.get(key),
    storeSet: (key, value) => $.store.set(key, value),
    invalidate: () => $.ui.invalidate('ui.render'),
    log: text => $.ui.log(text),
    debug: text => $.ui.log(text, { to: 'debug' }),
    toast: (text, timeoutMs) => $.ui.toast(text, timeoutMs === undefined ? undefined : { timeoutMs }),
    openPane: pane => $.ui.open(pane) as Promise<OpenResult>,
    closePane: pane => $.ui.close(pane),
    registerCommand: spec => $.command.register(spec),
    run: (argv, init) => $.process.run(argv, init),
    bindingGet: async () => (await $.state.get({ plugin: 'kpi-tracker', key: 'binding' })).value ?? null,
    bindingSet: async value => {
      await $.state.set({ plugin: 'kpi-tracker', key: 'binding' }, value)
    },
    sessionId: () => $.session.id(),
    sessionRoot: () => $.session.root(),
    usage: () => $.session.usage(),
    repo: () => $.session.repo(),
    version: () => $.session.version(),
    model: () => $.session.model(),
    pluginRoot: $.plugin.root,
  }
}

/** Il Host legato al primo hook che arriva. */
function bind(tracker: Tracker, $: EngineInterface): Host {
  tracker.host ??= hostOf($)

  return tracker.host
}

const num = (value: unknown): number => (typeof value === 'number' && Number.isFinite(value) ? value : 0)

/**
 * Registra gli hook di kpi-tracker: osservano (mai bloccano) sessione,
 * prompt, turni, richieste, tool, permessi, subagent e compattazioni, e
 * disegnano barra, pannello e output di /kpi.
 *
 * @param on il registratore del motore
 * @param raw le opzioni del plugin come le tengono i settings
 */
export function register(on: On, raw: PluginOptions) {
  const tracker = newTracker(optionsOf(raw))

  /** Avvio di `classic.SessionStart` arrivato prima di `session.start`. */
  let pendingStart: { sessionId: string; source: string; extra: AttachExtra } | null = null

  // ---------------------------------------------------------------- sessione

  on('session.start', async ($, e, next) => {
    const host = hostOf($)

    tracker.host = host
    tracker.launchCwd ??= e.cwd
    tracker.interactive = e.isInteractive
    tracker.surface = e.surface

    setRoot(tracker, {
      CLAUDE_CONFIG_DIR: await $.env.get('CLAUDE_CONFIG_DIR'),
      HOME: await $.env.get('HOME'),
      USERPROFILE: await $.env.get('USERPROFILE'),
      CLAUDE_CODE_ENTRYPOINT: await $.env.get('CLAUDE_CODE_ENTRYPOINT'),
      CLAUDE_CODE_EXECPATH: await $.env.get('CLAUDE_CODE_EXECPATH'),
    })

    tracker.ui.bandDisabled = (await host.storeGet('band').catch(() => undefined)) === 'off'

    await host
      .registerCommand({
        name: 'kpi',
        description: 'KPI di utilizzo di Claude Code: riepilogo, pannello live, statistiche, sessioni, report HTML, export',
        argumentHint: '[live|statistiche|sessioni|progetti|sessione|report|esporta|pulisci|ricostruisci|barra|aggiorna|aiuto] [filtri]',
        immediate: true,
      })
      .catch(() => undefined)

    startTimers(tracker)

    const sessionId = await host.sessionId()
    const pending = pendingStart !== null && pendingStart.sessionId === sessionId ? pendingStart : null

    pendingStart = null
    await attach(tracker, sessionId, pending?.source ?? 'startup', pending?.extra ?? {})
    void startUpdates(tracker).catch(() => undefined)

    return next(e)
  }).catch(($, e, next) => next(e))

  on('classic.SessionStart', async ($, e, next) => {
    bind(tracker, $)

    if (e.source !== 'compact') {
      const resume: ResumeInfo | undefined =
        e.source === 'resume' || e.source === 'fork'
          ? {
              ...(typeof e.seconds_since_last_response === 'number' && { s: Math.round(e.seconds_since_last_response) }),
              ...(typeof e.context_tokens === 'number' && { ctx: e.context_tokens }),
              ...(e.prompt_cache_likely_expired === true && { exp: 1 as const }),
            }
          : undefined
      const extra: AttachExtra = {
        ...(resume !== undefined && { resume }),
        ...(typeof e.model === 'string' && { model: e.model }),
        ...(typeof e.permission_mode === 'string' && { permissionMode: e.permission_mode }),
      }

      if (tracker.root === null) {
        pendingStart = { sessionId: e.session_id, source: e.source, extra }
      } else {
        void attach(tracker, e.session_id, e.source, extra)
      }
    }

    return next(e)
  }).catch(($, e, next) => next(e))

  on('session.end', async ($, e, next) => {
    bind(tracker, $)

    const budget = (next as unknown as { budget?: { remainingMs?: number } }).budget?.remainingMs ?? 1500

    await endSession(tracker, e.reason, Math.max(200, Math.min(1200, budget - 250)))

    return next(e)
  }).catch(($, e, next) => next(e))

  on('session.measure', ($, e, next) => {
    bind(tracker, $)
    record(tracker, {
      e: 'measure',
      ...(e.cost !== undefined && { cost: e.cost.usd }),
      ...(e.context.tokens !== undefined && { ctx: e.context.tokens }),
      win: e.context.window,
      ...(e.context.percent !== undefined && { pct: e.context.percent }),
      ...(e.rateLimits.length > 0 && {
        rl: e.rateLimits.map(limit => [limit.kind, limit.percentUsed, ...(limit.resetsAt !== undefined ? [limit.resetsAt] : [])] as [string, number, string?]),
      }),
    })
    tracker.host?.invalidate()

    return next(e)
  }).catch(($, e, next) => next(e))

  on('session.compact', async ($, e, next) => {
    bind(tracker, $)

    const result = await next(e)

    if (result.skip === undefined) {
      const usage = result.usage

      record(
        tracker,
        {
          e: 'compact',
          tr: e.trigger,
          ...(result.tokensBefore !== undefined && { b: result.tokensBefore }),
          ...(result.tokensAfter !== undefined && { af: result.tokensAfter }),
          ...(usage !== undefined && { in: usage.input_tokens, out: usage.output_tokens, cr: usage.cache_read_input_tokens, cw: usage.cache_creation_input_tokens }),
        },
        e.agentId,
      )
    }

    return result
  }).catch(($, e, next) => next(e))

  // ------------------------------------------------------------- prompt e turni

  on('prompt.submit', ($, e, next) => {
    bind(tracker, $)

    const now = Date.now()
    const queued = e.turnId !== undefined
    const att: Record<string, number> = {}

    for (const item of e.attachments ?? []) {
      att[item.type] = (att[item.type] ?? 0) + 1
    }

    const think = !queued && e.origin.kind === 'composer' && tracker.lastTurnEnd !== null ? now - tracker.lastTurnEnd : undefined

    record(tracker, {
      e: 'prompt',
      o: safeName(e.origin.kind),
      ...lengthsOf(e.text),
      ...(Object.keys(att).length > 0 && { att }),
      ...(queued && { qd: 1 as const }),
      ...(think !== undefined && think >= 0 && { th: think }),
    })

    return next(e)
  }).catch(($, e, next) => next(e))

  on('classic.UserPromptSubmit', ($, e, next) => {
    bind(tracker, $)
    record(tracker, { e: 'psrc', s: safeName(e.source ?? 'user') })

    return next(e)
  }).catch(($, e, next) => next(e))

  on('classic.UserPromptExpansion', ($, e, next) => {
    bind(tracker, $)
    record(tracker, { e: 'expand', k: e.expansion_type, name: safeName(e.command_name) })

    return next(e)
  }).catch(($, e, next) => next(e))

  on('prompt.mention', async ($, e, next) => {
    bind(tracker, $)

    const result = await next(e)

    if (result.deny === undefined) {
      record(tracker, { e: 'mention', type: result.type ?? 'nessuno', ext: extOf(e.path), path: e.path }, e.agentId)
    }

    return result
  }).catch(($, e, next) => next(e))

  on('turn.start', ($, e, next) => {
    bind(tracker, $)
    record(tracker, { e: 'turn.start', tu: e.turnId })

    return next(e)
  }).catch(($, e, next) => next(e))

  if (tracker.options.streamTiming) {
    on('turn.step', async function* ($, e, next) {
      bind(tracker, $)

      const startedAt = Date.now()
      let firstAt: number | undefined
      const stream = next(e)
      let step = await stream.next()

      while (step.done !== true) {
        const chunk = step.value

        if (firstAt === undefined && (chunk.kind === 'text' || chunk.kind === 'thinking' || chunk.kind === 'tool')) {
          firstAt = Date.now()
        }

        yield chunk
        step = await stream.next()
      }

      const result = step.value

      try {
        const endedAt = Date.now()
        const usage = result.usage
        const servers = (result.serverToolUses ?? []).map(use => [safeName(use.name), Math.max(0, num(use.endedAt) - num(use.startedAt))] as [string, number])

        tracker.stepsByTurn.set(e.turnId, (tracker.stepsByTurn.get(e.turnId) ?? 0) + 1)
        record(
          tracker,
          {
            e: 'step',
            tu: e.turnId,
            i: e.index,
            m: e.model,
            ...(usage !== null && usage.model !== e.model && { um: usage.model }),
            ...(e.effort !== undefined && { ef: String(e.effort) }),
            ms: endedAt - startedAt,
            ...(firstAt !== undefined && { ttft: firstAt - startedAt, gen: endedAt - firstAt }),
            in: usage?.input_tokens ?? 0,
            out: usage?.output_tokens ?? 0,
            cr: usage?.cache_read_input_tokens ?? 0,
            cw: usage?.cache_creation_input_tokens ?? 0,
            stop: result.stopReason,
            tools: result.toolUses.length,
            ...(servers.length > 0 && { srv: servers }),
          },
          e.agentId,
          endedAt,
        )
        tracker.host?.invalidate()
      } catch {
        // la misura non deve mai disturbare la risposta
      }

      return result
    })
  }

  on('turn.complete', async ($, e, next) => {
    bind(tracker, $)

    const steps = tracker.stepsByTurn.get(e.turnId) ?? 0
    const usage = e.usage

    tracker.stepsByTurn.delete(e.turnId)
    record(
      tracker,
      {
        e: 'turn.end',
        tu: e.turnId,
        ms: Math.round(e.durationMs),
        r: e.reason,
        ...(e.reason === 'refusal' && { rc: e.refusal?.category ?? null }),
        ...(usage !== undefined && {
          m: usage.model,
          in: usage.input_tokens,
          out: usage.output_tokens,
          cr: usage.cache_read_input_tokens,
          cw: usage.cache_creation_input_tokens,
        }),
        ns: steps,
        ans: e.answer.length,
      },
      e.agentId,
    )

    if (e.agentId === undefined) {
      tracker.lastTurnEnd = Date.now()

      if (tracker.interactive === false) {
        await flushNow(tracker)
      } else {
        scheduleFlush(tracker)
      }
    }

    return next(e)
  }).catch(($, e, next) => next(e))

  // ------------------------------------------------------------------- tool

  on('tool.call', async ($, e, next) => {
    bind(tracker, $)

    const startedAt = Date.now()
    let result: Awaited<ReturnType<typeof next>> | undefined

    try {
      result = await next(e)

      return result
    } finally {
      try {
        const input = e as unknown as Readonly<Record<string, unknown>> & { tool: string; tool_use_id?: string }
        const project = tracker.launchCwd ?? '/'
        const body = toolEventOf(input, result, Date.now() - startedAt, project, project)

        record(tracker, body, e.agentId)

        if (body.e === 'tool') {
          awaitToolMs(tracker, body.id, body.tool, e.agentId)

          const x = body.x

          if (x?.k === 'bash' && (x.git?.b !== undefined || x.cmds.some(cmd => /^git (checkout|switch|merge|rebase|branch|worktree|pull)/.test(cmd)))) {
            refreshBranch(tracker)
          }
        }

        if (tracker.ui.paneOpen) {
          tracker.host?.invalidate()
        }
      } catch {
        // la misura non deve mai disturbare la chiamata
      }
    }
  }).catch(($, e, next) => next(e))

  on('classic.PostToolUse', ($, e, next) => {
    bind(tracker, $)

    if (typeof e.duration_ms === 'number') {
      noteToolMs(tracker, e.tool_use_id, e.duration_ms, false, e.agent_id)
    }

    return next(e)
  }).catch(($, e, next) => next(e))

  on('classic.PostToolUseFailure', ($, e, next) => {
    bind(tracker, $)

    if (typeof e.duration_ms === 'number') {
      noteToolMs(tracker, e.tool_use_id, e.duration_ms, e.is_interrupt === true, e.agent_id)
    }

    return next(e)
  }).catch(($, e, next) => next(e))

  on('classic.PostToolBatch', ($, e, next) => {
    bind(tracker, $)

    if (e.tool_calls.length > 0) {
      record(tracker, { e: 'batch', n: e.tool_calls.length }, e.agent_id)
    }

    return next(e)
  }).catch(($, e, next) => next(e))

  on('tool.check', async ($, e, next) => {
    bind(tracker, $)

    const result = await next(e)

    if (next.origin.plugin === 'engine') {
      record(tracker, { e: 'perm', tool: safeName(e.tool), d: result.decision, by: result.rule !== undefined ? 'regola' : result.hook !== undefined ? 'hook' : 'modalità' }, e.agentId)
    }

    return result
  }).catch(($, e, next) => next(e))

  on('classic.PermissionRequest', ($, e, next) => {
    bind(tracker, $)
    record(tracker, { e: 'perm.dialog', tool: safeName(e.tool_name) }, e.agent_id)

    return next(e)
  }).catch(($, e, next) => next(e))

  on('classic.PermissionDenied', ($, e, next) => {
    bind(tracker, $)
    record(tracker, { e: 'perm.denied', tool: safeName(e.tool_name) }, e.agent_id)

    return next(e)
  }).catch(($, e, next) => next(e))

  // --------------------------------------------------------------- subagent

  on('agent.spawn', async ($, e, next) => {
    bind(tracker, $)

    const result = await next(e)

    if (result.deny === undefined) {
      record(tracker, {
        e: 'agent.spawn',
        ...(result.agentId !== undefined && { id: result.agentId }),
        type: safeName(e.subagentType === '' ? 'general-purpose' : e.subagentType),
        ...(result.model !== '' && { m: result.model }),
        ...(e.background && { bg: 1 as const }),
        ...(e.fork && { fork: 1 as const }),
        ...(e.isTeammate === true && { team: 1 as const }),
        ...(e.workflow !== undefined && { wf: e.workflow.runId }),
      })
    }

    return result
  }).catch(($, e, next) => next(e))

  on('classic.SubagentStart', ($, e, next) => {
    bind(tracker, $)
    record(tracker, { e: 'agent.start', id: e.agent_id, type: safeName(e.agent_type) })

    return next(e)
  }).catch(($, e, next) => next(e))

  on('classic.SubagentStop', ($, e, next) => {
    bind(tracker, $)
    record(tracker, { e: 'agent.stop', id: e.agent_id, type: safeName(e.agent_type) })

    return next(e)
  }).catch(($, e, next) => next(e))

  // ----------------------------------------------------------------- varie

  on('command.run', ($, e, next) => {
    bind(tracker, $)
    record(tracker, { e: 'cmd', name: safeName(e.command), o: safeName(e.origin.kind) })

    return next(e)
  }).catch(($, e, next) => next(e))

  on('skill.prompt', ($, e, next) => {
    bind(tracker, $)
    record(tracker, { e: 'skill', name: safeName(e.skill) })

    return next(e)
  }).catch(($, e, next) => next(e))

  on('classic.PostModelSwitch', ($, e, next) => {
    bind(tracker, $)
    record(tracker, { e: 'model.switch', from: safeName(e.from_model), to: safeName(e.to_model), src: e.source })

    return next(e)
  }).catch(($, e, next) => next(e))

  on('classic.StopFailure', ($, e, next) => {
    bind(tracker, $)
    record(tracker, { e: 'stop.fail', err: safeName(e.error) })

    return next(e)
  }).catch(($, e, next) => next(e))

  on('classic.Notification', ($, e, next) => {
    bind(tracker, $)
    record(tracker, { e: 'notif', type: safeName(e.notification_type) })

    return next(e)
  }).catch(($, e, next) => next(e))

  on('classic.InstructionsLoaded', ($, e, next) => {
    bind(tracker, $)
    record(tracker, { e: 'instr', mt: e.memory_type, lr: e.load_reason })

    return next(e)
  }).catch(($, e, next) => next(e))

  on('classic.CwdChanged', ($, e, next) => {
    bind(tracker, $)
    record(tracker, { e: 'cwd', to: e.new_cwd })

    return next(e)
  }).catch(($, e, next) => next(e))

  on('classic.TaskCreated', ($, e, next) => {
    bind(tracker, $)
    record(tracker, { e: 'task', ev: 'created' })

    return next(e)
  }).catch(($, e, next) => next(e))

  on('classic.TaskCompleted', ($, e, next) => {
    bind(tracker, $)
    record(tracker, { e: 'task', ev: 'completed' })

    return next(e)
  }).catch(($, e, next) => next(e))

  // ---------------------------------------------------------- interfaccia

  async function openPane(host: Host): Promise<{ isPlaced: boolean; reason?: string }> {
    const result = await host.openPane({ id: PANE_ID, title: 'KPI · sessione' })

    tracker.ui.paneOpen = true
    host.invalidate()

    return result === undefined ? { isPlaced: true } : result
  }

  on('ui.render', { component: 'AbovePrompt' }, ($, e, next) => {
    const host = bind(tracker, $)
    const store = tracker.store

    if (e.props.hasSurvey || tracker.ui.bandHidden || tracker.ui.bandDisabled || store === null) {
      return next(e)
    }

    const live = liveOf(store.file, store.details, Date.now())
    const { Box, Text, Button } = $.ui.resolve(e)

    return bandView(
      { Box, Text, Button },
      live,
      Math.max(20, Math.floor(e.props.bodyColumns)),
      {
        details: () => {
          void openPane(host).catch(() => undefined)
        },
        hide: () => {
          tracker.ui.bandHidden = true
          host.invalidate()
        },
      },
      noticeOf(tracker),
    )
  }).catch(($, e, next) => next(e))

  on('ui.render', { component: 'Pane', requestId: PANE_ID }, ($, e, next) => {
    const host = bind(tracker, $)
    const store = tracker.store
    const table = $.ui.resolve(e)
    const kit = { Box: table.Box, Text: table.Text, Button: table.Button, ...('Raster' in table && { Raster: table.Raster }) }

    tracker.ui.paneOpen = true

    return paneView(
      kit,
      store === null ? null : liveOf(store.file, store.details, Date.now()),
      Math.max(30, Math.floor(e.props.bodyColumns)),
      {
        report: () => {
          void runCommand(host, 'report').then(result => host.log(result.short ?? result.text))
        },
        close: () => {
          tracker.ui.paneOpen = false
          void host.closePane({ id: PANE_ID }).catch(() => undefined)
        },
      },
    )
  }).catch(($, e, next) => next(e))

  on('ui.close', async ($, e, next) => {
    const result = await next(e)

    if (e.id === PANE_ID && result.deny === undefined) {
      tracker.ui.paneOpen = false
    }

    return result
  }).catch(($, e, next) => next(e))

  // Il report completo di /kpi si disegna qui; nel transcript (e al modello) resta la riga breve.
  on('ui.render', { component: 'CommandOutput', props: { command: 'kpi' } }, ($, e, next) => {
    const ref = REPORT_REF.exec(e.props.text)?.[1]
    const full = ref === undefined ? undefined : tracker.ui.reports.get(ref)

    return full === undefined ? next(e) : next({ ...e, props: { ...e.props, text: full } })
  }).catch(($, e, next) => next(e))

  // --------------------------------------------------------------- /kpi

  function contextOf(host: Host): KpiCommandContext {
    return {
      host,
      tracker,
      openPane: () => openPane(host),
      platform: async () => ({
        os: await host.run(['uname', '-s'], { timeoutMs: 3000 }).then(
          result => result.stdout.trim(),
          () => 'Windows_NT',
        ),
      }),
    }
  }

  function runCommand(host: Host, args: string) {
    return runKpi(contextOf(host), args)
  }

  on('command.run', { command: 'kpi' }, async ($, e) => {
    const host = bind(tracker, $)
    const result = await runKpi(contextOf(host), e.args)
    const wantsModel = result.toModel === true || tracker.interactive === false

    if (wantsModel || result.short === undefined) {
      return { text: result.text }
    }

    tracker.ui.reportSeq += 1

    const ref = `kpi:r${tracker.ui.reportSeq}`

    tracker.ui.reports.set(ref, result.text)

    if (tracker.ui.reports.size > 10) {
      const oldest = tracker.ui.reports.keys().next().value

      if (oldest !== undefined) {
        tracker.ui.reports.delete(oldest)
      }
    }

    return { text: `${result.short} (rif. ${ref})` }
  }).catch(() => ({ text: `${PLUGIN_NAME}: errore interno nel comando /kpi` }))
}
