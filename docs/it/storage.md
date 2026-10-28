# Formati su disco

_English: [docs/storage.md](../storage.md)_

## Radice

`<configDir>/kpi/`, dove `<configDir>` è `$CLAUDE_CONFIG_DIR` se definita, altrimenti `$HOME/.claude` (`%USERPROFILE%\.claude` su Windows). L'opzione `dataDir` la sostituisce.

| Percorso | Contenuto |
| --- | --- |
| `_meta/kpi-root.json` | marcatore della radice (`schemaVersion`, `plugin`, `createdAt`): la pulizia rifiuta di cancellare se manca |
| `categorie.json` o `categories.json` | regole facoltative delle categorie di attività, scritte da te (vedi il README): `/kpi` le legge, il plugin non le scrive mai |
| `_meta/upstream.git/` | repo git bare con l'ultimo commit del plugin, senza checkout: c'è solo se il marketplace indica il plugin con un URL, e serve agli aggiornamenti per leggere versione e `compat.json` (si può cancellare, si ricrea) |
| `_reports/report-<data-ora>.html`, `latest.html` | report HTML (nella cartella `reportDir`, se impostata). `/kpi cartella` crea la cartella, con un `.keep` vuoto, se non c'è ancora |
| `_exports/kpi_<nome>_<periodo>[_<livello>].csv\|json` | export (in parti `_parteN` oltre ~3,5 MB; nella cartella `reportDir`, se impostata, o nel file di `--out`). Il periodo è quello del filtro (`2026-11`, `2026-11-03`, `2026-09_2026-11`…) o, senza un periodo chiuso, la data e l'ora dell'export; livello e parti hanno il nome della lingua dell'export: `_giorni`, `_parte2` in italiano; `_days`, `_part2` in inglese. Fino alla 0.4.0: `kpi-<livello>-<data-ora>` |
| `<progetto>/project.json` | un progetto |
| `<progetto>/<sessione>/` | una sessione |

Le cartelle di servizio iniziano con `_`: un nome di progetto codificato contiene solo `[A-Za-z0-9-]`, quindi non collidono mai.

Unico file fuori dalla radice: su Linux, quando il report sta in una cartella nascosta, `/kpi report` ne scrive una copia in `$(xdg-user-dir DOWNLOAD)/kpi-report.html` (sovrascritta ogni volta) e apre quella, perché i browser snap e flatpak non leggono le cartelle nascoste della home.

## Progetto

Nome della cartella: il percorso di avvio con ogni carattere non alfanumerico sostituito da `-`, come fa Claude Code in `projects/`; oltre 200 caratteri si accorcia e si aggiunge un hash. La codifica non è reversibile (`/a/b-c` e `/a/b/c` danno lo stesso nome): se la cartella appartiene già a un altro percorso si usa `<nome>-<hash>`.

```jsonc
// project.json
{ "schemaVersion": 1, "path": "/Users/me/lavoro/app", "encoded": "-Users-me-lavoro-app", "name": "app",
  "firstSeenAt": 1791800000000, "lastSeenAt": 1791900000000, "repo": { "root": "…", "remote": "…", "name": "app" } }
```

## Sessione

Nome della cartella: `YYYY-MM-DD_HH-mm-ss_<primi 8 caratteri dell'id>`, in ora locale dall'inizio della sessione. Una ripresa (`--resume`) ritrova la cartella dal suffisso e verifica l'id in `session.json`.

### session.json

Metadati e KPI aggregati, riscritto a ogni salvataggio (5–20 KB):

| Campo | Significato |
| --- | --- |
| `sessionId`, `dir`, `project` | identità |
| `createdAt`, `updatedAt`, `heartbeatAt`, `tzOffsetMin` | tempi (ms epoch) e fuso |
| `status` | `active` o `ended`; un `active` senza heartbeat da 10 minuti si mostra come "interrotta" |
| `kind` e gli altri codici | restano in italiano su disco (`interattiva`, `ricarica`, `altro`…) qualunque sia la lingua: report ed export li traducono quando li mostrano |
| `kind`, `interactive` | tipo di sessione |
| `links` | `previousSessionId` / `nextSessionId` (catena di `/clear`) |
| `segments[]` | un elemento per processo: `id`, `source`, `startedAt`, `endedAt`, `endReason`, `version`, `lastSeq`, `chunks`, `costBaselineUsd` (il ledger del costo all'aggancio; la differenza dall'ultima lettura del segmento precedente si conta come costo fuori dai turni quando il ledger è della stessa sessione) |
| `meta` | `branches` (nell'ordine in cui sono stati attivi l'ultima volta: quello corrente è l'ultimo), `repo`, `models`, `versions`, `permissionModes` |
| `diag` | salvataggi, errori di scrittura, byte scritti |
| `summary` | tutti i KPI aggregati (vedi `hooks/analysis/summary-types.ts`); `summary.rv` è la versione del calcolo che l'ha prodotto (assente fino alla 0.4.0 = 1) |

### details.json

Dettagli illimitati (con tetti di sicurezza): `files` (per percorso assoluto: letture, modifiche, righe, classe), `turns` (ultimi 2.000 turni: durata, token, tool, errori, esito, costo, contesto), `agents`, `compactions`, `commits`, `prs`, `bashCmds`, `domains`, `switches`.

### events/

Gli eventi grezzi, **fonte di verità**: un file JSONL per segmento, ruotato oltre 512 KiB (`<segmento>-0001.jsonl`, `-0002.jsonl`…). Una riga per evento:

```json
{"q":12,"t":1791900000123,"e":"tool","id":"toolu_01…","tool":"Bash","st":"ok","wall":840,"x":{"k":"bash","cmds":["mvn test"],"cat":"test"}}
```

`q` è la sequenza nel segmento, `t` l'istante in ms, `a` l'id del subagent (se c'è), `e` il tipo. I tipi sono definiti in `hooks/core/events.ts`.

## Coerenza

- `$.fs.write` riscrive il file intero: ogni salvataggio fotografa insieme eventi in attesa, summary e `lastSeq`, poi scrive **prima i chunk e poi** `session.json`. Così `session.json` non conta mai eventi che non siano già su disco.
- Al riaggancio (ripresa, crash) gli eventi con `q > lastSeq` si rigiocano sul summary.
- `/kpi ricostruisci` rifà summary e dettagli da zero dagli eventi (anche dopo un cambio di `schemaVersion`).
- Quando una versione nuova cambia il calcolo (`summary.rv` più basso di quello del plugin), le sessioni passate si ricalcolano da sole dagli eventi: una volta, al primo avvio interattivo della versione nuova, con una riga nel transcript. Una sessione aperta in quel momento in un altro processo si ricalcola a un avvio successivo, quando è chiusa; una sessione ripresa si ricalcola all'aggancio. Un ricalcolo interrotto riparte dalle sessioni ancora da fare: subito se il plugin si è ricaricato nella stessa sessione (un'opzione cambiata in `/config`, `/reload-plugins`), altrimenti a un avvio dopo 10 minuti senza progressi (uscita, crash). Nel frattempo gli altri processi lo lasciano stare.
- Salvataggi: 250 ms dopo la fine di ogni turno, ogni 5 s se ci sono novità, heartbeat ogni 60 s, prima di `/kpi` e alla chiusura della sessione. In `claude -p` a ogni fine turno.
- Ogni processo scrive solo i propri chunk: due processi sulla stessa sessione non si sovrascrivono gli eventi.
