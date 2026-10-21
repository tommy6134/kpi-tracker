# Catalogo dei KPI

Tutti i KPI sono **misurati**: i rapporti (cache hit, costo per turno…) sono calcolati da valori misurati, non stimati. Ogni KPI si aggrega per giorno, settimana, mese, progetto, modello, tipo di sessione, branch e repo.

Colonna **Fonte**: l'evento del motore (hook del mod) o il campo da cui arriva il dato. Colonna **Gran.**: E = per evento, T = per turno, S = per sessione.

## Sessione

| KPI | Definizione | Fonte | Gran. |
| --- | --- | --- | --- |
| Sessioni | numero di sessioni (cartelle) | storage | S |
| Tipo | interattiva, print (`claude -p`), sdk, desktop, vscode | `session.start` (`isInteractive`, `surface`), `CLAUDE_CODE_ENTRYPOINT` | S |
| Origine dei segmenti | startup, resume, clear, fork, ricarica (hot reload) | `classic.SessionStart.source`, `$.state` | S |
| Segmenti | processi che hanno lavorato sulla sessione (riprese, reload) | storage | S |
| Motivo di chiusura | clear, resume, logout, prompt_input_exit, other, interrotta | `session.end.reason`, heartbeat | S |
| Durata | dall'inizio all'ultima attività | `$.session.usage().startedAt`, eventi | S |
| Versioni di Claude Code | per segmento | `$.session.version()` | S |
| Progetto, repo, branch | cartella di avvio, repo git, branch (e cambi) | `session.start.cwd`, `$.session.repo()`, `git rev-parse` | S/E |
| Ripresa | secondi dall'ultima risposta, token di contesto, cache scaduta | `classic.SessionStart` (resume/fork) | S |
| Sessione precedente/successiva | collegamento tra sessioni separate da `/clear` | storage | S |

## Tempo e attività

| KPI | Definizione | Fonte | Gran. |
| --- | --- | --- | --- |
| Tempo attivo | somma delle durate dei turni principali | `turn.complete.durationMs` | T |
| Utilizzo | tempo attivo / durata della sessione | derivato | S |
| Tempo di risposta dell'utente | dalla fine di un turno al prompt successivo (p50, p90) | orologio, `prompt.submit` | T |
| Mappa attività | turni per ora × giorno della settimana (ora locale) | `turn.complete` | T |
| Giorni attivi | giorni con almeno un evento | eventi | S |

## Prompt

| KPI | Definizione | Fonte | Gran. |
| --- | --- | --- | --- |
| Prompt per origine | composer, sdk, task-notification, scheduled-trigger, peer, channel, auto-continuation, plugin… | `prompt.submit.origin.kind` | E |
| Prompt per sorgente | user, sdk, system, loop_wakeup, schedule_wakeup, poll_event | `classic.UserPromptSubmit.source` | E |
| Accodati | prompt scritti mentre un turno era in corso | `prompt.submit.turnId` | E |
| Lunghezza | caratteri, parole, righe (media, max); il testo non si salva | `prompt.submit.text` (solo lunghezze) | E |
| Allegati | immagini, documenti, audio | `prompt.submit.attachments[].type` | E |
| Menzioni @ | per tipo (file, già letto, pdf) | `prompt.mention` | E |
| Espansioni | comandi slash e prompt MCP espansi, per nome | `classic.UserPromptExpansion` | E |

## Turni e richieste

