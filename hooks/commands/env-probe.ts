/**
 * `/kpi ambiente`: cosa vede kpi-tracker di dove gira (CLI, app desktop,
 * Cowork) e di dove scrive. In Cowork lo stesso JSON si scrive a ogni avvio
 * in `_meta/ambiente-cowork.json`, così si trova su disco anche dove `/kpi`
 * non si può lanciare.
 */

import { join, META_DIR, ROOT_MARKER } from '../core/paths'
import type { Host } from '../host'
import type { I18n } from '../i18n'
import { kindOf, type Tracker } from '../tracker'

export type EnvProbe = {
  at: string
  claudeCode: string
  plugin: { name: string; root: string }
  kind: string
  cowork: string | null
  entrypoint: string | null
  remoteEnvironment: string | null
  interactive: boolean | null
  surfaces: string[]
  env: { HOME: string | null; USERPROFILE: string | null; CLAUDE_CONFIG_DIR: string | null }
  session: { cwd: string | null; root: string | null; project: string | null; repo: string | null }
  addedDirectories: string[]
  cliOptions: string | null
  dataRoot: string | null
  dataRootFallback: string | null
  dataRootMarked: boolean | null
  kpiCommand: boolean | null
}

const orNull = (value: string | undefined): string | null => (value === undefined || value.trim() === '' ? null : value)

/** Raccoglie la sonda; ogni lettura che fallisce dà `null` o una lista vuota, mai un errore. */
export async function probeOf(tracker: Tracker, host: Host): Promise<EnvProbe> {
  const [version, surfaces, cwd, root, repo, permissions, commands, marked] = await Promise.all([
    host.version().catch(() => null),
    host.surfaces().catch(() => []),
    host.sessionCwd().catch(() => null),
    host.sessionRoot().catch(() => null),
    host.repo().catch(() => null),
    host.settingsRead('permissions').catch(() => undefined) as Promise<{ additionalDirectories?: unknown } | undefined>,
    host.commandNames().catch(() => null),
    tracker.root === null ? Promise.resolve(null) : host.fs.exists(join(tracker.root, ROOT_MARKER)).catch(() => null),
  ])
  const added = permissions?.additionalDirectories
  const env = tracker.env

  return {
    at: new Date(await host.now().catch(() => Date.now())).toISOString(),
    claudeCode: version?.version ?? '–',
    plugin: { name: host.pluginName, root: host.pluginRoot },
    kind: kindOf(tracker.interactive, tracker.surface, env.CLAUDE_CODE_ENTRYPOINT, tracker.cowork),
    cowork: tracker.cowork,
    entrypoint: orNull(env.CLAUDE_CODE_ENTRYPOINT),
    remoteEnvironment: orNull(env.CLAUDE_CODE_REMOTE_ENVIRONMENT_TYPE),
    interactive: tracker.interactive,
    surfaces: [...surfaces],
    env: { HOME: orNull(env.HOME), USERPROFILE: orNull(env.USERPROFILE), CLAUDE_CONFIG_DIR: orNull(env.CLAUDE_CONFIG_DIR) },
    session: { cwd, root, project: tracker.launchCwd, repo: repo?.root ?? tracker.store?.file.meta.repo?.root ?? null },
    addedDirectories: Array.isArray(added) ? added.filter((dir): dir is string => typeof dir === 'string') : [],
    cliOptions: tracker.cliOptions,
    dataRoot: tracker.root,
    dataRootFallback: tracker.rootFallback,
    dataRootMarked: marked,
    kpiCommand: commands === null ? null : commands.some(name => name === 'kpi' || name.endsWith(':kpi')),
  }
}

/** Il JSON della sonda in `<radice>/_meta/ambiente-<tipo>.json`, sovrascritto a ogni avvio. */
export async function writeProbe(tracker: Tracker, host: Host): Promise<void> {
  const root = tracker.root

  if (root === null) {
    return
  }

  const probe = await probeOf(tracker, host)

  await host.fs.write(join(root, META_DIR, `ambiente-${probe.kind}.json`), `${JSON.stringify(probe, null, 2)}\n`)
}

const code = (value: string | null): string => (value === null ? '–' : `\`${value}\``)

const yesNo = (L: I18n, value: boolean | null): string => (value === null ? '–' : value ? L.t('sì') : L.t('no'))

/** La sonda come tabella per /kpi ambiente. */
export function probeText(L: I18n, probe: EnvProbe): string {
  const rows: [string, string][] = [
    [L.t('Tipo di sessione'), `${L.code(probe.kind)}${probe.cowork === null ? '' : ` (Cowork: ${probe.cowork})`}`],
    ['Claude Code', probe.claudeCode],
    ['CLAUDE_CODE_ENTRYPOINT', code(probe.entrypoint)],
    ['CLAUDE_CODE_REMOTE_ENVIRONMENT_TYPE', code(probe.remoteEnvironment)],
    [L.t('Interattiva'), yesNo(L, probe.interactive)],
    [L.t('Superfici'), probe.surfaces.length === 0 ? '–' : probe.surfaces.join(', ')],
    ['HOME', code(probe.env.HOME)],
    ['USERPROFILE', code(probe.env.USERPROFILE)],
    ['CLAUDE_CONFIG_DIR', code(probe.env.CLAUDE_CONFIG_DIR)],
    [L.t('Cartella di lavoro'), code(probe.session.cwd)],
    [L.t('Radice della sessione'), code(probe.session.root)],
    [L.t('Progetto KPI'), code(probe.session.project)],
    ['Repo', code(probe.session.repo)],
    [L.t('Cartelle aggiunte'), probe.addedDirectories.length === 0 ? '–' : probe.addedDirectories.map(dir => `\`${dir}\``).join(', ')],
    [L.t('Opzioni dalla CLI'), code(probe.cliOptions)],
    [L.t('Cartella dati'), code(probe.dataRoot)],
    [L.t('Marcatore della cartella dati'), yesNo(L, probe.dataRootMarked)],
    [L.t('Cartella dati non scrivibile'), code(probe.dataRootFallback)],
    [L.t('Comando /kpi registrato'), yesNo(L, probe.kpiCommand)],
    ['Plugin', `${probe.plugin.name} · \`${probe.plugin.root}\``],
  ]

  return [`## ${L.t('Ambiente di kpi-tracker')}`, '', `| ${L.t('Voce')} | ${L.t('Valore')} |`, '| --- | --- |', ...rows.map(([label, value]) => `| ${label} | ${value} |`)].join('\n')
}
