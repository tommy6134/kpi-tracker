/** La guida di /kpi, in italiano e in inglese. Ogni comando e opzione si scrive in entrambe le lingue. */

import type { Lang } from '../i18n'

const IT = `## /kpi · guida

| Comando | Cosa fa |
| --- | --- |
| \`/kpi\` | Riepilogo: sessione corrente, oggi, ultimi 7 giorni |
| \`/kpi live\` (\`pannello\`) | Apre il pannello con i KPI della sessione |
| \`/kpi barra on\\|off\` (\`band\`) | Attiva o disattiva la barra sopra il prompt, in modo permanente |
| \`/kpi statistiche [filtri] [--per X]\` (\`stats\`) | Tutti i KPI dell'insieme filtrato; \`--per\` giorno, settimana, mese, progetto, modello, branch, tipo, sessione |
| \`/kpi sessioni [filtri] [--limite 20]\` (\`sessions\`) | Elenco delle sessioni |
| \`/kpi progetti [filtri]\` (\`projects\`) | Totali per progetto |
| \`/kpi sessione <id\\|corrente>\` (\`session\`) | Dettaglio di una sessione |
| \`/kpi report [filtri] [--no-apri]\` | Dashboard HTML offline, aperta nel browser |
| \`/kpi esporta csv\\|json [filtri] [--livello sessioni\\|giorni\\|turni\\|eventi] [--standard\\|--excel]\` (\`export\`) | Esporta i dati (CSV per Excel italiano in italiano, standard in inglese; \`--standard\` o \`--excel\` lo scelgono) |
| \`/kpi pulisci --piu-vecchie-di 180d [--si]\` (\`prune --older-than\`) | Elenca (e con \`--si\` cancella) le sessioni più vecchie |
| \`/kpi ricostruisci [filtri]\` (\`rebuild\`) | Ricalcola i KPI dagli eventi grezzi |
| \`/kpi aggiorna [--verifica]\` (\`update --check\`) | Controlla gli aggiornamenti e installa l'ultima versione se il tuo Claude Code la supporta; \`--verifica\` controlla soltanto |
| \`/kpi aiuto\` (\`help\`) | Questa guida |

**Filtri** (ripetibili, anche con valori separati da virgola):
\`--progetto <testo|.>\` (\`.\` = progetto corrente) · \`--sessione <id>\` · \`--da\` / \`--a\` (\`oggi\`, \`ieri\`, \`7d\`, \`24h\`, \`2w\`, \`3m\`, \`2026-10-01\`, \`01/10/2026\` giorno/mese/anno) · \`--modello <testo>\` · \`--tipo interattiva|print|sdk|desktop|vscode\` · \`--branch <testo>\` · \`--repo <testo>\`.

**Lingua:** \`--lingua it|en\` (\`--lang\`) sceglie la lingua di report, export e testi di questo comando; senza, vale quella della configurazione (\`/config\`).
Ogni comando e opzione ha anche il nome inglese: \`--project\`, \`--since\`, \`--until\`, \`--model\`, \`--kind\`, \`--by\`, \`--limit\`, \`--level\`, \`--no-open\`, \`--yes\`, \`--check\`.

**Contesto:** il report lo vedi solo tu; a Claude arriva una riga breve. Con \`--ctx\` il report completo va anche a Claude, per fargli analizzare i KPI.`

const EN = `## /kpi · help

| Command | What it does |
| --- | --- |
| \`/kpi\` | Summary: current session, today, last 7 days |
| \`/kpi live\` (\`panel\`) | Opens the panel with the session's KPIs |
| \`/kpi band on\\|off\` | Turns the band above the prompt on or off, permanently |
| \`/kpi stats [filters] [--by X]\` | Every KPI of the filtered set; \`--by\` day, week, month, project, model, branch, kind, session |
| \`/kpi sessions [filters] [--limit 20]\` | List of sessions |
| \`/kpi projects [filters]\` | Totals per project |
| \`/kpi session <id\\|current>\` | Detail of one session |
| \`/kpi report [filters] [--no-open]\` | Offline HTML dashboard, opened in the browser |
| \`/kpi export csv\\|json [filters] [--level sessions\\|days\\|turns\\|events] [--standard\\|--excel]\` | Exports the data (standard CSV in English, Italian Excel CSV in Italian; \`--standard\` or \`--excel\` choose) |
| \`/kpi prune --older-than 180d [--yes]\` | Lists (and with \`--yes\` deletes) the older sessions |
| \`/kpi rebuild [filters]\` | Recomputes the KPIs from the raw events |
| \`/kpi update [--check]\` | Checks for updates and installs the latest version if your Claude Code supports it; \`--check\` only checks |
| \`/kpi help\` | This help |

**Filters** (repeatable, also with comma-separated values):
\`--project <text|.>\` (\`.\` = current project) · \`--session <id>\` · \`--since\` / \`--until\` (\`today\`, \`yesterday\`, \`7d\`, \`24h\`, \`2w\`, \`3m\`, \`2026-10-01\`, \`01/10/2026\` day/month/year) · \`--model <text>\` · \`--kind interactive|print|sdk|desktop|vscode\` · \`--branch <text>\` · \`--repo <text>\`.

**Language:** \`--lang it|en\` picks the language of reports, exports and this command's text; without it, the one in the configuration (\`/config\`) applies.
Every command and option also has its Italian name (\`statistiche\`, \`esporta\`, \`--da\`, \`--progetto\`…).

**Context:** only you see the report; Claude gets a short line. With \`--ctx\` the full report goes to Claude too, so it can analyse your KPIs.`

/** La guida nella lingua data. */
export const helpOf = (lang: Lang): string => (lang === 'en' ? EN : IT)
