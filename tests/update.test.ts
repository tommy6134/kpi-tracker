import { describe, expect, mock, test } from 'claude-code/testing'

import { parseArgs } from '../hooks/commands/args'
import { optionsOf, type UpdateMode } from '../hooks/config'
import type { Host } from '../hooks/host'
import { keepsItalian, LANGUAGE_KEY, setItalian } from '../hooks/i18n/migrate'
import { newTracker, noticeOf, type Tracker } from '../hooks/tracker'
import { installationOf, releaseAt, sourceOf, type Release } from '../hooks/update/install'
import { compareVersions, engineOf, isVersion, partsOf } from '../hooks/update/semver'
import { CHECK_DELAY_MS, CHECK_EVERY_MS, checkForUpdates, decide, FAILURES_TO_SHOW, isDue, loadState, RETRY_MS, startUpdates, updateReport } from '../hooks/update/update'
import { BAND, command, commandOutput, IT, SESSION } from './fixtures/inputs'
import { textOf, worldOf } from './fixtures/world'

const T0 = Date.UTC(2026, 9, 21, 8, 0, 0)
const HOUR = 3_600_000
const CONFIG = '/home/tester/.claude-test'
const MKT = 'tommy6134'
const INSTALLED = `${CONFIG}/plugins/cache/${MKT}/kpi-tracker/0.3.0`
const CLONE = `${CONFIG}/plugins/marketplaces/${MKT}`
const UPSTREAM = `${CONFIG}/kpi/_meta/upstream.git`
const REPO = 'https://github.com/tommy6134/kpi-tracker.git'
const EXEC = '/home/tester/.local/share/claude/versions/2.1.299'
const MARKETPLACE_UPDATE = [EXEC, 'plugin', 'marketplace', 'update', MKT]
const PLUGIN_UPDATE = [EXEC, 'plugin', 'update', `kpi-tracker@${MKT}`]
const GIT_INIT = ['git', 'init', '--bare', '-q', UPSTREAM]
const gitFetch = (url: string, ref = 'HEAD') => ['git', '--git-dir', UPSTREAM, 'fetch', '--depth', '1', '--no-tags', '-q', url, ref]
const gitShow = (file: string) => ['git', '--git-dir', UPSTREAM, 'show', `FETCH_HEAD:${file}`]

type Setup = {
  /** La lingua del plugin (default `it`, come i testi dei test). */
  language?: 'it' | 'en'
  engine?: string
  local?: Release
  remote?: Release
  mode?: UpdateMode
  native?: boolean
  pluginRoot?: string
  /** Nome del marketplace e del plugin (cartelle della cache, chiave del registro, voce del catalogo). */
  marketplace?: string
  plugin?: string
  /** La `source` della voce nel catalogo; default `./`, il plugin sta nel clone del marketplace. */
  source?: unknown
  execPath?: string | null
  failMarketplace?: string
  failFetch?: string
  failInstall?: string
}

const manifest = (release: Release) => JSON.stringify({ name: 'kpi-tracker', version: release.version })
const compat = (release: Release) => JSON.stringify({ minClaudeCode: release.minClaudeCode })

/**
 * Un'installazione da marketplace in memoria: il plugin nella cache, il
 * registro dei marketplace, il clone con il catalogo. `claude plugin
 * marketplace update` porta nel clone la release `remote` (come un git pull);
 * per un catalogo che indica il plugin con un URL, la porta `git fetch`.
 */