| KPI | Definizione | Fonte | Gran. |
| --- | --- | --- | --- |
| Turni principali / dei subagent | | `turn.complete` (con o senza `agentId`) | T |
| Durata dei turni | media, p50, p90, max, istogramma | `turn.complete.durationMs` | T |
| Esito | risposta, interrotto, rifiuto (con categoria), errore | `turn.complete.reason`, `refusal.category` | T |
| Richieste per turno | richieste al modello in un turno | `turn.step` | T |
| Tool per turno | | `tool.call` | T |
| Motivi di stop | end_turn, tool_use, max_tokens, pause_turn, refusal… | `turn.step` (risultato) | E |
| Tempo al primo token (TTFT) | dalla richiesta al primo chunk di contenuto | wrapper di `turn.step` (opzione `streamTiming`) | E |
| Latenza della richiesta | durata della richiesta | wrapper di `turn.step` | E |
| Velocità di output | token di output al secondo di generazione | derivato | E |
| Tool lato server | chiamate eseguite dall'API (numero, durata) | `turn.step.serverToolUses` | E |
| Fallback di modello | modello che ha risposto diverso da quello richiesto | `turn.step` | E |
| Lunghezza della risposta | caratteri della risposta finale (il testo non si salva) | `turn.complete.answer` (solo lunghezza) | T |

## Token, costo, contesto, rate limit

| KPI | Definizione | Fonte | Gran. |
| --- | --- | --- | --- |
| Token | input non in cache, output, cache letta, cache scritta, totale; per modello, agente, giorno | `turn.step.usage` (o `turn.complete.usage` senza `streamTiming`), `session.compact.usage` | E |
| Cache hit | cache letta / (input + cache letta + cache scritta) | derivato | T/S |
| Quota dei subagent | token dei subagent sul totale | `agentId` | S |
| Costo | USD calcolati da Claude Code (somma dei delta per segmento) | `session.measure.cost.usd` | S |
| Costo per turno | delta di costo tra due misurazioni, attribuito all'ultimo turno | derivato | T |
| Costo per commit, per 100 righe, per sessione | | derivato | A |
| Contesto | riempimento % (massimo, medio a fine turno, ultimo), dimensione della finestra | `session.measure.context` | T |
| Compattazioni | per trigger (manual, auto…), token prima/dopo, riduzione %, token spesi | `session.compact` | E |
| Rate limit | % usata a 5 ore, 7 giorni, spend (ultimo, massimo, reset) | `session.measure.rateLimits` | T |
| Blocchi per rate limit | | `classic.StopFailure.error = rate_limit` | E |

## Modelli ed effort

| KPI | Definizione | Fonte | Gran. |
| --- | --- | --- | --- |
| Richieste e token per modello | | `turn.step` | E |
| Effort | distribuzione di low, medium, high, xhigh, max | `turn.step.effort` | E |
| Cambi di modello | da, a, origine (command, picker, auto…) | `classic.PostModelSwitch` | E |
| Modelli dei subagent | | `agent.spawn` (risultato) | E |

## Tool

| KPI | Definizione | Fonte | Gran. |
| --- | --- | --- | --- |
| Chiamate per tool | built-in, MCP, plugin; principale o subagent | `tool.call` | E |
| Esito | ok, errore, negato, interrotto; tasso di errore | `tool.call` (risultato) | E |
| Durata | senza attese di permesso e hook (media, p90) | `classic.PostToolUse(Failure).duration_ms` | E |
| Tempo totale | inclusa l'attesa del permesso | orologio attorno a `tool.call` | E |
| Read-only | quota di chiamate eseguite in sola lettura | `tool.call.isReadOnly` | E |
| Parallelismo | tool per batch | `classic.PostToolBatch` | E |
| Background | comandi e agenti in background | risultati Bash e Agent | E |
| Server MCP | chiamate ed errori per server | nome `mcp__server__tool` | E |
| WebFetch | domini (solo host), byte, codici HTTP, errori | risultato WebFetch | E |
| WebSearch | ricerche | risultato WebSearch | E |
| Todo | totali e completati dell'ultima lista | risultato TodoWrite | E |
| Read | righe lette, file unici letti | risultato Read | E |

## Bash

Categorie: **git, test, build, package, docker, fs, network, altro**. Si salvano solo `programma sottocomando` (es. `mvn test`), mai gli argomenti.

