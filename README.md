# kpi-tracker

Mod per **Claude Code CLI** che registra, salva e mostra **tutti i KPI misurabili** di utilizzo: token, costo, contesto, rate limit, richieste e latenza, turni, tool, comandi Bash, righe di codice, git, permessi, subagent, skill, errori.

I dati restano in locale, organizzati per **progetto** (cartella di avvio) e **sessione**. Si consultano in quattro modi:

- **barra live** sopra il prompt: costo, token, cache hit, contesto e rate limit della sessione;
- **pannello** con il dettaglio della sessione corrente (`/kpi live`);
- **`/kpi`**: report testuali con filtri per progetto, sessione, date, modello, tipo, branch e repo;
- **report HTML** offline con grafici e filtri interattivi (`/kpi report`), più **export** CSV/JSON.

Non salva mai il testo di prompt o risposte, né gli argomenti dei comandi: vedi [docs/privacy.md](docs/privacy.md).

Si aggiorna da solo, e solo a versioni compatibili con il tuo Claude Code: vedi [Aggiornamenti](#aggiornamenti).

> Richiede Claude Code **2.1.287 o successivo** (i mod sono attivi da quella versione; il minimo di ogni versione è in [`.claude-plugin/compat.json`](.claude-plugin/compat.json)). Sviluppato e provato su macOS (2.1.296), Linux (Ubuntu 25.10, 2.1.299) e Windows.

## Requisiti

- **Claude Code 2.1.287 o successivo** (CLI da terminale); il minimo esatto di ogni versione è in `.claude-plugin/compat.json`.
- **`git`** installato: Claude Code lo usa per scaricare il plugin da GitHub.

Nient'altro: niente Node, Python, npm né compilazione, il codice gira dentro Claude Code. Se `git` non c'è nel progetto o il browser non si apre, il plugin continua a funzionare (manca solo il branch nei metadati, e il report va aperto a mano).

## Installazione

Dal terminale, in una sessione di Claude Code:

```
/plugin install kpi-tracker --marketplace tommy6134/kpi-tracker
```

Rispondi `y` per aggiungere il marketplace e scegli lo scope **user**, così il tracker registra tutte le sessioni in tutti i progetti. Il plugin è attivo subito, anche nella sessione in cui lo installi.

In alternativa, in due passi (anche da shell con `claude plugin …`):

```
/plugin marketplace add tommy6134/kpi-tracker
/plugin install kpi-tracker@tommy6134
```

### App desktop (scheda Code)

I plugin installati da terminale con scope **user** si caricano anche nelle sessioni della scheda Code dell'app. In alternativa puoi caricare il plugin come zip dalle impostazioni dell'app (scarica lo zip della release da GitHub, oppure crealo con `git archive --format=zip -o kpi-tracker.zip HEAD`).

## Aggiornamenti

Dalla 0.3.0 kpi-tracker **si aggiorna da solo**. Una volta al giorno (e subito dopo che hai aggiornato Claude Code), una decina di secondi dopo l'avvio di una sessione interattiva, aggiorna il catalogo del marketplace e guarda se c'è una versione nuova:

- **compatibile** con il tuo Claude Code: la installa e te lo dice; si attiva con `/reload-plugins` o al prossimo avvio;
- **richiede un Claude Code più recente**: **non la installa** e ti avvisa (toast, riga nella barra, `/kpi` e transcript) con la versione richiesta. Aggiorna Claude Code con `claude update`: al primo avvio dopo l'aggiornamento il plugin si aggiorna.

Se la versione installata richiede un Claude Code più recente di quello in uso (per esempio dopo un aggiornamento manuale), il plugin continua a registrare quello che può e mostra lo stesso avviso.

`/kpi aggiorna` mostra lo stato (versione installata, ultima disponibile, Claude Code richiesto e in uso, ultimo controllo) e installa subito l'ultima versione se compatibile; `/kpi aggiorna --verifica` controlla soltanto. Il comportamento si sceglie con l'opzione `autoUpdate` (`auto`, `avviso`, `off`, vedi [Configurazione](#configurazione)). Se il controllo non riesce (rete assente, `git` mancante) si riprova dopo un'ora, in silenzio: dopo tre tentativi falliti compare una riga nel transcript.

> **Lascia spento l'aggiornamento automatico nativo** del marketplace (`/plugin` → Marketplaces, spento di default per i marketplace di terze parti): installa le versioni nuove senza controllare quale Claude Code richiedono. Se lo trovi acceso, kpi-tracker te lo segnala una volta e lascia fare a lui.

Gli aggiornamenti automatici funzionano da CLI (servono i comandi `claude plugin …`). Con `--plugin-dir` (sviluppo) sono disattivati.

**Marketplace propri** (per esempio un catalogo aziendale su GitLab): funzionano senza modifiche, anche con un altro nome di marketplace o di plugin e con qualunque `CLAUDE_CONFIG_DIR`. Il catalogo può indicare il plugin:

- con un percorso (`"source": "./"`, un mirror di questo repo): versione e `compat.json` si leggono dal clone del catalogo;
- con un repo git (`"source": { "source": "url", "url": "…" }`, `github` o `git-subdir`, con l'eventuale `ref`): si leggono con un `git fetch --depth 1` in `_meta/upstream.git` tra i dati KPI, usando le credenziali git già configurate (git non le chiede mai a terminale);
- con un commit fissato (`sha`) o da npm: le versioni le decide chi gestisce il catalogo, e il plugin non interviene.

**Dalla 0.2.0** serve un ultimo aggiornamento a mano, da shell:

```bash
claude plugin marketplace update tommy6134
claude plugin update kpi-tracker@tommy6134
```

Poi riavvia Claude Code (o `/reload-plugins` nelle sessioni aperte).

## Disinstallazione

Per disattivarlo o disinstallarlo: `/plugin`, scheda Installed, oppure `claude plugin uninstall kpi-tracker@tommy6134`. I dati raccolti restano in `<configurazione>/kpi/` finché non li cancelli.

## Dove finiscono i dati

```
<cartella di configurazione di Claude Code>/kpi/        es. ~/.claude/kpi/ oppure $CLAUDE_CONFIG_DIR/kpi/
  _meta/kpi-root.json
  _reports/            report HTML generati (oppure in reportDir)
  _exports/            export CSV/JSON (oppure in reportDir)
  -Users-nome-lavoro-progetto/                 un progetto (cartella di avvio, / e . diventano -)
    project.json                               percorso reale, repo
    2026-10-12_10-31-07_3f9a1c2e/              una sessione: data-ora locale + inizio dell'id
      session.json                             metadati e KPI aggregati
      details.json                             file toccati, turni, commit, PR, subagent…
      events/s01-7f3a-0001.jsonl               eventi grezzi (fonte di verità)
```

Il formato completo è in [docs/storage.md](docs/storage.md).

## Comandi

| Comando | Cosa fa |
| --- | --- |
| `/kpi` | Riepilogo: sessione corrente, oggi, ultimi 7 giorni |
| `/kpi live` | Pannello con i KPI della sessione |
| `/kpi barra on\|off` | Barra sopra il prompt, in modo permanente ("Nascondi" sulla barra vale per la sessione) |
| `/kpi statistiche [filtri] [--per giorno\|settimana\|mese\|progetto\|modello\|branch\|tipo\|sessione]` | Tutti i KPI dell'insieme filtrato |
| `/kpi sessioni [filtri] [--limite N]` | Elenco delle sessioni |
| `/kpi progetti [filtri]` | Totali per progetto |
| `/kpi sessione <id\|corrente>` | Dettaglio di una sessione |
| `/kpi report [filtri] [--no-apri]` | Dashboard HTML offline, aperta nel browser |
| `/kpi esporta csv\|json [filtri] [--livello sessioni\|giorni\|turni\|eventi] [--standard]` | Export (CSV per Excel italiano; `--standard` per `,` e `.`) |
| `/kpi pulisci --piu-vecchie-di 180d [--si]` | Elenca, e con `--si` cancella, le sessioni più vecchie |
| `/kpi ricostruisci [filtri]` | Ricalcola i KPI dagli eventi grezzi |
| `/kpi aggiorna [--verifica]` | Stato degli aggiornamenti; installa subito l'ultima versione se compatibile (`--verifica` controlla soltanto) |
| `/kpi aiuto` | Guida |

**Filtri:** `--progetto <testo|.>`, `--sessione <id>`, `--da` / `--a` (`oggi`, `ieri`, `7d`, `24h`, `2w`, `3m`, `2026-10-01`, `01/10/2026`), `--modello`, `--tipo interattiva|print|sdk`, `--branch`, `--repo`. Ogni sottocomando e opzione ha anche il nome inglese (`stats`, `sessions`, `export`, `prune`, `--since`, `--project`, `--by`…).

Il report di `/kpi` lo vedi solo tu: a Claude arriva una riga breve, così non consuma contesto. Con `--ctx` il report completo va anche a Claude, per esempio per fargli analizzare i tuoi KPI.

## Configurazione

Da `/config` (sezione del plugin) o in `settings.json` sotto `pluginConfigs`:

| Opzione | Default | Significato |
| --- | --- | --- |
| `dataDir` | `""` | Cartella dati assoluta (anche `~/…`); vuoto = `<configurazione>/kpi` |
| `reportDir` | `""` | Cartella assoluta (anche `~/…`) per report HTML ed export; vuoto = `_reports/` e `_exports/` nella cartella dati |
| `streamTiming` | `true` | Intercetta lo streaming delle risposte per TTFT, latenza e token per richiesta; spegnilo se noti rallentamenti |
| `autoUpdate` | `"auto"` | `auto` installa da solo le versioni nuove compatibili; `avviso` le segnala soltanto (installi con `/kpi aggiorna`); `off` nessun controllo automatico |

## Sviluppo

Il plugin è un **mod**: un modulo TypeScript che gira dentro Claude Code (`hooks/register.ts`). Non serve compilare né installare dipendenze.

```bash
claude plugin validate . --strict   # manifest, modulo, contratto di stato
claude plugin test .                # test (tests/*.test.ts) con fs, sessione e clock in memoria
claude --plugin-dir .               # una sessione con il mod caricato dal repo (hot reload ai salvataggi)
```

In sviluppo imposta `dataDir` su una cartella **fuori dal repo**: il repo è osservato per il hot reload, e scriverci i dati ricaricherebbe il modulo a ogni salvataggio. Per esempio, in `~/.claude/settings.json`:

```json
{ "pluginConfigs": { "kpi-tracker@inline": { "options": { "dataDir": "~/.claude/kpi-dev" } } } }
```

Struttura del codice:

| Cartella | Contenuto |
| --- | --- |
| `hooks/register.ts` | L'unico file che usa `$`: lega il motore (`hostOf`) e registra tutti gli hook |
| `hooks/tracker.ts` | Stato del modulo, aggancio delle sessioni, coda degli eventi, flush |
| `hooks/core/` | Percorsi, tempo, eventi, writer, aggancio e ripristino su disco |
| `hooks/collect/` | Traduzione dei risultati dei tool in metadati (mai testo) |
| `hooks/analysis/` | Reducer puro, statistiche, classificatore Bash, righe di codice, merge |
| `hooks/query/`, `hooks/commands/`, `hooks/format/` | Lettura con filtri, aggregati, `/kpi` e report testuali |
| `hooks/report/`, `assets/report/` | Report HTML (dataset + template, stile e app in JS puro) |
| `hooks/export/`, `hooks/maintenance/` | Export CSV/JSON, pulizia, ricostruzione |
| `hooks/ui/` | Barra, pannello, sparkline |
| `hooks/update/` | Aggiornamenti: confronto di versioni, installazione e catalogo del marketplace, lettura della release dai repo git, controllo di compatibilità |
| `types/index.d.ts` | Contratto di `$.state` |

### Pubblicare una versione

1. Aumenta `version` in `.claude-plugin/plugin.json`, altrimenti né gli aggiornamenti automatici né `claude plugin update` vedono nulla di nuovo.
2. Se il codice usa eventi o API del motore arrivati dopo il minimo attuale, alza `minClaudeCode` in `.claude-plugin/compat.json`. Claude Code non ha un campo per la versione minima e una versione che usa API assenti passa la validazione ma si rompe in silenzio: è questo file che impedisce alle installazioni con un Claude Code più vecchio di aggiornarsi. Allinea anche i requisiti in questo README.
3. Aggiorna il CHANGELOG, poi porta la versione su `main`: il marketplace segue il branch predefinito.

Documentazione: [catalogo dei KPI](docs/kpi.md) · [formati su disco](docs/storage.md) · [privacy](docs/privacy.md) · [CHANGELOG](CHANGELOG.md).

## Limiti noti

- Il **costo** è quello calcolato da Claude Code (equivalente API, comprese le sue chiamate di servizio); non esiste un costo per modello o per subagent. Dalla 0.4.0 coincide con `/cost`, compreso quanto speso fuori dai turni; resta escluso solo quanto Claude Code spende dopo la chiusura di una sessione che non viene più ripresa.
- La **risposta dell'utente** in un dialogo di permesso non è esposta: si contano decisioni, dialoghi e negazioni.
- L'esito dei comandi Bash **con pipe** riflette solo l'ultimo comando.
- Su **Linux** i browser installati come snap o flatpak (Firefox su Ubuntu, Brave, Chromium) non leggono le cartelle nascoste come `~/.claude`: `/kpi report` apre allora una copia del report nella cartella Scaricati (`kpi-report.html`, sovrascritta ogni volta). Per evitare la copia imposta `reportDir` su una cartella visibile, per esempio `~/Documenti/kpi`.
- Le sessioni precedenti all'installazione non vengono importate.

## Licenza

[MIT](LICENSE) © 2026 Thomas Amerio