function installed(setup: Setup = {}) {
  const local = setup.local ?? { version: '0.3.0', minClaudeCode: '2.1.287' }
  const remote = setup.remote ?? local
  const marketplace = setup.marketplace ?? MKT
  const plugin = setup.plugin ?? 'kpi-tracker'
  const root = `${CONFIG}/plugins/cache/${marketplace}/${plugin}/${local.version}`
  const clone = `${CONFIG}/plugins/marketplaces/${marketplace}`
  const files = new Map<string, string>([
    [`${root}/.claude-plugin/plugin.json`, manifest(local)],
    [`${CONFIG}/plugins/known_marketplaces.json`, JSON.stringify({ [marketplace]: { source: { source: 'github', repo: 'tommy6134/kpi-tracker' }, installLocation: clone, ...(setup.native === true && { autoUpdate: true }) } })],
    [`${clone}/.claude-plugin/marketplace.json`, JSON.stringify({ name: marketplace, plugins: [{ name: plugin, source: setup.source ?? './' }] })],
    [`${clone}/.claude-plugin/plugin.json`, manifest(local)],
  ])

  if (local.minClaudeCode !== undefined) {
    files.set(`${root}/.claude-plugin/compat.json`, compat(local))
  }

  const store = new Map<string, unknown>()
  const runs: string[][] = []
  const envs: Record<string, string>[] = []
  let fetched: Release | null = null
  const toasts: string[] = []
  const logs: string[] = []
  const debug: string[] = []
  const timers: { ms: number; fn: () => void }[] = []
  const env = { engine: setup.engine ?? '2.1.299', now: T0 }
  const ok = (stdout = '') => ({ exitCode: 0, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false })
  const failed = (stderr: string) => ({ exitCode: 1, stdout: '', stderr, isStdoutTruncated: false, isStderrTruncated: false })

  const host = {
    fs: {
      read: async (path: string) => {
        const text = files.get(path)

        if (text === undefined) {
          throw new Error(`ENOENT: ${path}`)
        }

        return text
      },
      exists: async (path: string) => files.has(path) || [...files.keys()].some(file => file.startsWith(`${path}/`)),
    },
    now: async () => env.now,
    after: (ms: number, fn: () => void) => {
      timers.push({ ms, fn })

      return { cancel: () => undefined }
    },
    storeGet: async (key: string) => store.get(key),
    storeSet: async (key: string, value: unknown) => {
      store.set(key, JSON.parse(JSON.stringify(value)) as unknown)
    },
    invalidate: () => undefined,
    log: (text: string) => logs.push(text),
    debug: (text: string) => debug.push(text),
    toast: (text: string) => toasts.push(text),
    run: async (argv: readonly string[], init?: { env?: Record<string, string> }) => {
      runs.push([...argv])
      envs.push({ ...init?.env })

      if (argv[0] === 'git') {
        if (argv[1] === 'init') {
          files.set(`${argv.at(-1) as string}/HEAD`, 'ref: refs/heads/main\n')

          return ok()
        }

        if (argv.includes('fetch')) {
          if (setup.failFetch !== undefined) {
            return failed(setup.failFetch)
          }

          fetched = remote

          return ok()
        }

        const file = (argv.at(-1) as string).replace(/^FETCH_HEAD:/, '')

        if (fetched !== null && file.endsWith('.claude-plugin/plugin.json')) {
          return ok(manifest(fetched))
        }

        if (fetched?.minClaudeCode !== undefined && file.endsWith('.claude-plugin/compat.json')) {
          return ok(compat(fetched))
        }

        return failed(`fatal: path '${file}' does not exist in 'FETCH_HEAD'`)
      }

      if (argv.includes('marketplace')) {
        if (setup.failMarketplace !== undefined) {
          return failed(setup.failMarketplace)
        }

        files.set(`${clone}/.claude-plugin/plugin.json`, manifest(remote))

        if (remote.minClaudeCode !== undefined) {
          files.set(`${clone}/.claude-plugin/compat.json`, compat(remote))
        } else {
          files.delete(`${clone}/.claude-plugin/compat.json`)
        }

        return ok()
      }

      return setup.failInstall !== undefined ? failed(setup.failInstall) : ok(`Updated ${plugin} to ${remote.version}`)
    },
    version: async () => ({ version: env.engine }),
    pluginRoot: setup.pluginRoot ?? root,
  } as unknown as Host

  const tracker: Tracker = newTracker(optionsOf({ autoUpdate: setup.mode ?? 'auto', language: setup.language ?? 'it' }))

  tracker.host = host
  tracker.env = { CLAUDE_CONFIG_DIR: CONFIG, HOME: '/home/tester', ...(setup.execPath !== null && { CLAUDE_CODE_EXECPATH: setup.execPath ?? EXEC }) }
  tracker.root = `${CONFIG}/kpi`
  tracker.interactive = true
  tracker.surface = 'terminal'

  return { tracker, host, files, store, runs, envs, toasts, logs, debug, timers, env }
}

const auto = { force: false, install: true }

