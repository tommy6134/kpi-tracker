# Collaudo: app desktop e Cowork (macOS)

_English: [docs/cowork-test.md](../cowork-test.md)_

Serve a capire cosa fa kpi-tracker nell'app desktop di Claude e in Cowork, che non si possono provare dalla CLI. Riporta l'esito di ogni passo (va bene una riga, o l'output copiato): decide cosa supportare dopo la 0.4.0.

## Prima di iniziare

- App Claude per macOS aggiornata. Nella scheda Code, in una sessione locale, `/status` mostra la riga **Claude Code**: annota la versione (i mod funzionano dalla 2.1.286).
- Lo zip del plugin, dalla cartella del repo:

  ```bash
  git archive --format=zip -o ~/Desktop/kpi-tracker.zip HEAD
  ```

## 1. App desktop, scheda Code

1. Installa il plugin: **+** accanto alla casella del prompt → **Plugins** → **Add marketplace** con `tommy6134/kpi-tracker` → **Add plugin**. Se il plugin è già installato da terminale con scope user, salta questo passo.
2. Apri una sessione **locale** in un progetto qualsiasi e chiedi a Claude un paio di cose che usano tool (leggere un file, lanciare `ls`).
3. Controlla:
   - [ ] la barra KPI sopra il prompt (costo, token, contesto);
   - [ ] `/kpi live` apre il pannello; i pulsanti **Report HTML**, **Cartella**, **Chiudi** funzionano;
   - [ ] `/kpi` mostra il riepilogo, e la sessione risulta di tipo `desktop` in `/kpi sessioni`;
   - [ ] `/kpi report` apre il browser; `/kpi cartella` apre il Finder sulla cartella dei report;
   - [ ] `/kpi sessione corrente`: "Costo KPI · secondo Claude Code (/cost)" mostra due valori uguali (o quasi, se un turno è in corso);
   - [ ] `/kpi aggiorna --verifica`: annota l'esito (nell'app gli aggiornamenti automatici sono spenti; questo dice se funzionano almeno a mano).
4. Nel terminale, `ls ~/.claude/kpi/`: i dati dell'app devono stare nella stessa cartella della CLI.

## 2. Cowork

1. Installa il plugin sull'account: **Customize → Plugins → Add → Upload plugin** con lo zip (oppure **Add marketplace** con `tommy6134/kpi-tracker`).
2. Avvia un task Cowork con una cartella di lavoro e scrivi `/kpi`. Se non lo trova, prova `/kpi-tracker:kpi`.
   - [ ] il comando esiste? Cosa risponde?
   - [ ] compare una barra sopra il prompt?
3. Chiedi a Claude, nel task: _"Esegui `echo HOME=$HOME CONFIG=$CLAUDE_CONFIG_DIR ENTRY=$CLAUDE_CODE_ENTRYPOINT; ls -la ~/.claude/kpi 2>&1; pwd` e mostrami l'output"_.
   - [ ] annota l'output: dice se il mod ha scritto dati, dove, e come si riconosce Cowork.
4. Chiudi il task, aprine uno nuovo e ripeti il comando del passo 3.
   - [ ] i dati del task precedente ci sono ancora?

## Cosa riportare

Le caselle spuntate o no, la versione di Claude Code, e l'output dei passi 3 e 4 di Cowork. Con questi si decide:

- **app desktop**: se `/kpi aggiorna` funziona, si attivano gli aggiornamenti automatici anche lì;
- **Cowork**: se il mod parte, i dati vanno nella cartella di lavoro montata (l'unica che resta) e si usa solo l'output testuale; se non parte, si documenta come non supportato.
