import type { On, RenderElement, RenderNode, SessionUsage } from 'claude-code'

/**
 * Il mondo sotto il plugin, in memoria: un albero di file (percorsi assoluti)
 * da cui rispondono le chiamate `$.fs`, la sessione simulata e il registro di
 * tutto ciò che il plugin ha chiesto al motore.
 */
export type World = {
  files: Map<string, string>
  mtimes: Map<string, number>
  writes: { path: string; text: string }[]
  runs: string[][]
  opened: string[]
  closed: string[]
  logs: string[]
  toasts: string[]
  store: Map<string, unknown>
  commands: string[]
  invalidations: number
  session: { id: string; root: string; model: string; version: string; usage: SessionUsage; repo: { root: string; remote: string | null; internal: boolean; name: string | null } | null }
  branch: string
  /** Ciò che risponde `git config user.name` (vuoto = nessun nome). */
  gitUser: string
  /** Ciò che rispondono `git status --porcelain=v2 -z` e `git diff --name-status -z` dei documenti. */
  gitStatus: string
  gitDiff: string
  /** Le scritture che il motore rifiuta, come per un modulo già scaricato (`true` = rifiutata). */
  refuseWrite: (path: string) => boolean
  /** Tutto il testo scritto su disco, per i controlli di privacy. */
  written: () => string
  /** I file scritti sotto un prefisso. */
  under: (prefix: string) => string[]
  json: <T>(path: string) => T
}

export const HOME = '/home/tester'
export const CONFIG = '/home/tester/.claude-test'
export const ROOT = '/home/tester/.claude-test/kpi'
export const CWD = '/work/progetto-demo'
export const PROJECT_DIR = `${ROOT}/-work-progetto-demo`
export const SESSION_ID = '3f9a1c2e-1111-2222-3333-444455556666'

export const usageOf = (usd: number, percent = 10): SessionUsage => ({
  startedAt: Date.UTC(2026, 9, 12, 8, 30, 0),
  context: { tokens: percent * 2000, window: 200_000, percent },
  rateLimits: [{ kind: 'five_hour', percentUsed: 23, resetsAt: '2026-10-12T14:00:00Z' }],
  cost: { usd },
})

/** La cartella Scaricati che `xdg-user-dir DOWNLOAD` risponde nel mondo Linux. */
export const DOWNLOADS = `${HOME}/Scaricati`

/** Il kernel di WSL, da mettere in `/proc/version` per un mondo WSL. */
export const WSL_KERNEL = 'Linux version 5.15.167.4-microsoft-standard-WSL2'

/** Come `wslpath -w` converte un percorso della distribuzione. */
export const wslPathOf = (path: string): string => `\\\\wsl.localhost\\Ubuntu${path.replace(/\//g, '\\')}`

/** Il manifest e il compat.json che il plugin legge dalla propria cartella (`$.plugin.root`). */
export type OwnRelease = { version: string; minClaudeCode?: string }

/**
 * Siede il mondo in memoria sotto il plugin; `os` è ciò che risponde `uname -s`
 * (default `Darwin`), `release` ciò che il plugin trova nei propri plugin.json e compat.json.
 */