| KPI | Definizione | Fonte | Gran. |
| --- | --- | --- | --- |
| Comandi per categoria | con esito (ok, errore, interrotto, timeout, background) | classificatore + risultato | E |
| Comandi più usati | `programma sottocomando` | classificatore | E |
| Test | esecuzioni, superate, fallite, pass rate | categoria test + esito | E |
| Build | esecuzioni, riuscite, fallite | categoria build + esito | E |
| Comandi con pipe | l'esito riflette solo l'ultimo comando | classificatore | E |
| Sandbox disattivata | | input Bash `dangerouslyDisableSandbox` | E |

## File e codice

| KPI | Definizione | Fonte | Gran. |
| --- | --- | --- | --- |
| Righe aggiunte, rimosse, nette | per file, estensione, classe (src, test, doc, config) e giorno | `gitDiff` o `structuredPatch` di Edit/Write; contenuto per i file creati | E |
| File creati, modificati, letti (unici) | | Edit, Write, Read | E |
| Modifiche ritoccate dall'utente | modifiche cambiate dall'utente nel dialogo | `userModified` | E |
| File fuori dal progetto | | percorso fuori dalla cartella di avvio | E |
| Churn | file modificati 3 o più volte | dettagli | S |

Le righe scritte dai subagent si contano dai loro tool call, senza doppi conteggi.

## Git

| KPI | Definizione | Fonte | Gran. |
| --- | --- | --- | --- |
| Commit | per tipo (committed, amended, cherry-picked), sha, branch | `gitOperation.commit` del risultato Bash | E |
| Push | per branch | `gitOperation.push` | E |
| Merge e rebase | | `gitOperation.branch` | E |
| Pull request | per azione (created, merged…), numero, URL | `gitOperation.pr` | E |
| Branch | branch visti e cambi | `git rev-parse` | E |
| Righe per commit | | derivato | A |

## Permessi

| KPI | Definizione | Fonte | Gran. |
| --- | --- | --- | --- |
| Decisioni | allow, ask, deny per tool | `tool.check` | E |
| Chi ha deciso | regola, hook, modalità | `tool.check` (`rule`, `hook`) | E |
| Dialoghi mostrati | | `classic.PermissionRequest` | E |
| Negati dal classificatore | | `classic.PermissionDenied` | E |
| Tool call negate | | `tool.call` (deny) | E |

## Subagent e workflow

| KPI | Definizione | Fonte | Gran. |
| --- | --- | --- | --- |
| Subagent avviati | per tipo e modello; background, fork, teammate | `agent.spawn` | E |
| Durata, token, tool per tipo | | turni e tool con `agentId` | E |
| Esiti ed errori | | risultato del tool Agent | E |
| Workflow | run distinti | `agent.spawn.workflow` | E |
| Massimo concorrenti | | `classic.SubagentStart/Stop` | S |

## Skill, comandi, istruzioni

| KPI | Definizione | Fonte | Gran. |
| --- | --- | --- | --- |
| Skill | invocazioni, esiti | `skill.prompt`, risultato del tool Skill | E |
| Comandi slash | per nome e origine (anche `/clear`, `/compact`, `/model`) | `command.run` | E |
| File di istruzioni caricati | per tipo (User, Project, Local, Managed) | `classic.InstructionsLoaded` | E |
| Task | creati, completati | `classic.TaskCreated/Completed` | E |
| Cambi di cartella | | `classic.CwdChanged` | E |

## Errori e notifiche

| KPI | Definizione | Fonte | Gran. |
| --- | --- | --- | --- |
| Errori API | rate_limit, overloaded, billing_error, max_output_tokens, server_error… | `classic.StopFailure` | E |
| Turni in errore, interrotti, rifiutati | | `turn.complete` | T |
| Errori dei tool | | `tool.call` | E |
| Interruzioni | turni interrotti, comandi interrotti | `turn.complete`, risultati | E |
| Stop per max_tokens | | `turn.step` | E |
| Notifiche | per tipo | `classic.Notification` | E |

## Non disponibili

- costo per richiesta, per modello o per subagent (Claude Code espone solo il costo totale della sessione);
- la risposta dell'utente nel dialogo di permesso;
- le chiamate di servizio del motore (titoli, classificatori), incluse solo nel costo totale;
- il codice di uscita numerico di Bash (solo ok/errore).