describe('versioni', () => {
  test('confronto per parti numeriche, suffissi ignorati', () => {
    expect(compareVersions('0.3.0', '0.2.0')).toBe(1)
    expect(compareVersions('0.2.9', '0.10.0')).toBe(-1)
    expect(compareVersions('2.1.299', '2.1.310')).toBe(-1)
    expect(compareVersions('2.1.280-dev', '2.1.280')).toBe(0)
    expect(compareVersions('1.0', '1.0.0')).toBe(0)
    expect(compareVersions('v1.2', '1.2.0')).toBe(0)
    expect(partsOf('boh')).toBe(null)
    expect(isVersion('2.1.287')).toBe(true)
    expect(isVersion(287)).toBe(false)
    expect(engineOf({ version: '2.1.280-dev.20260920.t101500.sha1a2b3c4', base: '2.1.280-dev' })).toBe('2.1.280-dev')
    expect(engineOf({ version: '2.1.306' })).toBe('2.1.306')
  })

  test('decisione: aggiornato, bloccato dal Claude Code in uso, compatibile', () => {
    expect(decide('0.3.0', { version: '0.3.0' }, '2.1.299').kind).toBe('aggiornato')
    expect(decide('0.3.0', { version: '0.2.0' }, '2.1.299').kind).toBe('aggiornato')
    expect(decide('0.3.0', { version: '0.4.0', minClaudeCode: '2.1.310' }, '2.1.299')).toEqual({ kind: 'bloccato', minClaudeCode: '2.1.310' })
    expect(decide('0.3.0', { version: '0.4.0', minClaudeCode: '2.1.310' }, '2.1.310').kind).toBe('compatibile')
    expect(decide('0.3.0', { version: '0.4.0' }, '2.1.299').kind).toBe('compatibile')
  })

  test('scadenza: intervallo passato o Claude Code cambiato', () => {
    const state = { nextAt: T0 + HOUR, failures: 0, cc: '2.1.299' }

    expect(isDue(state, T0, '2.1.299')).toBe(false)
    expect(isDue(state, T0 + HOUR, '2.1.299')).toBe(true)
    expect(isDue(state, T0, '2.1.310')).toBe(true)
    expect(isDue({ nextAt: 0, failures: 0 }, T0, '2.1.299')).toBe(true)
  })

  test('opzione autoUpdate: tre valori, alias, valore non valido segnalato', () => {
    expect(optionsOf({}).autoUpdate).toBe('auto')
    expect(optionsOf({ autoUpdate: 'avviso' }).autoUpdate).toBe('avviso')
    expect(optionsOf({ autoUpdate: 'Notify' }).autoUpdate).toBe('avviso')
    expect(optionsOf({ autoUpdate: ' OFF ' }).autoUpdate).toBe('off')
    expect(optionsOf({ autoUpdate: 'boh' })).toMatchObject({ autoUpdate: 'auto', badAutoUpdate: 'boh' })
    expect(optionsOf({ autoUpdate: 'auto' }).badAutoUpdate).toBe(null)
  })

  test('/kpi aggiorna e i suoi alias', () => {
    expect(parseArgs('aggiorna').sub).toBe('aggiorna')

    const check = parseArgs('update --check')

    expect(check.sub).toBe('aggiorna')
    expect(check.bools.has('verifica')).toBe(true)
    expect(parseArgs('aggiorna --verifica').errors).toEqual([])
  })
})

