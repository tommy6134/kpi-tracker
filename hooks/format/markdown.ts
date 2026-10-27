/** Tabelle e sezioni Markdown per i report testuali di /kpi. */

import type { I18n } from '../i18n'

/** Toglie i caratteri che romperebbero una cella di tabella. */
export function cell(value: string | number): string {
  return String(value).replace(/\|/g, '\\|').replace(/\n/g, ' ')
}

/** Una tabella Markdown; `right` elenca gli indici delle colonne allineate a destra. */
export function table(L: I18n, headers: readonly string[], rows: readonly (readonly (string | number)[])[], right: readonly number[] = []): string {
  if (rows.length === 0) {
    return `_${L.t('nessun dato')}_`
  }

  const head = `| ${headers.map(cell).join(' | ')} |`
  const sep = `| ${headers.map((_, index) => (right.includes(index) ? '---:' : '---')).join(' | ')} |`
  const body = rows.map(row => `| ${row.map(cell).join(' | ')} |`)

  return [head, sep, ...body].join('\n')
}

/** Tabella a due colonne chiave/valore. */
export function pairs(L: I18n, rows: readonly (readonly [string, string | number])[]): string {
  return table(L, ['KPI', L.t('Valore')], rows, [1])
}

/** Una sezione con titolo. */
export function section(title: string, body: string): string {
  return `### ${title}\n\n${body}`
}
