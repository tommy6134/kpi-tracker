# Privacy

_English: [docs/privacy.md](../privacy.md)_

kpi-tracker salva **metriche e metadati**, mai contenuti. Tutto resta sul tuo disco: il plugin non invia dati da nessuna parte.

L'unico traffico di rete è quello degli **aggiornamenti** (opzione `autoUpdate`, salvo `off`). Al massimo una volta al giorno il plugin lancia `claude plugin marketplace update`, cioè un `git fetch` del marketplace da cui l'hai installato. Se il catalogo indica il plugin con un URL, fa anche un `git fetch --depth 1` di quel repo per leggerne la versione. Se c'è una versione nuova compatibile, lancia `claude plugin update`. Sono gli stessi comandi che lanceresti a mano, e scaricano soltanto: non partono con `--plugin-dir` né nelle sessioni `-p`/SDK.

## Cosa si salva

- numeri: token, costi, durate, conteggi, percentuali, righe aggiunte e rimosse;
- nomi: tool, skill, subagent, server MCP, comandi slash (solo il nome), modelli;
- percorsi assoluti dei file letti e modificati, cartella di avvio, repo e branch git;
- comandi Bash ridotti a `programma sottocomando` (es. `git commit`, `mvn test`), con una categoria;
- per i commit: sha a 7 caratteri, tipo, branch; per le PR: numero, azione, URL senza query;
- per WebFetch: solo l'host (es. `docs.spring.io`);
- per i documenti creati dai comandi (Word, Excel, PDF…): solo quanti, per estensione;
- solo in Cowork, `_meta/ambiente-cowork.json`, riscritto a ogni avvio: quello che mostra `/kpi ambiente` (tipo di sessione, versione di Claude Code, `HOME`, `USERPROFILE`, `CLAUDE_CONFIG_DIR`, `CLAUDE_CODE_ENTRYPOINT`, `CLAUDE_CODE_REMOTE_ENVIRONMENT_TYPE`, cartelle e il nome della voce delle opzioni della CLI). Nessun'altra variabile d'ambiente e nessun valore delle opzioni.

## Cosa non si salva mai

- il testo di prompt e risposte (solo la loro **lunghezza**);
- gli argomenti dei comandi Bash: niente messaggi di commit, header, token, password, URL;
- gli argomenti dei comandi slash e delle skill;
- query e percorsi degli URL;
- il contenuto dei file, l'output dei tool, i messaggi di errore;
- il titolo della sessione (generato dal testo del prompt);
- i nomi dei documenti creati: l'elenco dei documenti del repo che restituisce `git status` resta in memoria, si scrivono solo i conteggi.

## Come è garantito

- Il classificatore Bash (`hooks/analysis/bash-classify.ts`) scarta virgolette, heredoc, sostituzioni `$(…)` e assegnazioni. Un sottocomando esce solo se è in un elenco noto per quel programma, altrimenti diventa `*`.
- I nomi passano da `safeName`: un valore che non sembra un identificatore diventa `altro`.
- L'esito di una tool call fallita (rifiutata dall'utente, negata, interrotta) si riconosce dall'inizio del testo d'errore, in memoria. Il testo non si salva mai, anche quando contiene le parole scritte dall'utente nel dialogo dei permessi.
- L'output dei comandi di build e di test si legge in memoria (gli ultimi 64 KB) per cercare i marcatori di fallimento; si salva solo un'indicazione.
- I test (`tests/units.test.ts`, `tests/ui-commands.test.ts`) verificano che nessun file scritto, export compresi, contenga il testo di prompt, gli argomenti segreti dei comandi o i messaggi di commit.

## Contesto del modello

Il report di `/kpi` lo vedi solo tu: nel transcript, e quindi al modello, arriva una riga breve. Il report completo va al modello solo se aggiungi `--ctx`.