describe('installazione', () => {
  test('cartella di configurazione, marketplace e nome dal percorso nella cache; una cartella di sviluppo non ne ha', () => {
    expect(installationOf(INSTALLED)).toEqual({ configDir: CONFIG, marketplace: MKT, plugin: 'kpi-tracker' })
    // Qualunque CLAUDE_CONFIG_DIR: conta solo il percorso del plugin.
    expect(installationOf('/srv/profili/lavoro/plugins/cache/azienda/kpi-aziendale/0.3.0')).toEqual({ configDir: '/srv/profili/lavoro', marketplace: 'azienda', plugin: 'kpi-aziendale' })
    expect(installationOf('C:\\Users\\me\\.claude\\plugins\\cache\\tommy6134\\kpi-tracker\\0.3.0')).toEqual({ configDir: 'C:\\Users\\me\\.claude', marketplace: MKT, plugin: 'kpi-tracker' })
    expect(installationOf('/home/tester/progetti/kpi-tracker')).toBe(null)
    expect(installationOf(`${CONFIG}/plugins/cache/${MKT}/kpi-tracker`)).toBe(null)
  })

  test('release nella cartella di un plugin', async () => {
    const { host } = installed({ local: { version: '0.3.0', minClaudeCode: '2.1.287' } })

    expect(await releaseAt(host.fs, INSTALLED)).toEqual({ version: '0.3.0', minClaudeCode: '2.1.287' })
    expect(await releaseAt(host.fs, '/nessuna/cartella')).toBe(null)
  })

  test('la fonte del plugin nel catalogo: cartella del clone, repo git, altro', async () => {
    const { files, host } = installed()
    const sourceFor = async (source: unknown, metadata?: Record<string, unknown>) => {
      files.set(`${CLONE}/.claude-plugin/marketplace.json`, JSON.stringify({ ...(metadata !== undefined && { metadata }), plugins: [{ name: 'kpi-tracker', source }] }))

      return sourceOf(host.fs, CLONE, 'kpi-tracker')
    }

    expect(await sourceFor('./')).toEqual({ kind: 'locale', dir: CLONE })
    expect(await sourceFor('./plugins/kpi-tracker/')).toEqual({ kind: 'locale', dir: `${CLONE}/plugins/kpi-tracker` })
    expect(await sourceFor('kpi-tracker', { pluginRoot: './plugins' })).toEqual({ kind: 'locale', dir: `${CLONE}/plugins/kpi-tracker` })
    expect(await sourceFor({ source: 'url', url: REPO })).toEqual({ kind: 'git', url: REPO })
    expect(await sourceFor({ source: 'url', url: 'git@gitlab.azienda.it:tools/kpi.git', ref: 'v0.3.0' })).toEqual({ kind: 'git', url: 'git@gitlab.azienda.it:tools/kpi.git', ref: 'v0.3.0' })
    expect(await sourceFor({ source: 'github', repo: 'tommy6134/kpi-tracker', sha: 'abcdef1234567890' })).toEqual({ kind: 'git', url: REPO, sha: 'abcdef1234567890' })
    expect(await sourceFor({ source: 'git-subdir', url: 'tommy6134/monorepo', path: './tools/kpi/' })).toEqual({ kind: 'git', url: 'https://github.com/tommy6134/monorepo.git', path: 'tools/kpi' })
    expect(await sourceFor({ source: 'npm', package: 'kpi-tracker' })).toEqual({ kind: 'altro', what: 'fonte npm' })

    for (const bad of ['../fuori', '/assoluto', { source: 'url', url: '--upload-pack=x' }, { source: 'url', url: REPO, ref: '-x' }, { source: 'git-subdir', url: REPO, path: '../x' }, 42]) {
      expect((await sourceFor(bad))?.kind).toBe('altro')
    }

    files.set(`${CLONE}/.claude-plugin/marketplace.json`, JSON.stringify({ plugins: [{ name: 'altro-plugin', source: './' }] }))
    expect(await sourceOf(host.fs, CLONE, 'kpi-tracker')).toBe(null)
  })
})

