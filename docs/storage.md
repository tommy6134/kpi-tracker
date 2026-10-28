# On-disk formats

_Italiano: [docs/it/storage.md](it/storage.md)_

## Root

`<configDir>/kpi/`, where `<configDir>` is `$CLAUDE_CONFIG_DIR` if set, otherwise `$HOME/.claude` (`%USERPROFILE%\.claude` on Windows). The `dataDir` option replaces it.

| Path | Contents |
| --- | --- |
| `_meta/kpi-root.json` | root marker (`schemaVersion`, `plugin`, `createdAt`): pruning refuses to delete without it |
| `categorie.json` or `categories.json` | optional rules of the activity categories, written by you (see the README): `/kpi` reads them, the plugin never writes them |
| `_meta/upstream.git/` | bare git repo with the plugin's latest commit, no checkout: present only if the marketplace lists the plugin with a URL, used by updates to read the version and `compat.json` (can be deleted, it is recreated) |
| `_reports/report-<date-time>.html`, `latest.html` | HTML reports (in the `reportDir` folder, if set). `/kpi folder` creates the folder, with an empty `.keep`, if it does not exist yet |
| `_exports/kpi_<name>_<period>[_<level>].csv\|json` | exports (split into `_partN` parts beyond ~3.5 MB; in the `reportDir` folder, if set, or in the `--out` file). The period is the filter's (`2026-11`, `2026-11-03`, `2026-09_2026-11`…) or, without a closed period, the date and time of the export; level and parts are named in the export's language: `_days`, `_part2` in English; `_giorni`, `_parte2` in Italian. Until 0.4.0: `kpi-<level>-<date-time>` |
| `<project>/project.json` | a project |
| `<project>/<session>/` | a session |

Service folders start with `_`: an encoded project name only contains `[A-Za-z0-9-]`, so they never collide.

The only file outside the root: on Linux, when the report is in a hidden folder, `/kpi report` writes a copy to `$(xdg-user-dir DOWNLOAD)/kpi-report.html` (overwritten each time) and opens that, because snap and flatpak browsers cannot read hidden folders in the home.

## Project

Folder name: the launch path with every non-alphanumeric character replaced by `-`, as Claude Code does in `projects/`; beyond 200 characters it is shortened and a hash is added. The encoding is not reversible (`/a/b-c` and `/a/b/c` give the same name): if the folder already belongs to another path, `<name>-<hash>` is used.

```jsonc
// project.json
{ "schemaVersion": 1, "path": "/Users/me/work/app", "encoded": "-Users-me-work-app", "name": "app",
  "firstSeenAt": 1791800000000, "lastSeenAt": 1791900000000, "repo": { "root": "…", "remote": "…", "name": "app" } }
```

## Session

Folder name: `YYYY-MM-DD_HH-mm-ss_<first 8 characters of the id>`, in local time from the start of the session. A resume (`--resume`) finds the folder from the suffix and checks the id in `session.json`.

### session.json

Metadata and aggregated KPIs, rewritten at every save (5–20 KB):

| Field | Meaning |
| --- | --- |
| `sessionId`, `dir`, `project` | identity |
| `createdAt`, `updatedAt`, `heartbeatAt`, `tzOffsetMin` | times (ms epoch) and time zone |
| `status` | `active` or `ended`; an `active` one without a heartbeat for 10 minutes is shown as "interrupted" |
| `kind` and the other codes | stay Italian on disk (`interattiva`, `ricarica`, `altro`…) whatever the language: reports and exports translate them when they show them |
| `links` | `previousSessionId` / `nextSessionId` (chain of `/clear`) |
| `segments[]` | one item per process: `id`, `source`, `startedAt`, `endedAt`, `endReason`, `version`, `lastSeq`, `chunks`, `costBaselineUsd` (the cost ledger at binding time; the difference from the last reading of the previous segment counts as cost outside turns when the ledger belongs to the same session) |
| `meta` | `branches` (in the order they were last active: the current one is last), `repo`, `models`, `versions`, `permissionModes` |
| `diag` | saves, write errors, bytes written |
| `summary` | every aggregated KPI (see `hooks/analysis/summary-types.ts`); `summary.rv` is the version of the computation that produced it (absent until 0.4.0 = 1) |

### details.json

Unbounded details (with safety caps): `files` (by absolute path: reads, edits, lines, class), `turns` (last 2,000 turns: duration, tokens, tools, errors, outcome, cost, context), `agents`, `compactions`, `commits`, `prs`, `bashCmds`, `domains`, `switches`.

### events/

The raw events, **source of truth**: one JSONL file per segment, rotated beyond 512 KiB (`<segment>-0001.jsonl`, `-0002.jsonl`…). One line per event:

```json
{"q":12,"t":1791900000123,"e":"tool","id":"toolu_01…","tool":"Bash","st":"ok","wall":840,"x":{"k":"bash","cmds":["mvn test"],"cat":"test"}}
```

`q` is the sequence in the segment, `t` the instant in ms, `a` the subagent id (if any), `e` the type. The types are defined in `hooks/core/events.ts`.

## Consistency

- `$.fs.write` rewrites the whole file: each save snapshots pending events, summary and `lastSeq` together, then writes **the chunks first and then** `session.json`. So `session.json` never counts events that are not already on disk.
- On rebinding (resume, crash) the events with `q > lastSeq` are replayed onto the summary.
- `/kpi rebuild` redoes summary and details from scratch from the events (also after a `schemaVersion` change).
- When a new version changes the computation (`summary.rv` lower than the plugin's), past sessions are recomputed from the events by themselves: once, at the first interactive start of the new version, with a line in the transcript. A session open in another process at that moment is recomputed at a later start, once it is closed; a resumed session is recomputed when it is attached.
- Saves: 250 ms after the end of each turn, every 5 s if there is something new, a heartbeat every 60 s, before `/kpi` and when the session closes. In `claude -p` at the end of each turn.
- Each process writes only its own chunks: two processes on the same session do not overwrite each other's events.
