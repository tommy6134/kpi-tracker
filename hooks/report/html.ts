/**
 * Il report HTML: un unico file offline con i dati incorporati (colonnari,
 * stringhe ripetute in dizionari) e l'app in JS puro che li filtra e li
 * disegna. Gli asset (template, stile, script) stanno in assets/report/ e si
 * leggono dal plugin; niente CDN.
 */

import { percentileOf } from '../analysis/stats'
import { fileUrlOf, join } from '../core/paths'
import { displayStatus } from '../core/session-file'
import type { HostFs } from '../host'
import { i18nOf, type Lang } from '../i18n'
import { CODES_EN } from '../i18n/codes'
import { NO_CATEGORY_GROUP, type Categories } from '../query/category'
import { describeFilter, type KpiFilter } from '../query/filters'
import type { SessionRow } from '../query/load'

/** Limite del dato incorporato (il file si scrive con `$.fs.write`, massimo 4 MiB). */
export const DATA_BUDGET = 3_500_000

/**
 * `lang` è la lingua con cui si apre il report; la pagina passa all'altra
 * senza rigenerarlo. `folders` sono le cartelle di report ed export, che la
 * pagina mostra con un link e il comando per aprirle nel file manager.
 * `categories`, se attive, aggiunge filtro e colonna della categoria.
 */
export type ReportMeta = { lang: Lang; generatedAt: number; filter: KpiFilter; folders?: { report: string; export: string | null }; categories?: Categories | null }

/** Le cartelle per la pagina: percorsi, URL `file://` e il comando `/kpi` che le apre, nelle due lingue. */
function foldersOf(folders: NonNullable<ReportMeta['folders']>) {
  const one = (path: string, it: string, en: string) => ({ path, url: fileUrlOf(path), command: { it: `/kpi cartella ${it}`, en: `/kpi folder ${en}` } })

  return { report: one(folders.report, 'report', 'report'), ...(folders.export !== null && { export: one(folders.export, 'esporta', 'export') }) }
}

type Dict = { list: string[]; index: Map<string, number> }

const newDict = (): Dict => ({ list: [], index: new Map() })

function idx(dict: Dict, value: string): number {
  let position = dict.index.get(value)

  if (position === undefined) {
    position = dict.list.length
    dict.list.push(value)
    dict.index.set(value, position)
  }

  return position
}

const r6 = (value: number): number => Math.round(value * 1e6) / 1e6

/** La descrizione del filtro in entrambe le lingue, per il selettore della pagina. */
const descriptionsOf = (filter: KpiFilter): Record<Lang, string> => ({ it: describeFilter(i18nOf('it'), filter), en: describeFilter(i18nOf('en'), filter) })