describe('controllo degli aggiornamenti', () => {
  test('versione nuova e compatibile: aggiorna il catalogo, installa, avvisa di ricaricare', async () => {
    const world = installed({ remote: { version: '0.3.1', minClaudeCode: '2.1.287' } })
    const outcome = await checkForUpdates(world.tracker, auto)

    expect(outcome.kind).toBe('installato')
    expect(world.runs).toEqual([MARKETPLACE_UPDATE, PLUGIN_UPDATE])
    expect(world.toasts).toHaveLength(1)
    expect(world.toasts[0]).toContain('/reload-plugins')
    expect(world.logs).toEqual([])
    expect(noticeOf(world.tracker)?.band).toContain('0.3.1 installato')

    const state = await loadState(world.host)

    expect(state).toMatchObject({ nextAt: T0 + CHECK_EVERY_MS, failures: 0, cc: '2.1.299', checkedAt: T0, latest: { version: '0.3.1' } })
  })

  test('versione nuova che richiede un Claude Code più recente: niente installazione, avviso una volta sola', async () => {
    const world = installed({ remote: { version: '0.4.0', minClaudeCode: '2.1.310' } })
    const outcome = await checkForUpdates(world.tracker, auto)

    expect(outcome).toMatchObject({ kind: 'bloccato', minClaudeCode: '2.1.310' })
    expect(world.runs).toEqual([MARKETPLACE_UPDATE])
    expect(world.toasts).toHaveLength(1)
    expect(world.logs).toHaveLength(1)
    expect(world.logs[0]).toContain('Claude Code ≥ 2.1.310 (in uso 2.1.299)')
    expect(world.logs[0]).toContain('claude update')
    expect(noticeOf(world.tracker)).toMatchObject({ tone: 'warn' })

    // Il giorno dopo, stessa release e stesso Claude Code: la barra resta, toast e transcript no.
    world.env.now = T0 + CHECK_EVERY_MS
    expect((await checkForUpdates(world.tracker, auto)).kind).toBe('bloccato')
    expect(world.toasts).toHaveLength(1)
    expect(world.logs).toHaveLength(1)

    // Aggiornato Claude Code, il controllo riparte subito e installa.
    world.env.engine = '2.1.310'
    world.env.now += HOUR

    expect((await checkForUpdates(world.tracker, auto)).kind).toBe('installato')
    expect(world.runs.at(-1)).toEqual(PLUGIN_UPDATE)
  })

  test('modo avviso: segnala senza installare', async () => {
    const world = installed({ mode: 'avviso', remote: { version: '0.3.1' } })
    const outcome = await checkForUpdates(world.tracker, { force: false, install: false })

    expect(outcome.kind).toBe('disponibile')
    expect(world.runs).toEqual([MARKETPLACE_UPDATE])
    expect(world.toasts[0]).toContain('/kpi aggiorna')
    expect(noticeOf(world.tracker)?.band).toContain('0.3.1 disponibile')
  })

  test('già aggiornato: nessun avviso; subito dopo il controllo è rinviato', async () => {
    const world = installed()

    expect((await checkForUpdates(world.tracker, auto)).kind).toBe('aggiornato')
    expect(world.toasts).toEqual([])
    expect(noticeOf(world.tracker)).toBe(null)

    world.env.now += HOUR
    expect((await checkForUpdates(world.tracker, auto)).kind).toBe('rinviato')
    expect(world.runs).toEqual([MARKETPLACE_UPDATE])
  })

  test('auto-update nativo acceso: nessun comando, consiglio di spegnerlo una volta sola', async () => {
    const world = installed({ native: true, remote: { version: '0.3.1' } })

    expect((await checkForUpdates(world.tracker, auto)).kind).toBe('nativo')
    expect(world.runs).toEqual([])
    expect(world.logs).toHaveLength(1)
    expect(world.logs[0]).toContain('/plugin → Marketplaces')

    world.env.now += CHECK_EVERY_MS
    expect((await checkForUpdates(world.tracker, auto)).kind).toBe('nativo')
    expect(world.logs).toHaveLength(1)
  })

  test('errori silenziosi con nuovo tentativo dopo un\'ora; al terzo una riga nel transcript', async () => {
    const world = installed({ failMarketplace: 'fatal: unable to access github.com\nsecond line' })

    for (let attempt = 1; attempt <= FAILURES_TO_SHOW + 1; attempt += 1) {
      const outcome = await checkForUpdates(world.tracker, auto)

      expect(outcome).toEqual({ kind: 'errore', error: 'fatal: unable to access github.com' })
      expect(await loadState(world.host)).toMatchObject({ failures: attempt, nextAt: world.env.now + RETRY_MS })
      expect(world.logs).toHaveLength(attempt >= FAILURES_TO_SHOW ? 1 : 0)
      world.env.now += RETRY_MS
    }

    expect(world.toasts).toEqual([])
    expect(world.debug).toHaveLength(FAILURES_TO_SHOW + 1)
  })

  test('installazione fallita: errore, niente avviso di riavvio', async () => {
    const world = installed({ remote: { version: '0.3.1' }, failInstall: 'Plugin "kpi-tracker" non trovato' })

    expect(await checkForUpdates(world.tracker, auto)).toEqual({ kind: 'errore', error: 'Plugin "kpi-tracker" non trovato' })
    expect(world.toasts).toEqual([])
    expect(noticeOf(world.tracker)).toBe(null)
  })

  test('cartella di sviluppo, opzione off e sessione non interattiva: nessun comando', async () => {
    const dev = installed({ pluginRoot: '/home/tester/progetti/kpi-tracker' })

    expect((await checkForUpdates(dev.tracker, { force: true, install: true })).kind).toBe('cartella')

    const off = installed({ mode: 'off', remote: { version: '0.3.1' } })

    expect((await checkForUpdates(off.tracker, auto)).kind).toBe('spento')
    // /kpi aggiorna funziona anche con l'opzione su off.
    expect((await checkForUpdates(off.tracker, { force: true, install: true })).kind).toBe('installato')

    const headless = installed({ remote: { version: '0.3.1' } })

    headless.tracker.interactive = false
    expect((await checkForUpdates(headless.tracker, auto)).kind).toBe('spento')
    expect([...dev.runs, ...headless.runs]).toEqual([])
  })

  test('senza CLAUDE_CODE_EXECPATH si usa `claude` dal PATH', async () => {
    const world = installed({ execPath: null, remote: { version: '0.3.1' } })

    await checkForUpdates(world.tracker, auto)
    expect(world.runs.map(argv => argv[0])).toEqual(['claude', 'claude'])
  })

  test('/kpi aggiorna: forzato e senza toast; --verifica non installa', async () => {
    const world = installed({ remote: { version: '0.3.1' } })

    await checkForUpdates(world.tracker, auto)
    world.runs.length = 0

    const verify = await checkForUpdates(world.tracker, { force: true, install: false })

    expect(verify.kind).toBe('disponibile')
    expect(world.runs).toEqual([MARKETPLACE_UPDATE])
  })

  test('il testo di /kpi aggiorna riporta versioni, modo, ultimo controllo ed esito', async () => {
    const world = installed({ remote: { version: '0.4.0', minClaudeCode: '2.1.310' }, mode: 'avviso' })
    const outcome = await checkForUpdates(world.tracker, { force: true, install: true })
    const text = await updateReport(world.tracker, world.host, outcome)

    expect(text).toContain('## kpi-tracker · aggiornamenti')
    expect(text).toContain('0.3.0 (richiede Claude Code ≥ 2.1.287)')
    expect(text).toContain('0.4.0 (richiede Claude Code ≥ 2.1.310)')
    expect(text).toContain('| Claude Code in uso | 2.1.299 |')
    expect(text).toContain('avviso: segnala')
    expect(text).toContain('**Esito:** kpi-tracker 0.4.0 è disponibile ma richiede Claude Code ≥ 2.1.310')
    // Visto con /kpi aggiorna: niente toast né transcript.
    expect(world.toasts).toEqual([])
    expect(world.logs).toEqual([])
  })
})

