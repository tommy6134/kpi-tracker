/**
 * Dai dati di una tool call (input e risultato) al KpiEvent `tool`: esito,
 * metadati per tool e nient'altro. Mai testo di argomenti, output o query.
 */

import { classifyBash, type CustomCommands } from '../analysis/bash-classify'
import { classOf, lineCount, linesOfResult } from '../analysis/lines'
import type { GitInfo, KpiEventBody, ToolExtra, ToolStatus } from '../core/events'
import { extOf, isAbsolute, isInside, join } from '../core/paths'

const NAME_RE = /^[A-Za-z0-9][A-Za-z0-9._:/@+-]{0,99}$/

/** Un nome (skill, agente, server MCP) se è un identificatore sicuro, altrimenti `altro`. */
export function safeName(value: unknown): string {
  return typeof value === 'string' && NAME_RE.test(value) ? value : 'altro'
}

type ToolResultLike = {
  deny?: string
  isError?: true
  isReadOnly?: true
  result?: unknown
  text?: string
}

/*
 * Gli esiti che il motore restituisce come errore, riconosciuti dall'inizio
 * del testo che legge il modello (Claude Code 2.1.312). Il testo si legge in
 * memoria e non si salva: con un rifiuto può contenere le parole dell'utente.
 */
const LEAD = String.raw`^\s*(?:<tool_use_error>\s*)?`
/** "No" nel dialogo dei permessi, anche con un messaggio dell'utente. */
const REJECTED_RE = new RegExp(`${LEAD}The user doesn't want to (?:proceed with this tool use|take this action)`)
/** Negata dal classificatore della modalità auto. */
const CLASSIFIER_RE = new RegExp(`${LEAD}Permission for this action (?:was|has been) denied`)
/** Negata da una regola, dalla modalità (don't ask) o da un hook. */
const DENIED_RE = new RegExp(`${LEAD}(?:Permission to (?:use|read|edit) [\\s\\S]*?has been denied|Hook '[^']*' blocked this action|Agent type '[^']*' has been denied)`)
/** Interrotta, o non eseguita senza che nessuno l'abbia rifiutata (turno chiuso, richiesta scaduta). */
const INTERRUPTED_RE = new RegExp(`${LEAD}\\[(?:Request interrupted|Tool call )|interrupted|interrotto|request was aborted`, 'i')

/** L'esito di una tool call dal suo risultato. */
export function statusOf(result: ToolResultLike | undefined): ToolStatus {
  if (result === undefined) {
    return 'err'
  }

  if (typeof result.deny === 'string') {
    return 'deny'
  }

  if (result.isError === true) {
    const text = typeof result.text === 'string' ? result.text : typeof result.result === 'string' ? result.result : ''

    if (REJECTED_RE.test(text)) {
      return 'rej'
    }

    if (CLASSIFIER_RE.test(text)) {
      return 'cls'
    }

    if (DENIED_RE.test(text)) {
      return 'deny'
    }

    return INTERRUPTED_RE.test(text) ? 'intr' : 'err'
  }

  const record = result.result as { interrupted?: unknown } | undefined

  return record !== undefined && record !== null && typeof record === 'object' && record.interrupted === true ? 'intr' : 'ok'
}

/**
 * Marcatori di build e test falliti nell'output: con `mvn package 2>&1 | tail`
 * l'esito del comando è quello di `tail`. I contatori a zero non contano.
 */
const FAILURE_MARKERS: readonly RegExp[] = [
  /\bBUILD FAILURE\b/, // Maven
  /\bBUILD FAILED\b|^Build FAILED\.?$/m, // Gradle, Ant, dotnet
  /^npm (?:ERR!|error) /m, // npm
  /\berror TS\d{4,5}\b/, // tsc
  /^[^\s:][^:\n]*:\d+(?::\d+)?: (?:fatal )?error:/m, // javac, gcc, clang, cobc: `file:riga: error:`
  /^error(?:\[E\d{4}\])?: /m, // rustc, cargo
  /\berror CS\d{4}\b/, // C#
  /^(?:ERROR in |✘ \[ERROR\]|error during build:|Failed to compile\.?$)/m, // webpack, esbuild, vite, Next.js
  /^--- FAIL: |^FAIL\t/m, // go test
  /^=+ .*\b[1-9]\d* (?:failed|errors?)\b.*=+\s*$/m, // pytest
  /^FAILED /m, // pytest, riepilogo breve
  /^Tests: +.*\b[1-9]\d* failed/m, // jest
  /^ *(?:Test Files|Tests) +[1-9]\d* failed/m, // vitest
  /Tests run: \d+, Failures: (?:[1-9]|0, Errors: [1-9])/, // JUnit, Surefire
  /There (?:are|were) test failures/, // Surefire
  /^test result: FAILED\./m, // cargo test
  /^FAILURES!$/m, // PHPUnit
  /^ *[1-9]\d* failing$/m, // mocha
  /^\d+ examples?, [1-9]\d* failures?/m, // rspec
  /^make(?:\[\d+\])?: \*\*\* /m, // make
]

