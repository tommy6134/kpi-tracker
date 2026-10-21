/** La guida di /kpi. */

export const HELP = `## /kpi · guida

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
| \`/kpi esporta csv\\|json [filtri] [--livello sessioni\\|giorni\\|turni\\|eventi] [--standard]\` (\`export\`) | Esporta i dati (CSV per Excel italiano; \`--standard\` per il CSV classico) |
| \`/kpi pulisci --piu-vecchie-di 180d [--si]\` (\`prune --older-than\`) | Elenca (e con \`--si\` cancella) le sessioni più vecchie |
| \`/kpi ricostruisci [filtri]\` (\`rebuild\`) | Ricalcola i KPI dagli eventi grezzi |
| \`/kpi aiuto\` (\`help\`) | Questa guida |

**Filtri** (ripetibili, anche con valori separati da virgola):
\`--progetto <testo|.>\` (\`.\` = progetto corrente) · \`--sessione <id>\` · \`--da\` / \`--a\` (\`oggi\`, \`ieri\`, \`7d\`, \`24h\`, \`2w\`, \`3m\`, \`2026-10-01\`, \`01/10/2026\`) · \`--modello <testo>\` · \`--tipo interattiva|print|sdk\` · \`--branch <testo>\` · \`--repo <testo>\`.
Ogni opzione ha anche il nome inglese: \`--project\`, \`--since\`, \`--until\`, \`--model\`, \`--kind\`, \`--by\`, \`--limit\`.

**Contesto:** il report lo vedi solo tu; a Claude arriva una riga breve. Con \`--ctx\` il report completo va anche a Claude, per fargli analizzare i KPI.`