describe('catalogo che indica il plugin con un URL (es. marketplace aziendale su GitLab)', () => {
  const URL_SOURCE = { source: 'url', url: REPO }

  test('legge la release dal repo con git, senza chiedere credenziali, e installa', async () => {
    const world = installed({ source: URL_SOURCE, remote: { version: '0.3.1', minClaudeCode: '2.1.287' } })
    const outcome = await checkForUpdates(world.tracker, auto)

    expect(outcome.kind).toBe('installato')
    expect(world.runs).toEqual([MARKETPLACE_UPDATE, GIT_INIT, gitFetch(REPO), gitShow('.claude-plugin/plugin.json'), gitShow('.claude-plugin/compat.json'), PLUGIN_UPDATE])

    for (const env of world.envs) {
      expect(env).toMatchObject({ GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'never' })
    }

    // Il repo bare resta: il giorno dopo niente git init.
    world.env.now += CHECK_EVERY_MS
    world.runs.length = 0
    await checkForUpdates(world.tracker, auto)
    expect(world.runs[1]).toEqual(gitFetch(REPO))
  })

  test('richiede un Claude Code più recente: niente installazione, avviso', async () => {
    const world = installed({ source: URL_SOURCE, remote: { version: '0.4.0', minClaudeCode: '2.1.310' } })

    expect(await checkForUpdates(world.tracker, auto)).toMatchObject({ kind: 'bloccato', minClaudeCode: '2.1.310' })
    expect(world.runs.some(argv => argv.includes('update') && argv.includes('plugin') && !argv.includes('marketplace'))).toBe(false)
    expect(world.logs[0]).toContain('claude update')
  })

  test('release senza compat.json (prima della 0.3.0): nessun vincolo', async () => {
    const world = installed({ source: URL_SOURCE, local: { version: '0.2.0' }, remote: { version: '0.3.0' } })

    expect((await checkForUpdates(world.tracker, auto)).kind).toBe('installato')
  })

  test('ref e sottocartella del catalogo (git-subdir)', async () => {
    const world = installed({ source: { source: 'git-subdir', url: 'https://gitlab.azienda.it/tools/mono.git', path: 'plugins/kpi', ref: 'stabile' }, remote: { version: '0.3.1' } })

    await checkForUpdates(world.tracker, auto)
    expect(world.runs).toContainEqual(gitFetch('https://gitlab.azienda.it/tools/mono.git', 'stabile'))
    expect(world.runs).toContainEqual(gitShow('plugins/kpi/.claude-plugin/plugin.json'))
  })

  test('plugin e marketplace rinominati: si aggiorna con i loro nomi', async () => {
    const world = installed({ marketplace: 'azienda', plugin: 'kpi-aziendale', source: URL_SOURCE, remote: { version: '0.3.1' } })

    expect((await checkForUpdates(world.tracker, auto)).kind).toBe('installato')
    expect(world.runs[0]).toEqual([EXEC, 'plugin', 'marketplace', 'update', 'azienda'])
    expect(world.runs.at(-1)).toEqual([EXEC, 'plugin', 'update', 'kpi-aziendale@azienda'])
  })

  test('commit fissato o fonte npm: il marketplace decide, nessun errore né avviso', async () => {
    for (const source of [{ source: 'url', url: REPO, sha: 'abcdef1234567890' }, { source: 'npm', package: 'kpi-tracker' }]) {
      const world = installed({ source, remote: { version: '0.3.1' } })
      const outcome = await checkForUpdates(world.tracker, auto)

      expect(outcome.kind).toBe('esterno')
      expect(world.runs).toEqual([MARKETPLACE_UPDATE])
      expect(world.toasts).toEqual([])
      expect(await loadState(world.host)).toMatchObject({ failures: 0, nextAt: T0 + CHECK_EVERY_MS })
      expect(await updateReport(world.tracker, world.host, outcome)).toContain(source.source === 'npm' ? 'fonte npm' : 'al commit abcdef123456')
    }
  })

  test('repo irraggiungibile: errore silenzioso con la prima riga di git', async () => {
    const world = installed({ source: URL_SOURCE, failFetch: "fatal: could not read Username for 'https://github.com': terminal prompts disabled\n" })

    expect(await checkForUpdates(world.tracker, auto)).toEqual({ kind: 'errore', error: "fatal: could not read Username for 'https://github.com': terminal prompts disabled" })
    expect(world.toasts).toEqual([])
    expect(world.logs).toEqual([])
  })
})

