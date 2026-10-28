# Collaudo: Cowork

_English: [docs/cowork-test.md](../cowork-test.md)_

Serve a verificare su un Cowork vero quello che i test automatici non possono: dove gira il mod, dove scrive, cosa mostra Cowork. Basta un task corto, quindi il collaudo consuma poco usage. È scritto per l'app desktop su Linux (beta); su macOS la cartella dell'app è `~/Library/Application Support/Claude` invece di `~/.config/Claude`.

## Prima di iniziare

- App desktop di Claude aggiornata, con l'accesso fatto. Nelle impostazioni di Cowork, **Run new tasks in the cloud** spento: un task nel cloud non si registra.
- Nella scheda Code, in una sessione locale, `/status` mostra la riga **Claude Code**: annota la versione (i mod funzionano dalla 2.1.286).
- Lo zip del plugin del branch da provare, dalla cartella del repo:

  ```bash
  git archive --format=zip -o ~/kpi-tracker.zip HEAD
  ```

- Annota cosa c'è già: `ls ~/.claude/kpi ~/.claude/kpi/_meta`.

## 1. Installazione in Cowork

**Customize → Plugins → Add → Upload plugin** con lo zip.

- [ ] la pagina del plugin elenca gli hook;
- [ ] c'è una scheda **Settings** con le opzioni (annota sì o no).

Il plugin caricato arriva anche nella CLI, come `kpi-tracker@synced`. Se nella CLI c'è la copia del marketplace, quella sincronizzata non si carica.

## 2. Un task corto

1. Nuovo task Cowork, con una cartella collegata, meglio un repo git.
2. Un prompt che usa i tool: _"Elenca i file della cartella collegata e leggi il README"_.
3. Scrivi `/kpi ambiente`; se il comando non c'è, `/kpi-tracker:kpi ambiente`.
   - [ ] il comando esiste e risponde (copia la tabella).
4. Scrivi `/kpi`, poi `/kpi live`.
   - [ ] `/kpi` risponde con il riepilogo;
   - [ ] `/kpi live` dice che in Cowork il pannello non c'è;
   - [ ] compare una barra sopra il prompt (annota sì o no).
5. Chiudi il task.

## 3. Su disco

```bash
cat ~/.claude/kpi/_meta/ambiente-cowork.json
ls ~/.claude/kpi
find ~/.config/Claude/local-agent-mode-sessions -path '*/.claude/kpi' -prune -print
```

- [ ] `ambiente-cowork.json` c'è, con `"kind": "cowork"` e `"cowork": "host"`;
- [ ] il progetto del task è la cartella collegata (`-home-…`), non `-var-empty` né `Cowork`;
- [ ] `find` non stampa niente: nessun KPI nella `.claude` del task.

## 4. Dalla CLI

- `/kpi sessioni --tipo cowork`: [ ] il task c'è, con costo, token e tool;
- `/kpi sessione <id>`: [ ] il dettaglio corrisponde al task;
- `/plugin`: [ ] se è installata la copia del marketplace, la copia `@synced` risulta non caricata.

## 5. Cancella il task

Cancella il task nell'app, poi di nuovo `/kpi sessioni --tipo cowork`: [ ] il task c'è ancora.

## Dopo il collaudo

Togli il plugin caricato da **Customize → Plugins**: altrimenti resta sull'account e continua ad arrivare nella CLI come `@synced`.

## Cosa riportare

Su Linux, con Claude Code aperto su questo repo, niente: i file li legge Claude. Altrimenti le caselle spuntate, la versione di Claude Code, la tabella di `/kpi ambiente` e l'output del passo 3.
