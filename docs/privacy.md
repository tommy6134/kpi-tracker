# Privacy

kpi-tracker salva **metriche e metadati**, mai contenuti. Tutto resta sul tuo disco: il plugin non fa chiamate di rete.

## Cosa si salva

- numeri: token, costi, durate, conteggi, percentuali, righe aggiunte e rimosse;
- nomi: tool, skill, subagent, server MCP, comandi slash (solo il nome), modelli;
- percorsi assoluti dei file letti e modificati, cartella di avvio, repo e branch git;
- comandi Bash ridotti a `programma sottocomando` (es. `git commit`, `mvn test`), con una categoria;
- per i commit: sha a 7 caratteri, tipo, branch; per le PR: numero, azione, URL senza query;
- per WebFetch: solo l'host (es. `docs.spring.io`).

## Cosa non si salva mai

- il testo di prompt e risposte (solo la loro **lunghezza**);
- gli argomenti dei comandi Bash: niente messaggi di commit, header, token, password, URL;
- gli argomenti dei comandi slash e delle skill;
- query e percorsi degli URL;
- il contenuto dei file, l'output dei tool, i messaggi di errore;
- il titolo della sessione (generato dal testo del prompt).

## Come è garantito

- Il classificatore Bash (`hooks/analysis/bash-classify.ts`) scarta virgolette, heredoc, sostituzioni `$(…)` e assegnazioni. Un sottocomando esce solo se è in un elenco noto per quel programma, altrimenti diventa `*`.
- I nomi passano da `safeName`: un valore che non sembra un identificatore diventa `altro`.
- I test (`tests/units.test.ts`, `tests/ui-commands.test.ts`) verificano che nessun file scritto, export compresi, contenga il testo di prompt, gli argomenti segreti dei comandi o i messaggi di commit.

## Contesto del modello

Il report di `/kpi` lo vedi solo tu: nel transcript, e quindi al modello, arriva una riga breve. Il report completo va al modello solo se aggiungi `--ctx`.