describe('avvio', () => {
  test('versione in uso che vuole un Claude Code più recente: avviso una volta, controllo programmato', async () => {
    const world = installed({ local: { version: '0.3.0', minClaudeCode: '2.1.300' } })

    await startUpdates(world.tracker)
    expect(noticeOf(world.tracker)?.band).toContain('richiede Claude Code ≥ 2.1.300 (in uso 2.1.299)')
    expect(world.toasts).toHaveLength(1)
    expect(world.logs).toHaveLength(1)
    expect(world.timers.map(timer => timer.ms)).toEqual([CHECK_DELAY_MS])

    await startUpdates(world.tracker)
    expect(world.toasts).toHaveLength(1)

    world.env.engine = '2.1.300'
    await startUpdates(world.tracker)
    expect(world.tracker.update.self).toBe(null)
  })

  test('una release bloccata già vista torna nella barra senza ricontrollare', async () => {
    const first = installed({ remote: { version: '0.4.0', minClaudeCode: '2.1.310' } })

    await checkForUpdates(first.tracker, auto)

    const next = installed()

    next.store.set('update', first.store.get('update'))
    await startUpdates(next.tracker)
    expect(noticeOf(next.tracker)?.band).toContain('kpi-tracker 0.4.0 richiede Claude Code ≥ 2.1.310')
    expect(next.runs).toEqual([])
    expect(next.toasts).toEqual([])
  })
})

describe('nel plugin', () => {
  test('da una cartella: /kpi aggiorna non lancia comandi e lo spiega', IT, async ($, on) => {
    const world = worldOf(on)
    const clock = mock.clock(on)

    await $.session.start(SESSION)
    await clock.advance(CHECK_DELAY_MS + 1000)

    const result = await $.command.run(command('kpi', 'aggiorna'))

    expect(result.text).toContain('--plugin-dir')
    expect(world.runs.some(argv => argv.includes('plugin'))).toBe(false)
  })

  test('versione che richiede un Claude Code più recente: barra, /kpi, toast e transcript', IT, async ($, on) => {
    const world = worldOf(on, { release: { version: '0.3.0', minClaudeCode: '9.0.0' } })
    const clock = mock.clock(on)

    on('ui.render', ($$, e) => ({ type: 'Text', children: [e.component === 'CommandOutput' ? (e.props as { text: string }).text : 'motore'] }))
    await $.session.start(SESSION)
    await clock.advance(1000)

    expect(textOf(await $.ui.render(BAND))).toContain('⚠ kpi-tracker 0.3.0 richiede Claude Code ≥ 9.0.0 (in uso 2.1.296)')
    expect(world.toasts.filter(text => text.includes('9.0.0'))).toHaveLength(1)
    expect(world.logs.filter(text => text.includes('9.0.0'))).toHaveLength(1)

    for (const bodyColumns of [40, 70, 100, 140]) {
      const mounted = await $.ui.mount({ ...BAND, plugin: 'kpi-tracker', props: { ...BAND.props, bodyColumns } } as never)

      await (mounted as unknown as { unmount: () => Promise<void> }).unmount()
    }

    const summary = (await $.command.run(command('kpi'))) as { text: string }
    const drawn = textOf(await $.ui.render(commandOutput(summary.text)))

    expect(drawn).toContain('## KPI di Claude Code')
    expect(drawn).toContain('> ⚠ Questa versione di kpi-tracker (0.3.0) richiede Claude Code ≥ 9.0.0')
  })
})