/** Quanto output si guarda: la fine, dove compaiono i riepiloghi. */
const OUTPUT_TAIL = 65_536

/** `true` se l'output (letto in memoria, mai salvato) dice che una build o un test è fallito. */
export function failedOutput(output: string): boolean {
  const tail = output.length > OUTPUT_TAIL ? output.slice(-OUTPUT_TAIL) : output

  return FAILURE_MARKERS.some(marker => marker.test(tail))
}

/** `mcp__server__tool` → `server`. */
export function mcpServerOf(tool: string): string | undefined {
  const match = /^mcp__(.+?)__/.exec(tool)

  return match === null ? undefined : safeName(match[1])
}

const str = (value: unknown): string | undefined => (typeof value === 'string' ? value : undefined)
const num = (value: unknown): number | undefined => (typeof value === 'number' && Number.isFinite(value) ? value : undefined)

/** Un percorso assoluto, risolto contro `cwd` se relativo. */
function absPath(path: string, cwd: string): string {
  return isAbsolute(path) ? path : join(cwd, path)
}

function gitOf(record: unknown): GitInfo | undefined {
  const op = (record as { gitOperation?: Record<string, unknown> } | undefined)?.gitOperation

  if (op === undefined || op === null || typeof op !== 'object') {
    return undefined
  }

  const out: GitInfo = {}
  const commit = op.commit as { sha?: unknown; kind?: unknown; branch?: unknown } | undefined
  const push = op.push as { branch?: unknown } | undefined
  const branch = op.branch as { ref?: unknown; action?: unknown } | undefined
  const pr = op.pr as { number?: unknown; url?: unknown; action?: unknown } | undefined

  if (commit !== undefined && typeof commit.sha === 'string') {
    out.c = [commit.sha.slice(0, 7), str(commit.kind) ?? 'committed', ...(typeof commit.branch === 'string' ? [commit.branch] : [])] as GitInfo['c']
  }

  if (push !== undefined && typeof push.branch === 'string') {
    out.p = push.branch
  }

  if (branch !== undefined && typeof branch.action === 'string') {
    out.b = [branch.action, ...(typeof branch.ref === 'string' ? [branch.ref] : [])] as GitInfo['b']
  }

  if (pr !== undefined && typeof pr.number === 'number') {
    out.pr = [pr.number, str(pr.action) ?? 'created', ...(typeof pr.url === 'string' && /^https?:\/\//.test(pr.url) ? [pr.url.split('?')[0] as string] : [])] as GitInfo['pr']
  }

  return Object.keys(out).length > 0 ? out : undefined
}

/** Host di un URL, senza percorso né query. */
export function hostOf(url: unknown): string {
  if (typeof url !== 'string') {
    return 'altro'
  }

  try {
    return new URL(url).hostname.toLowerCase() || 'altro'
  } catch {
    return 'altro'
  }
}

/** I metadati per tool, o `undefined` per i tool senza metadati utili; `custom` sono i comandi di build e test delle opzioni. */
export function extraOf(tool: string, input: Readonly<Record<string, unknown>>, result: ToolResultLike | undefined, cwd: string, project: string, custom?: CustomCommands): ToolExtra | undefined {
  const record = result?.isError === true || result?.deny !== undefined ? undefined : result?.result
  const rec = (typeof record === 'object' && record !== null ? record : {}) as Record<string, unknown>

  switch (tool) {
    case 'Bash':
    case 'PowerShell': {
      const command = str(input.command) ?? ''
      const info = classifyBash(command, custom)
      const git = gitOf(record)
      // Riuscito per il motore: l'output può dire il contrario (una pipe ne nasconde l'esito).
      const output = record === undefined || (info.cat !== 'build' && info.cat !== 'test') ? '' : [str(rec.stdout), str(rec.stderr)].filter(part => part !== undefined).join('\n') || (result?.text ?? '')

      return {
        k: 'bash',
        cmds: info.cmds,
        cat: info.cat,
        ...(info.pipe && { pipe: 1 as const }),
        ...((input.run_in_background === true || typeof rec.backgroundTaskId === 'string') && { bg: 1 as const }),
        ...(typeof rec.timedOutAfterMs === 'number' && { to: 1 as const }),
        ...(rec.interrupted === true && { intr: 1 as const }),
        ...(input.dangerouslyDisableSandbox === true && { sbx: 1 as const }),
        ...(git !== undefined && { git }),
        ...(output !== '' && failedOutput(output) && { fx: 1 as const }),
        ...(info.custom && { cus: 1 as const }),
      }
    }

    case 'Edit':
    case 'MultiEdit':
    case 'Write':
    case 'NotebookEdit': {
      const raw = str(input.file_path) ?? str(input.notebook_path) ?? str(rec.filePath)

      if (raw === undefined) {
        return undefined
      }

      const path = absPath(raw, cwd)
      const lines = record === undefined ? { add: 0, del: 0, created: false } : linesOfResult(record)
      const op = tool === 'Write' ? 'write' : tool === 'NotebookEdit' ? 'notebook' : 'edit'

      return {
        k: 'file',
        op,
        path,
        ext: extOf(path),
        cls: classOf(path),
        ...(lines.add > 0 && { add: lines.add }),
        ...(lines.del > 0 && { del: lines.del }),
        ...(lines.created && { cr: 1 as const }),
        ...(rec.userModified === true && { um: 1 as const }),
        ...(!isInside(path, project) && { out: 1 as const }),
      }
    }

    case 'Read': {
      const raw = str(input.file_path)

      if (raw === undefined) {
        return undefined
      }

      const path = absPath(raw, cwd)
      const file = rec.file as { numLines?: unknown } | undefined
      const lines = num(file?.numLines)

      return {
        k: 'file',
        op: 'read',
        path,
        ext: extOf(path),
        cls: classOf(path),
        ...(lines !== undefined && { lines }),
        ...(!isInside(path, project) && { out: 1 as const }),
      }
    }

    case 'Agent':
    case 'Task': {
      const status = str(rec.status)

      return {
        k: 'agent',
        type: safeName(str(rec.agentType) ?? str(input.subagent_type) ?? 'general-purpose'),
        ...(status !== undefined && { st: status === 'completed' ? 'completed' : status }),
        ...(num(rec.totalDurationMs) !== undefined && { ms: num(rec.totalDurationMs) }),
        ...(num(rec.totalTokens) !== undefined && { tok: num(rec.totalTokens) }),
        ...(num(rec.totalToolUseCount) !== undefined && { tools: num(rec.totalToolUseCount) }),
        ...(typeof rec.agentId === 'string' && { id: rec.agentId }),
        ...(result?.isError === true && { st: 'error' }),
      }
    }

    case 'Skill':
      return { k: 'skill', name: safeName(str(input.skill) ?? str(rec.commandName)), ok: result?.isError !== true && rec.success !== false }

    case 'WebFetch':
      return {
        k: 'web',
        host: hostOf(input.url),
        ...(num(rec.code) !== undefined && { code: num(rec.code) }),
        ...(num(rec.bytes) !== undefined && { bytes: num(rec.bytes) }),
        ...(num(rec.durationMs) !== undefined && { ms: num(rec.durationMs) }),
      }

    case 'WebSearch':
      return { k: 'search', ...(num(rec.searchCount) !== undefined && { n: num(rec.searchCount) }), ...(num(rec.durationSeconds) !== undefined && { secs: num(rec.durationSeconds) }) }

    case 'TodoWrite': {
      const todos = Array.isArray(rec.newTodos) ? (rec.newTodos as { status?: unknown }[]) : Array.isArray(input.todos) ? (input.todos as { status?: unknown }[]) : []

      return { k: 'todo', total: todos.length, done: todos.filter(todo => todo?.status === 'completed').length }
    }

    case 'Workflow':
      return { k: 'wf', ...(typeof rec.status === 'string' && { st: rec.status }), ...(typeof rec.workflowName === 'string' && { name: safeName(rec.workflowName) }) }

    default:
      return undefined
  }
}

/** Il corpo dell'evento `tool` per una chiamata conclusa. */
export function toolEventOf(
  input: Readonly<Record<string, unknown>> & { tool: string; tool_use_id?: string },
  result: ToolResultLike | undefined,
  wallMs: number,
  cwd: string,
  project: string,
  custom?: CustomCommands,
): KpiEventBody {
  const tool = safeName(input.tool)
  const mcp = mcpServerOf(input.tool)
  const x = extraOf(input.tool, input, result, cwd, project, custom)

  return {
    e: 'tool',
    id: typeof input.tool_use_id === 'string' ? input.tool_use_id : '',
    tool,
    st: statusOf(result),
    wall: Math.max(0, Math.round(wallMs)),
    ...(result?.isReadOnly === true && { ro: 1 as const }),
    ...(mcp !== undefined && { mcp }),
    ...(x !== undefined && { x }),
  }
}

/** Lunghezze di un testo (mai il testo): caratteri, parole, righe. */
export function lengthsOf(text: string): { ch: number; w: number; ln: number } {
  const trimmed = text.trim()

  return { ch: text.length, w: trimmed === '' ? 0 : trimmed.split(/\s+/).length, ln: lineCount(text) }
}
