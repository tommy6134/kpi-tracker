# Changelog

## 0.2.0

Provato su Linux (Ubuntu 25.10, Claude Code 2.1.299) e su Windows.

- Pannello `/kpi live` ridisegnato a card: quattro card in testa (costo, contesto, durata, turni) e una card per sezione con il titolo sul bordo. Una metrica per riga con il valore a destra; tool, comandi Bash, file e subagent hanno una voce per riga.
- Colori a soglia: valori verdi, gialli dal 50%, rossi dall'80%. I bordi sono grigi tranne Contesto, Limiti ed Errori, che prendono il colore della soglia; gli zeri sono attenuati.
- Se ci sono errori, la card Errori sale subito sotto le card in testa.
- Il pannello non nasconde più le sezioni in fondo quando manca spazio: si scorre con la rotella o con le frecce.
- Layout adattivo: card in testa 2×2 nel pannello stretto e su una riga da 68 colonne; sezioni su due colonne da 78.

## 0.1.1

Provato su Linux (Ubuntu 25.10, Claude Code 2.1.299).

- Nuova opzione `reportDir`: cartella per report HTML ed export, al posto di `_reports/` e `_exports/` nella cartella dati.
- Linux: i browser snap e flatpak non leggono le cartelle nascoste, quindi `/kpi report` apriva una pagina di errore pur dicendo "Aperto nel browser". Ora, se il report sta in una cartella nascosta, se ne apre una copia nella cartella Scaricati (`kpi-report.html`).
- La sessione chiusa da `/clear` o da una ripresa ora risulta conclusa, non più interrotta.
- `--da` e `--a` rifiutano le date inesistenti (`32/13/2026`, `30/02/2026`) invece di restituire zero sessioni.
- `--out` accetta `~/…` e i percorsi Windows, e rifiuta con un messaggio quelli relativi; un export in più parti senza estensione non sovrascrive più la prima parte.
- Report HTML: menu a tendina leggibili nel tema scuro su Linux e Windows.

## 0.1.0

Prima versione pubblica.

- Registrazione di tutti i KPI misurabili tramite gli hook del motore: sessioni e segmenti, prompt, turni, richieste (TTFT, latenza, token per richiesta), costo, contesto, compattazioni, rate limit, tool, comandi Bash per categoria, righe di codice, git (commit, push, PR), permessi, subagent e workflow, skill, comandi slash, errori, notifiche.
- Dati in `<configDir>/kpi/<progetto>/<sessione>/` con eventi grezzi in JSONL, summary e dettagli; ripristino dopo crash e ricostruzione completa.
- Barra live sopra il prompt e pannello della sessione (`/kpi live`).
- `/kpi` con riepilogo, statistiche, sessioni, progetti, dettaglio di sessione, filtri e raggruppamenti; output visibile solo all'utente (`--ctx` per includerlo nel contesto).
- Report HTML offline con grafici e filtri interattivi; export CSV (Excel italiano o standard) e JSON a quattro livelli; pulizia e ricostruzione.
- Privacy per costruzione: nessun testo di prompt, risposte o argomenti di comandi.