describe('lingua di chi aggiorna dalla 0.3.0', () => {
  /** Il primo evento di una sessione: la 0.3.0 non scriveva `sw`, dalla 0.4.0 c'è sempre. */
  const segStart = (version: '0.3.0' | '0.4.0'): string =>
    JSON.stringify({ q: 1, t: T0, e: 'seg.start', seg: 's01-148a', src: 'startup', ver: '2.1.299', kind: 'interattiva', tz: 0, cost0: 0, ...(version === '0.4.0' && { sw: 0 }) })

  /**
   * Un host con i dati KPI scritti da una versione (`null` = nessun dato), con
   * o senza `language` nei settings, installato da marketplace o da una cartella.
   */
  function migrating(options: { data: '0.3.0' | '0.4.0' | null; language?: string; dev?: boolean }) {
    const root = `${CONFIG}/kpi`
    const session = `${root}/-work-progetto/2026-10-14_11-47-27_62c3ba6f`
    const files = new Map<string, string>(
      options.data === null
        ? []
        : [
            [`${root}/_meta/kpi-root.json`, '{}'],
            [`${session}/events/s01-148a-0001.jsonl`, `${segStart(options.data)}\n`],
          ],
    )
    const store = new Map<string, unknown>()
    const sets: [string, string][] = []
    const host = {
      fs: {
        list: async (path: string) => {
          const entries = new Map<string, string>()

          for (const file of files.keys()) {
            if (file.startsWith(`${path}/`)) {
              const [name = '', ...rest] = file.slice(path.length + 1).split('/')

              entries.set(name, rest.length > 0 ? 'dir' : 'file')
            }
          }

          if (entries.size === 0) {
            throw new Error(`ENOENT: ${path}`)
          }

          return [...entries].map(([name, kind]) => ({ name, kind }))
        },
        read: async (path: string) => {
          const text = files.get(path)

          if (text === undefined) {
            throw new Error(`ENOENT: ${path}`)
          }

          return text
        },
      },
      now: async () => T0,
      storeGet: async (key: string) => store.get(key),
      storeSet: async (key: string, value: unknown) => {
        store.set(key, value)
      },
      settingsRead: async (key: string) =>
        key === 'pluginConfigs' ? { [`kpi-tracker@${MKT}`]: { options: { autoUpdate: 'auto', ...(options.language !== undefined && { language: options.language }) } } } : undefined,
      configKeys: async () => ['theme', 'kpi-tracker.language', 'kpi-tracker.dataDir'],
      configSet: async (key: string, value: string) => {
        sets.push([key, value])

        return {}
      },
      pluginName: 'kpi-tracker',
      pluginRoot: options.dev === true ? '/src/kpi-tracker' : `${CONFIG}/plugins/cache/${MKT}/kpi-tracker/0.4.0`,
    } as unknown as Host

    return { host, root, store, sets }
  }

  test('con dati e lingua mai scelta resta in italiano, una volta sola', async () => {
    const { host, root, sets } = migrating({ data: '0.3.0' })

    expect(await keepsItalian(host, root)).toBe(true)
    expect(await setItalian(host)).toBe(true)
    expect(sets).toEqual([['kpi-tracker.language', 'it']])
    expect(await keepsItalian(host, root)).toBe(false)
  })

  test('installazione nuova, lingua già scelta o cartella di sviluppo: niente da fare', async () => {
    for (const options of [{ data: null }, { data: '0.3.0', language: 'en' }, { data: '0.3.0', dev: true }] as const) {
      const { host, root, store } = migrating(options)

      expect(await keepsItalian(host, root)).toBe(false)
      // Il controllo si segna comunque: una sessione successiva con dati non lo rifà.
      expect(store.has(LANGUAGE_KEY)).toBe(true)
    }
  })

  test('dati scritti solo dalla 0.4.0 in poi, anche da sessioni -p prima della prima interattiva: resta in inglese', async () => {
    const { host, root, sets } = migrating({ data: '0.4.0' })

    expect(await keepsItalian(host, root)).toBe(false)
    expect(sets).toEqual([])
  })
})