/** Il dataset del report. */
export function datasetOf(rows: readonly SessionRow[], meta: ReportMeta): { data: Record<string, unknown>; trimmed: boolean } {
  const dicts = {
    projects: newDict(),
    paths: newDict(),
    kinds: newDict(),
    models: newDict(),
    branches: newDict(),
    repos: newDict(),
    tools: newDict(),
    cats: newDict(),
    cmds: newDict(),
    exts: newDict(),
    classes: newDict(),
    agents: newDict(),
    skills: newDict(),
    commands: newDict(),
    mcp: newDict(),
    stops: newDict(),
    errors: newDict(),
    origins: newDict(),
    decisions: newDict(),
    domains: newDict(),
    categories: newDict(),
  }
  const categories = meta.categories ?? null
  const now = meta.generatedAt
  const sessions: unknown[] = []
  const maps: unknown[] = []
  const days: unknown[] = []

  rows.forEach((row, index) => {
    const file = row.file
    const s = file.summary
    const project = idx(dicts.projects, row.projectName)

    idx(dicts.paths, row.projectPath)

    sessions.push([
      file.sessionId,
      project,
      idx(dicts.paths, row.projectPath),
      idx(dicts.kinds, file.kind),
      file.createdAt,
      s.lastAt || file.updatedAt,
      displayStatus(file, now),
      file.meta.branches.map(branch => idx(dicts.branches, branch)),
      [...new Set([...file.meta.models, ...Object.keys(s.byModel)])].map(model => idx(dicts.models, model)),
      file.meta.repo === null ? -1 : idx(dicts.repos, file.meta.repo.name ?? file.meta.repo.remote ?? file.meta.repo.root),
      s.segments,
      s.context.maxPct,
      s.rate.five_hour?.max ?? -1,
      s.rate.seven_day?.max ?? -1,
      s.compactions.n,
      s.agents.n,
      s.git.pushes,
      Object.values(s.git.prs).reduce((a, b) => a + b, 0),
      s.tests.ok,
      s.tests.err,
      s.builds.ok,
      s.builds.err,
      s.files.created,
      s.files.uniqueModified,
      s.files.uniqueRead,
      s.turns.sub,
      Math.round(percentileOf(s.requests.ttft, 0.5)),
      s.perms.byDecision.allow ?? 0,
      s.perms.byDecision.ask ?? 0,
      s.perms.toolDenied,
      s.perms.dialogs,
      s.errors.turnErr,
      s.errors.interrupts,
      s.errors.refusals,
      file.meta.versions.at(-1) ?? '',
      r6(s.cost.outsideTurns ?? 0),
      s.perms.rejected ?? 0,
      s.perms.denied,
      // Le sessioni senza categoria hanno la loro voce, così il filtro le può scegliere.
      categories === null ? -1 : idx(dicts.categories, categories.of(file) ?? NO_CATEGORY_GROUP),
    ])

    maps.push({
      t: Object.entries(s.tools.byTool).map(([name, agg]) => [idx(dicts.tools, name), agg.n, agg.err, Math.round(agg.ms.sum), agg.ms.n]),
      c: Object.entries(s.bash.byCat).map(([cat, agg]) => [idx(dicts.cats, cat), agg.n, agg.ok, agg.err]),
      b: Object.entries(s.bash.byCmd).map(([cmd, agg]) => [idx(dicts.cmds, cmd), agg.n, agg.ok, agg.err]),
      m: Object.entries(s.byModel).map(([model, agg]) => [idx(dicts.models, model), agg.req, agg.in, agg.out, agg.cr, agg.cw]),
      x: Object.entries(s.files.byExt).map(([ext, agg]) => [idx(dicts.exts, ext), agg.n, agg.add, agg.del]),
      k: Object.entries(s.files.byClass).map(([cls, agg]) => [idx(dicts.classes, cls), agg.add, agg.del]),
      a: Object.entries(s.agents.byType).map(([type, agg]) => [idx(dicts.agents, type), agg.n, Math.round(agg.ms), agg.tok, agg.tools, agg.err]),
      s: Object.entries(s.skills).map(([name, agg]) => [idx(dicts.skills, name), agg.n]),
      o: Object.entries(s.commands).map(([name, count]) => [idx(dicts.commands, name), count]),
      p: Object.entries(s.tools.mcp).map(([name, agg]) => [idx(dicts.mcp, name), agg.n, agg.err]),
      r: Object.entries(s.requests.byStop).map(([name, count]) => [idx(dicts.stops, name), count]),
      e: Object.entries(s.errors.api).map(([name, count]) => [idx(dicts.errors, name), count]),
      g: Object.entries(s.prompts.byOrigin).map(([name, count]) => [idx(dicts.origins, name), count]),
      w: Object.entries(s.web.domains).map(([name, count]) => [idx(dicts.domains, name), count]),
      d: s.turns.dur.h,
      h: s.byHour.map((count, slot) => [slot, count]).filter(pair => (pair[1] ?? 0) > 0),
    })

    for (const [day, agg] of Object.entries(s.byDay)) {
      days.push([index, day, r6(agg.cost), agg.in, agg.out, agg.cr, agg.cw, agg.turns, Math.round(agg.active), agg.prompts, agg.req, agg.tools, agg.toolErr, agg.add, agg.del, agg.commits])
    }
  })

  const data: Record<string, unknown> = {
    v: 1,
    meta: {
      lang: meta.lang,
      description: descriptionsOf(meta.filter),
      generatedAt: meta.generatedAt,
      sessions: rows.length,
      ...(meta.folders !== undefined && { folders: foldersOf(meta.folders) }),
      ...(categories !== null && { category: categories.column }),
    },
    dict: Object.fromEntries(Object.entries(dicts).map(([name, dict]) => [name, dict.list])),
    codes: CODES_EN,
    sessions,
    maps,
    days,
  }

  // Oltre il budget si tolgono le mappe delle sessioni più vecchie (le righe e i giorni restano).
  let trimmed = false
  let size = JSON.stringify(data).length

  for (let index = 0; size > DATA_BUDGET && index < maps.length; index += 1) {
    const before = JSON.stringify(maps[index]).length

    maps[index] = null
    size -= before - 4
    trimmed = true
  }

  ;(data.meta as Record<string, unknown>).trimmed = trimmed

  return { data, trimmed }
}

/** JSON sicuro dentro `<script>`: niente `</` né separatori di riga JavaScript. */
export function embedJson(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029')
}

/** Escape per testo HTML. */
export function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/** Legge un asset del report; `null` se manca. */
async function asset(fs: HostFs, pluginRoot: string, name: string): Promise<string | null> {
  try {
    return await fs.read(join(pluginRoot, 'assets', 'report', name))
  } catch {
    return null
  }
}

/** Assembla l'HTML: template + stile + dati + app. */
export function assemble(template: string, style: string, app: string, data: Record<string, unknown>, title: string, lang: Lang = 'it'): string {
  // Sostituzione con funzione: nessuna interpretazione dei `$` nei contenuti.
  return template
    .replace('__LANG__', () => lang)
    .replace('__TITLE__', () => escapeHtml(title))
    .replace('/*__STYLE__*/', () => style)
    .replace('__DATA__', () => embedJson(data))
    .replace('/*__APP__*/', () => app.replace(/<\/script/gi, '<\\/script'))
}

/** Il report completo pronto da scrivere. */
export async function buildReport(fs: HostFs, pluginRoot: string, rows: readonly SessionRow[], meta: ReportMeta): Promise<{ html: string; trimmed: boolean }> {
  const { data, trimmed } = datasetOf(rows, meta)
  const [template, style, app] = await Promise.all([asset(fs, pluginRoot, 'template.html'), asset(fs, pluginRoot, 'style.css'), asset(fs, pluginRoot, 'app.js')])
  const L = i18nOf(meta.lang)
  const title = `KPI Claude Code · ${describeFilter(L, meta.filter)}`

  if (template === null || style === null || app === null) {
    return {
      html: `<!doctype html><html lang="${meta.lang}"><meta charset="utf-8"><title>${escapeHtml(title)}</title><body><h1>${escapeHtml(title)}</h1><p>${escapeHtml(L.t('Asset del report non trovati in {dir}: dati grezzi qui sotto.', { dir: `${pluginRoot}/assets/report` }))}</p><script type="application/json" id="kpi-data">${embedJson(data)}</script></body></html>`,
      trimmed,
    }
  }

  return { html: assemble(template, style, app, data, title, meta.lang), trimmed }
}
