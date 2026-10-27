# kpi-tracker

_English: [README.md](README.md)_

Mod per **Claude Code CLI** che registra, salva e mostra **tutti i KPI misurabili** di utilizzo: token, costo, contesto, rate limit, richieste e latenza, turni, tool, comandi Bash, righe di codice, git, permessi, subagent, skill, errori.

I dati restano in locale, organizzati per **progetto** (cartella di avvio) e **sessione**. Si consultano in quattro modi:

- **barra live** sopra il prompt: costo, token, cache hit, contesto e rate limit della sessione;
- **pannello** con il dettaglio della sessione corrente (`/kpi live`);
- **`/kpi`**: report testuali con filtri per progetto, sessione, date, modello, tipo, branch e repo;
- **report HTML** offline con grafici e filtri interattivi (`/kpi report`), più **export** CSV/JSON.

Parla **italiano e inglese**: la lingua si sceglie all'installazione o da `/config` (opzione `language`), e ogni comando può cambiarla con `--lingua it|en`.

Non salva mai il testo di prompt o risposte, né gli argomenti dei comandi: vedi [docs/it/privacy.md](docs/it/privacy.md).

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

Rispondi `y` per aggiungere il marketplace e scegli lo scope **user**, così il tracker registra tutte le sessioni in tutti i progetti. La schermata di installazione chiede anche le opzioni, tra cui la lingua (`en` di default, `it` per l'italiano). Il plugin è attivo subito, anche nella sessione in cui lo installi.

In alternativa, in due passi (anche da shell con `claude plugin …`):

```
/plugin marketplace add tommy6134/kpi-tracker
/plugin install kpi-tracker@tommy6134
```

### App desktop (scheda Code)

I plugin installati da terminale con scope **user** si caricano anche nelle sessioni della scheda Code dell'app. Dall'app stessa, dove `/plugin` non funziona: clicca **+** accanto alla casella del prompt, poi **Plugins**, **Add marketplace** con `tommy6134/kpi-tracker`, poi **Add plugin**. Vedi [App desktop, Cowork e chat](#app-desktop-cowork-e-chat) per cosa cambia lì.

## App desktop, Cowork e chat

La stessa cartella del plugin si installa ovunque, ma ogni posto ne carica una parte diversa. kpi-tracker è un **mod** (hook TypeScript che girano dentro Claude Code), quindi funziona dove gira Claude Code:

| | CLI (terminale) | App desktop, scheda Code (locale) | Cowork | Chat (web, app, mobile) |
| --- | --- | --- | --- | --- |
| Motore | Claude Code | la stessa Claude Code, inclusa nell'app (mod dalla 2.1.286) | basato su Claude Code, in una macchina virtuale | nessuna Claude Code |
| Cartella `.claude` | `~/.claude` o `CLAUDE_CONFIG_DIR` | **la stessa `~/.claude`**: plugin, settings e dati KPI in comune con la CLI | una VM che si azzera tra le sessioni; resta solo la cartella di lavoro montata | nessuna |
| Installazione | `/plugin install` | **+ → Plugins → Add marketplace**, oppure da terminale con scope user | Customize → Plugins sull'account claude.ai (marketplace GitHub o zip) | come Cowork |
| Hook e mod | sì | sì (non nelle sessioni WSL) | da verificare: gli hook dei plugin risultano caricati, i mod "per Claude Code", e ci sono segnalazioni di bug aperte | ignorati |
| Barra e pannello | sì | sì (le sparkline sono testo invece di `Raster`) | probabilmente no | no |
| Opzioni (`userConfig`) | schermata di installazione e `/config` | `/config` | non le chiede: valgono i default | — |
| Browser e cartella | sì | sì | dentro la VM: non raggiungono il desktop dell'host | — |
| Aggiornamenti automatici | sì | spenti (servono i comandi `claude plugin …` della CLI); `/kpi aggiorna` prova a mano | no | no |

- **App desktop**: funziona tutto tranne gli aggiornamenti automatici. Le sessioni si registrano con tipo `desktop`, quindi `--tipo desktop` le filtra.
- **Cowork**: non ancora supportato. [docs/it/cowork-test.md](docs/it/cowork-test.md) è la checklist per provarlo su macOS; l'esito decide se aggiungere il supporto (dati nella cartella di lavoro montata, solo output testuale).
- **Chat**: non è possibile. Gli hook dei plugin non girano in chat e non c'è un filesystem locale.

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

Il formato completo è in [docs/it/storage.md](docs/it/storage.md).

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
| `/kpi report [filtri] [--no-apri] [--cartella]` | Dashboard HTML offline, aperta nel browser; `--cartella` apre anche la sua cartella nel file manager |
| `/kpi esporta csv\|json [filtri] [--livello sessioni\|giorni\|turni\|eventi] [--standard\|--excel] [--cartella]` | Export, con colonne e valori nella lingua scelta. Il CSV segue la lingua: Excel italiano (`;` e virgola) in italiano, standard (`,` e punto) in inglese; `--standard` ed `--excel` lo forzano; `--cartella` apre la cartella del file |
| `/kpi cartella [report\|esporta\|dati]` | Apre nel file manager (Finder, Esplora file, Nautilus…) la cartella dei report (default), degli export o dei dati |
| `/kpi pulisci --piu-vecchie-di 180d [--si]` | Elenca, e con `--si` cancella, le sessioni più vecchie |
| `/kpi ricostruisci [filtri]` | Ricalcola i KPI dagli eventi grezzi |
| `/kpi aggiorna [--verifica]` | Stato degli aggiornamenti; installa subito l'ultima versione se compatibile (`--verifica` controlla soltanto) |
| `/kpi aiuto` | Guida |

**Filtri:** `--progetto <testo|.>`, `--sessione <id>`, `--da` / `--a` (`oggi`, `ieri`, `7d`, `24h`, `2w`, `3m`, `2026-10-01`, `01/10/2026`), `--mese 2026-11` (o `11/2026`: da e a su quel mese), `--modello`, `--tipo interattiva|print|sdk|desktop|vscode`, `--branch`, `--repo`. Ogni sottocomando e opzione ha anche il nome inglese (`stats`, `sessions`, `export`, `prune`, `--since`, `--month`, `--project`, `--by`…), qualunque sia la lingua.

**Nome dei file di export:** `kpi_<nome_cognome>_<periodo>[_<livello>].csv|json`, per esempio `kpi_mario_rossi_2026-11.csv`. Il nome viene dall'opzione `fullName`, altrimenti da `git config user.name`, in minuscolo, senza accenti e con `_` al posto degli spazi; senza nessuno dei due non c'è. Il periodo è quello del filtro: un giorno (`2026-11-03`), un mese (`2026-11`, anche con `--mese`), mesi interi (`2026-09_2026-11`) o l'intervallo (`2026-09-15_2026-11-02`), e rifare l'export dello stesso periodo sovrascrive il file. Senza filtro di data, o con solo `--da` o `--a`, è la data e l'ora dell'export (`2026-11-03_14-30-05`), come prima. Il livello sessioni non ha suffisso; gli altri lo aggiungono nella lingua dell'export (`_giorni`, `_days`), e così le parti oltre ~3,5 MB (`_parte2`, `_part2`). `--out` sceglie il file liberamente.

**Colonne dell'export:** il livello sessioni ha una riga per sessione con i suoi KPI, comprese le righe aggiunte e rimosse per classe di file (`righe_aggiunte_src`, `righe_rimosse_cobol`…), le build riuscite e fallite e gli esiti dei permessi. Le grandezze nel tempo (costo, token, turni, righe in totale) rispettano il filtro di date; le righe per classe, le build e gli altri conteggi sono dell'intera sessione. Le colonne nuove si aggiungono in fondo, così i fogli costruiti sulla posizione delle colonne continuano a funzionare.

**Lingua:** `--lingua it|en` (`--lang`) sceglie la lingua di un comando: report testuali, report HTML, CSV e JSON (colonne, valori, nome del file). Senza, vale l'opzione `language`. Il report HTML ha anche un selettore Italiano/English accanto al tema, e si apre in inglese con `#en` nell'indirizzo (`#it` per l'italiano).

**Aprire la cartella.** Una pagina HTML aperta da `file://` non può avviare programmi, quindi la testata del report mostra le cartelle di report ed export con tre pulsanti: **Apri** (la cartella nel browser, quando il browser la può leggere), **Copia percorso** e **Copia comando** (`/kpi cartella report`: incollalo in Claude Code e si apre il file manager). Anche il pannello `/kpi live` ha il pulsante **Cartella**. Su Linux usa `xdg-open`, su macOS `open`, su Windows `start`, in WSL l'`explorer.exe` di Windows (il percorso si converte con `wslpath`).

Il report di `/kpi` lo vedi solo tu: a Claude arriva una riga breve, così non consuma contesto. Con `--ctx` il report completo va anche a Claude, per esempio per fargli analizzare i tuoi KPI.

## Configurazione

Da `/config` (sezione del plugin) o in `settings.json` sotto `pluginConfigs`:

| Opzione | Default | Significato |
| --- | --- | --- |
| `language` | `"en"` | Lingua di barra, pannello, `/kpi`, report ed export: `en` o `it`. Chi aggiorna dalla 0.3.0 con dati già registrati e senza averla mai scelta resta in italiano (il plugin la imposta a `it` una volta sola) |
| `dataDir` | `""` | Cartella dati assoluta (anche `~/…`); vuoto = `<configurazione>/kpi` |
| `reportDir` | `""` | Cartella assoluta (anche `~/…`) per report HTML ed export; vuoto = `_reports/` e `_exports/` nella cartella dati |
| `fullName` | `""` | Nome e cognome nel nome dei file di export (`kpi_mario_rossi_2026-11.csv`); vuoto = `git config user.name` |
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
| `hooks/i18n/` | Lingue: catalogo inglese (la chiave è il testo italiano nel codice), etichette dei codici salvati, migrazione della lingua |
| `hooks/update/` | Aggiornamenti: confronto di versioni, installazione e catalogo del marketplace, lettura della release dai repo git, controllo di compatibilità |
| `types/index.d.ts` | Contratto di `$.state` |

I testi si scrivono in italiano nel codice, con `L.t('…')`, e si traducono in `hooks/i18n/en.ts`: un testo senza traduzione non compila (`tsc`). I codici salvati su disco (`interattiva`, `ricarica`, `altro`…) restano in italiano e si traducono solo quando si mostrano (`hooks/i18n/codes.ts`). I testi del report HTML stanno nel dizionario `EN` di `assets/report/app.js`.

### Pubblicare una versione

1. Aumenta `version` in `.claude-plugin/plugin.json`, altrimenti né gli aggiornamenti automatici né `claude plugin update` vedono nulla di nuovo.
2. Se il codice usa eventi o API del motore arrivati dopo il minimo attuale, alza `minClaudeCode` in `.claude-plugin/compat.json`. Claude Code non ha un campo per la versione minima e una versione che usa API assenti passa la validazione ma si rompe in silenzio: è questo file che impedisce alle installazioni con un Claude Code più vecchio di aggiornarsi. Allinea anche i requisiti in questo README.
3. Aggiorna il CHANGELOG, poi porta la versione su `main`: il marketplace segue il branch predefinito.

Documentazione (in inglese in [docs/](docs/)): [catalogo dei KPI](docs/it/kpi.md) · [formati su disco](docs/it/storage.md) · [privacy](docs/it/privacy.md) · [CHANGELOG](CHANGELOG.md).

## Limiti noti

- Il **costo** è quello calcolato da Claude Code (equivalente API, comprese le sue chiamate di servizio); non esiste un costo per modello o per subagent. Dalla 0.4.0 coincide con `/cost`, compreso quanto speso fuori dai turni; resta escluso solo quanto Claude Code spende dopo la chiusura di una sessione che non viene più ripresa.
- Della **risposta dell'utente** in un dialogo di permesso si vede solo il "no" (dalla 0.5.0; prima contava come interruzione): si contano decisioni, dialoghi, negazioni e rifiuti.
- L'esito dei comandi Bash **con pipe** riflette solo l'ultimo comando.
- Su **Linux** i browser installati come snap o flatpak (Firefox su Ubuntu, Brave, Chromium) non leggono le cartelle nascoste come `~/.claude`: `/kpi report` apre allora una copia del report nella cartella Scaricati (`kpi-report.html`, sovrascritta ogni volta). Per evitare la copia imposta `reportDir` su una cartella visibile, per esempio `~/Documenti/kpi`.
- Le sessioni precedenti all'installazione non vengono importate.

## Licenza

[MIT](LICENSE) © 2026 Thomas Amerio