export function worldOf(on: On, options: { env?: Record<string, string>; files?: Record<string, string>; os?: string; release?: OwnRelease } = {}): World {
  let tick = 1_000
  const env: Record<string, string> = { HOME, CLAUDE_CONFIG_DIR: CONFIG, ...options.env }

  const world: World = {
    files: new Map(Object.entries(options.files ?? {})),
    mtimes: new Map(),
    writes: [],
    runs: [],
    opened: [],
    closed: [],
    logs: [],
    toasts: [],
    store: new Map(),
    commands: [],
    invalidations: 0,
    session: {
      id: SESSION_ID,
      root: CWD,
      model: 'claude-opus-5-5',
      version: '2.1.296',
      usage: usageOf(0),
      repo: { root: CWD, remote: 'git@git.example.com:team/progetto-demo.git', internal: true, name: 'progetto-demo' },
    },
    branch: 'main',
    gitUser: '',
    gitStatus: '',
    gitDiff: '',
    refuseWrite: () => false,
    written: () => [...world.files.values()].join('\n'),
    under: prefix => [...world.files.keys()].filter(path => path.startsWith(prefix)).sort(),
    json: <T,>(path: string) => JSON.parse(world.files.get(path) ?? 'null') as T,
  }

  const isDir = (path: string) => [...world.files.keys()].some(file => file.startsWith(`${path}/`))

  const own = options.release

  on('fs.read', ($, e) => {
    const text = world.files.get(e.path)

    if (text === undefined && own !== undefined && e.path.endsWith('/.claude-plugin/plugin.json')) {
      return { value: JSON.stringify({ name: 'kpi-tracker', version: own.version }) }
    }

    if (text === undefined && own?.minClaudeCode !== undefined && e.path.endsWith('/.claude-plugin/compat.json')) {
      return { value: JSON.stringify({ minClaudeCode: own.minClaudeCode }) }
    }

    return text === undefined ? { deny: `ENOENT: ${e.path}` } : { value: text }
  })

  on('fs.exists', ($, e) => ({ value: world.files.has(e.path) || isDir(e.path) }))

  on('fs.stat', ($, e) => {
    const text = world.files.get(e.path)

    if (text !== undefined) {
      return { value: { kind: 'file' as const, size: text.length, mtimeMs: world.mtimes.get(e.path) ?? 0, isLink: false } }
    }

    return isDir(e.path) ? { value: { kind: 'dir' as const, size: 0, mtimeMs: 0, isLink: false } } : { deny: `ENOENT: ${e.path}` }
  })

  on('fs.list', ($, e) => {
    const dir = e.path ?? '/'
    const names = new Map<string, 'file' | 'dir'>()

    for (const file of world.files.keys()) {
      if (!file.startsWith(`${dir}/`)) {
        continue
      }

      const rest = file.slice(dir.length + 1)
      const name = rest.split('/')[0] ?? ''

      names.set(name, rest.includes('/') ? 'dir' : 'file')
    }

    if (names.size === 0 && !isDir(dir)) {
      return { deny: `ENOENT: ${dir}` }
    }

    return {
      value: [...names.entries()].sort().map(([name, kind]) => ({
        name,
        kind,
        size: kind === 'file' ? (world.files.get(`${dir}/${name}`)?.length ?? 0) : 0,
        mtimeMs: world.mtimes.get(`${dir}/${name}`) ?? 0,
        isLink: false,
      })),
    }
  })

  on('fs.write', ($, e) => {
    if (world.refuseWrite(e.path)) {
      return { deny: `modulo scaricato: ${e.path}` }
    }

    tick += 1
    world.writes.push({ path: e.path, text: e.text })
    world.files.set(e.path, e.text)
    world.mtimes.set(e.path, tick)

    return { value: undefined }
  })

  on('env.get', ($, e) => ({ value: env[e.name] }))
  on('store.get', ($, e) => ({ value: world.store.get(e.key) }))
  on('store.set', ($, e) => {
    world.store.set(e.key, JSON.parse(JSON.stringify(e.value)) as unknown)

    return { value: undefined }
  })

  on('session.id', () => ({ value: world.session.id }))
  on('session.root', () => ({ value: world.session.root }))
  on('session.cwd', () => ({ value: world.session.root }))
  on('session.model', () => ({ value: world.session.model }))
  on('session.version', () => ({ value: { version: world.session.version } }))
  on('session.usage', () => ({ value: world.session.usage }))
  on('session.repo', () => ({ value: world.session.repo }))

  on('process.run', ($, e) => {
    world.runs.push([...e.argv])

    const isBranch = e.argv[0] === 'git' && e.argv.includes('rev-parse')
    const isUser = e.argv[0] === 'git' && e.argv.includes('user.name')
    const isStatus = e.argv[0] === 'git' && e.argv.includes('status')
    const isDiff = e.argv[0] === 'git' && e.argv.includes('diff')
    const stdout = isBranch
      ? `${world.branch}\n`
      : isUser
        ? `${world.gitUser}\n`
        : isStatus
          ? world.gitStatus
          : isDiff
            ? world.gitDiff
            : e.argv[0] === 'uname'
        ? `${options.os ?? 'Darwin'}\n`
        : e.argv[0] === 'xdg-user-dir'
          ? `${DOWNLOADS}\n`
          : e.argv[0] === 'wslpath'
            ? `${wslPathOf(e.argv.at(-1) ?? '')}\n`
            : ''
    // explorer.exe esce con 1 anche quando apre la cartella.
    const exitCode = e.argv[0] === 'explorer.exe' ? 1 : 0

    return { value: { exitCode, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
  })

  on('command.register', ($, e) => {
    world.commands.push(e.name)

    return { value: { command: e.name } }
  })

  on('ui.open', ($, e) => {
    world.opened.push(e.id)

    return { value: { isPlaced: true } } as never
  })

  on('ui.close', ($, e) => {
    world.closed.push(e.id)

    return { value: undefined } as never
  })

  // Solo le righe del transcript: quelle del log di debug non si vedono.
  on('ui.log', ($, e) => {
    if (e.to !== 'debug') {
      world.logs.push(e.text)
    }

    return { value: undefined }
  })

  on('ui.toast', ($, e) => {
    world.toasts.push(e.text)

    return { value: undefined }
  })

  on('ui.invalidate', () => {
    world.invalidations += 1

    return { value: undefined }
  })

  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('session.end', ($, e) => ({ sessionId: e.sessionId }))
  on('session.measure', ($, e) => ({ changed: e.changed }))
  on('turn.start', ($, e) => ({ turnId: e.turnId }))
  on('turn.complete', ($, e) => ({ text: e.answer }))
  on('prompt.submit', ($, e) => ({ text: e.text }))
  on('command.run', () => ({ text: '' }))
  on('skill.prompt', ($, e) => ({ text: e.text }))

  for (const name of [
    'classic.SessionStart', 'classic.UserPromptSubmit', 'classic.UserPromptExpansion', 'classic.PostToolUse', 'classic.PostToolUseFailure',
    'classic.PostToolBatch', 'classic.PermissionRequest', 'classic.PermissionDenied', 'classic.SubagentStart', 'classic.SubagentStop',
    'classic.PostModelSwitch', 'classic.StopFailure', 'classic.Notification', 'classic.InstructionsLoaded', 'classic.CwdChanged',
    'classic.TaskCreated', 'classic.TaskCompleted',
  ] as const) {
    on(name, () => ({}) as never)
  }

  return world
}

/** Ogni stringa di un albero disegnato, in ordine. */
export function stringsOf(node: RenderNode | RenderElement | null | undefined): string[] {
  if (node === null || node === undefined) {
    return []
  }

  if (typeof node === 'string') {
    return [node]
  }

  const own: string[] = []
  const props = (node as { props?: Record<string, unknown> }).props

  if (node.type === 'Button' && typeof props?.label === 'string') {
    own.push(`[${props.label}]`)
  }

  const children = (node as { children?: readonly RenderNode[] }).children ?? []

  return [...own, ...children.flatMap(child => stringsOf(child))]
}

export const textOf = (node: RenderNode | RenderElement | null | undefined): string => stringsOf(node).join('')

/** Gli elementi di un tipo in un albero. */
export function elementsOf(node: RenderNode | RenderElement | null | undefined, type: string): RenderElement[] {
  if (node === null || node === undefined || typeof node === 'string') {
    return []
  }

  const children = (node as { children?: readonly RenderNode[] }).children ?? []

  return [...(node.type === type ? [node] : []), ...children.flatMap(child => elementsOf(child, type))]
}
