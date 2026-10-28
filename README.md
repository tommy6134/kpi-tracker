# kpi-tracker

_Italiano: [README.it.md](README.it.md)_

A mod for **Claude Code CLI** that records, stores and shows **every measurable usage KPI**: tokens, cost, context, rate limits, requests and latency, turns, tools, Bash commands, lines of code, git, permissions, subagents, skills, errors.

The data stays local, organised by **project** (launch folder) and **session**. You can look at it in four ways:

- a **live band** above the prompt: the session's cost, tokens, cache hit, context and rate limits;
- a **panel** with the detail of the current session (`/kpi live`);
- **`/kpi`**: text reports with filters by project, session, dates, model, kind, branch and repo;
- an offline **HTML report** with charts and interactive filters (`/kpi report`), plus CSV/JSON **exports**.

It speaks **English and Italian**: pick the language at install time or from `/config` (the `language` option), and any command can switch it with `--lang en|it`.

It never stores the text of prompts or responses, nor command arguments: see [docs/privacy.md](docs/privacy.md).

It updates itself, and only to versions compatible with your Claude Code: see [Updates](#updates).

> Requires Claude Code **2.1.287 or later** (mods are active from that version; the minimum of each version is in [`.claude-plugin/compat.json`](.claude-plugin/compat.json)). Developed and tested on macOS (2.1.296), Linux (Ubuntu 25.10, 2.1.299) and Windows.

## Requirements

- **Claude Code 2.1.287 or later** (terminal CLI); the exact minimum of each version is in `.claude-plugin/compat.json`.
- **`git`** installed: Claude Code uses it to download the plugin from GitHub.

Nothing else: no Node, Python, npm or build step, the code runs inside Claude Code. If the project has no `git` or the browser does not open, the plugin keeps working (only the branch is missing from the metadata, and you open the report by hand).

## Installation

From the terminal, in a Claude Code session:

```
/plugin install kpi-tracker --marketplace tommy6134/kpi-tracker
```

Answer `y` to add the marketplace and choose the **user** scope, so the tracker records every session in every project. The install screen asks for the options too, the language among them (`en` by default). The plugin is active right away, even in the session you install it from.

Alternatively, in two steps (also from a shell with `claude plugin …`):

```
/plugin marketplace add tommy6134/kpi-tracker
/plugin install kpi-tracker@tommy6134
```

### Desktop app (Code tab)

Plugins installed from the terminal with the **user** scope also load in the sessions of the app's Code tab. From the app itself, where `/plugin` does not run: click **+** next to the prompt box, then **Plugins**, **Add marketplace** with `tommy6134/kpi-tracker`, then **Add plugin**. See [Desktop app, Cowork and chat](#desktop-app-cowork-and-chat) for what changes there.

## Desktop app, Cowork and chat

The same plugin folder installs everywhere, but each place loads a different part of it. kpi-tracker is a **mod** (TypeScript hooks that run inside Claude Code), so it works where Claude Code runs:

| | CLI (terminal) | Desktop app, Code tab (local) | Cowork | Chat (web, app, mobile) |
| --- | --- | --- | --- | --- |
| Engine | Claude Code | the same Claude Code, bundled with the app (mods from 2.1.286) | built on Claude Code, in a virtual machine | no Claude Code |
| `.claude` folder | `~/.claude` or `CLAUDE_CONFIG_DIR` | **the same `~/.claude`**: plugins, settings and KPI data are shared with the CLI | a VM reset between sessions; only the mounted work folder persists | none |
| Install | `/plugin install` | **+ → Plugins → Add marketplace**, or from the terminal with the user scope | Customize → Plugins on your claude.ai account (GitHub marketplace or zip) | as Cowork |
| Hooks and mods | yes | yes (not in WSL sessions) | to be verified: plugin hooks are documented as loaded, mods as "for Claude Code", and there are open bug reports | ignored |
| Band and panel | yes | yes (the sparklines are text instead of `Raster`) | probably not | no |
| Options (`userConfig`) | install screen and `/config` | `/config` | not asked: the defaults apply | — |
| Browser and folder | yes | yes | inside the VM: they cannot reach the host's desktop | — |
| Automatic updates | yes | off (they need the `claude plugin …` CLI); `/kpi update` tries by hand | no | no |

- **Desktop app**: everything works except automatic updates. Sessions are recorded with the `desktop` kind, so `--kind desktop` filters them.
- **Cowork**: not supported yet. [docs/cowork-test.md](docs/cowork-test.md) is the checklist to try it on macOS; the result decides whether support is added (data in the mounted work folder, text output only).
- **Chat**: not possible. Plugin hooks do not run in chat and there is no local file system.

## Updates

Since 0.3.0 kpi-tracker **updates itself**. Once a day (and right after you update Claude Code), about ten seconds after an interactive session starts, it refreshes the marketplace catalogue and checks for a new version:

- **compatible** with your Claude Code: it installs it and tells you; it becomes active with `/reload-plugins` or at the next start;
- **requires a newer Claude Code**: it **does not install it** and warns you (toast, a line in the band, `/kpi` and the transcript) with the required version. Update Claude Code with `claude update`: at the first start after that, the plugin updates.

If the installed version requires a newer Claude Code than the one in use (for example after a manual update), the plugin keeps recording what it can and shows the same warning.

`/kpi update` shows the status (installed version, latest available, Claude Code required and in use, last check) and installs the latest version right away if compatible; `/kpi update --check` only checks. The behaviour is set with the `autoUpdate` option (`auto`, `avviso`, `off`, see [Configuration](#configuration)). If the check fails (no network, `git` missing) it retries after an hour, silently: after three failures in a row a line appears in the transcript.

> **Keep the marketplace's native auto-update off** (`/plugin` → Marketplaces, off by default for third-party marketplaces): it installs new versions without checking which Claude Code they require. If it is on, kpi-tracker tells you once and leaves the updates to it.

Automatic updates work from the CLI (they need the `claude plugin …` commands). With `--plugin-dir` (development) they are off.

**Your own marketplaces** (for example a company catalogue on GitLab): they work unchanged, also with another marketplace or plugin name and with any `CLAUDE_CONFIG_DIR`. The catalogue can list the plugin:

- with a path (`"source": "./"`, a mirror of this repo): version and `compat.json` are read from the catalogue's clone;
- with a git repo (`"source": { "source": "url", "url": "…" }`, `github` or `git-subdir`, with an optional `ref`): they are read with a `git fetch --depth 1` into `_meta/upstream.git` among the KPI data, using the git credentials already configured (git never asks for them in the terminal);
- with a pinned commit (`sha`) or from npm: whoever manages the catalogue decides the versions, and the plugin does not step in.

**From 0.2.0** one last manual update is needed, from a shell:

```bash
claude plugin marketplace update tommy6134
claude plugin update kpi-tracker@tommy6134
```

Then restart Claude Code (or `/reload-plugins` in the open sessions).

## Uninstalling

To disable or uninstall it: `/plugin`, Installed tab, or `claude plugin uninstall kpi-tracker@tommy6134`. The collected data stays in `<config>/kpi/` until you delete it.

## Where the data goes

```
<Claude Code config folder>/kpi/        e.g. ~/.claude/kpi/ or $CLAUDE_CONFIG_DIR/kpi/
  _meta/kpi-root.json
  _reports/            generated HTML reports (or in reportDir)
  _exports/            CSV/JSON exports (or in reportDir)
  -Users-name-work-project/                    a project (launch folder, / and . become -)
    project.json                               real path, repo
    2026-10-12_10-31-07_3f9a1c2e/              a session: local date-time + start of the id
      session.json                             metadata and aggregated KPIs
      details.json                             files touched, turns, commits, PRs, subagents…
      events/s01-7f3a-0001.jsonl               raw events (source of truth)
```

The full format is in [docs/storage.md](docs/storage.md).

## Commands

| Command | What it does |
| --- | --- |
| `/kpi` | Summary: current session, today, last 7 days |
| `/kpi live` | Panel with the session's KPIs |
| `/kpi band on\|off` | Band above the prompt, permanently ("Hide" on the band applies to the session) |
| `/kpi stats [filters] [--by day\|week\|month\|project\|model\|branch\|kind\|session\|category]` | Every KPI of the filtered set |
| `/kpi sessions [filters] [--limit N]` | List of sessions |
| `/kpi projects [filters]` | Totals per project |
| `/kpi session <id\|current>` | Detail of one session |
| `/kpi report [filters] [--no-open] [--folder]` | Offline HTML dashboard, opened in the browser; `--folder` also opens its folder in the file manager |
| `/kpi export csv\|json [filters] [--level sessions\|days\|turns\|events] [--standard\|--excel] [--folder]` | Export, with columns and values in the chosen language. The CSV follows the language: standard (`,` and `.`) in English, Italian Excel (`;` and decimal comma) in Italian; `--standard` and `--excel` force one; `--folder` opens the file's folder |
| `/kpi folder [report\|export\|data]` | Opens the reports folder (default), the exports folder or the data folder in the file manager (Finder, File Explorer, Nautilus…) |
| `/kpi prune --older-than 180d [--yes]` | Lists, and with `--yes` deletes, the older sessions |
| `/kpi rebuild [filters]` | Recomputes the KPIs from the raw events |
| `/kpi update [--check]` | Update status; installs the latest version right away if compatible (`--check` only checks) |
| `/kpi help` | Help |

**Filters:** `--project <text|.>`, `--session <id>`, `--since` / `--until` (`today`, `yesterday`, `7d`, `24h`, `2w`, `3m`, `2026-10-01`, `01/10/2026` day/month/year), `--month 2026-11` (or `11/2026`: since and until on that month), `--model`, `--kind interactive|print|sdk|desktop|vscode`, `--branch`, `--repo`, `--category` (see [Activity categories](#activity-categories)). Every subcommand and option also has its Italian name (`statistiche`, `sessioni`, `esporta`, `pulisci`, `--da`, `--mese`, `--progetto`, `--per`…), whatever the language.

**Export file names:** `kpi_<name_surname>_<period>[_<level>].csv|json`, for example `kpi_mario_rossi_2026-11.csv`. The name comes from the `fullName` option, or else from `git config user.name`, in lower case, without accents and with `_` for spaces; without either it is left out. The period is the one of the filter: a day (`2026-11-03`), a month (`2026-11`, also with `--month`), whole months (`2026-09_2026-11`) or the range (`2026-09-15_2026-11-02`), and exporting the same period again overwrites the file. Without a date filter, or with only `--since` or `--until`, it is the date and time of the export (`2026-11-03_14-30-05`), as before. The sessions level has no suffix; the others add it in the export's language (`_days`, `_giorni`), and so do the parts beyond ~3.5 MB (`_part2`, `_parte2`). `--out` picks the file freely.

**Export columns:** the sessions level has one row per session with its KPIs, including lines added and removed per file class (`lines_added_src`, `lines_removed_cobol`…), builds succeeded and failed, and the permission outcomes. Time quantities (cost, tokens, turns, lines in total) respect the date filter; the per-class lines, builds and the other counts come from the whole session. New columns are added at the end, so sheets built on the column positions keep working.

**Language:** `--lang en|it` (`--lingua`) picks the language of one command: text reports, HTML report, CSV and JSON (columns, values, file name). Without it, the `language` option applies. The HTML report also has an English/Italiano selector next to the theme, and opens in Italian with `#it` in the address (`#en` for English).

**Opening the folder.** An HTML page opened from `file://` cannot start programs, so the report's header shows the reports and exports folders with three buttons: **Open** (the folder in the browser, when the browser can read it), **Copy path** and **Copy command** (`/kpi folder report`: paste it into Claude Code and the file manager opens). The `/kpi live` panel has a **Folder** button too. On Linux it uses `xdg-open`, on macOS `open`, on Windows `start`, and in WSL Windows' `explorer.exe` (the path is converted with `wslpath`).

Only you see the `/kpi` report: Claude gets a short line, so it does not use up context. With `--ctx` the full report goes to Claude too, for example so it can analyse your KPIs.

## Configuration

From `/config` (the plugin's section) or in `settings.json` under `pluginConfigs`:

| Option | Default | Meaning |
| --- | --- | --- |
| `language` | `"en"` | Language of the band, panel, `/kpi`, reports and exports: `en` or `it`. Whoever updates from 0.3.0 with recorded data and never chose a language stays in Italian (the plugin sets `it` once) |
| `dataDir` | `""` | Absolute data folder (`~/…` works too); empty = `<config>/kpi` |
| `reportDir` | `""` | Absolute folder (`~/…` works too) for HTML reports and exports; empty = `_reports/` and `_exports/` in the data folder |
| `fullName` | `""` | Name and surname in the export file names (`kpi_mario_rossi_2026-11.csv`); empty = `git config user.name` |
| `buildCommands` | `""` | Your own build commands, comma-separated (`./build.sh, make dist, npm run package:all`): a program or the start of a command line, counted as builds whatever the built-in rules say |
| `testCommands` | `""` | Your own test commands, comma-separated (`./run-tests.sh`), counted as tests |
| `categoriesFile` | `""` | File with the rules of the [activity categories](#activity-categories) (`~/…` works too); empty = `categorie.json` or `categories.json` in the data folder |
| `streamTiming` | `true` | Hooks the response stream for TTFT, latency and per-request tokens; turn it off if you notice slowdowns |
| `autoUpdate` | `"auto"` | `auto` installs compatible new versions by itself; `avviso` (notify) only reports them (install with `/kpi update`); `off` no automatic check |

## Activity categories

Optional, off by default: whoever does not use it sees no change. A category says what kind of work a session was (documentation, development, testing…), worked out from the **git branch** name, so you can filter and group by it.

The rules go in a JSON file: `categorie.json` or `categories.json` in the data folder (`<config>/kpi/`), or the file named in the `categoriesFile` option. Not in the plugin folder: every update replaces it.

```json
{
  "column": "category",
  "keywords": { "docs": "Documentation", "dev": "Development", "qa": "Testing" },
  "fallback": { "doc": "Documentation", "test": "Testing", "src": "Development" }
}
```

The keys can also be written in Italian (`colonna`, `parole`, `ripiego`); the labels stay as you write them.

- **Keyword in the branch name.** The name is split on `-`, `_`, `/` and `.`, and whole words are compared, ignoring case: `feature/PROJ-123-docs` contains `docs`, while `latest-fix` and `testing` do not contain `test`. In a session with several branches the last one holding a keyword counts; in a branch with several keywords, the first from the left.
- **Fallback.** Without a keyword, the file class with the most lines added among the `fallback` keys counts (classes: `src`, `test`, `doc`, `cobol`, `mainframe`, `config`, `other`); on a tie, the order of the keys. With zero lines the session has no category.
- **Where it shows.** A column at the end of every export level, named after `column` (`category` by default), with the session's value on every row; `--category <label|keyword|none>` on every command (`none` = sessions without a category); `/kpi stats --by category`; filter and column in the HTML report; a line in `/kpi session`.
- **Computed when reading, never stored**: it applies to every recorded session, and changing the rules needs no recomputation. The file is read at every `/kpi`, so a change applies right away.
- **Invalid file** (broken JSON, a value that is not a text, an unknown fallback class): the categories stay off, and `/kpi` says why on its first line.

## Development

The plugin is a **mod**: a TypeScript module that runs inside Claude Code (`hooks/register.ts`). No build step, no dependencies.

```bash
claude plugin validate . --strict   # manifest, module, state contract
claude plugin test .                # tests (tests/*.test.ts) with in-memory fs, session and clock
claude --plugin-dir .               # a session with the mod loaded from the repo (hot reload on save)
```

During development set `dataDir` to a folder **outside the repo**: the repo is watched for hot reload, and writing data into it would reload the module on every save. For example, in `~/.claude/settings.json`:

```json
{ "pluginConfigs": { "kpi-tracker@inline": { "options": { "dataDir": "~/.claude/kpi-dev" } } } }
```

Code layout:

| Folder | Contents |
| --- | --- |
| `hooks/register.ts` | The only file that uses `$`: binds the engine (`hostOf`) and registers every hook |
| `hooks/tracker.ts` | Module state, session binding, event queue, flush |
| `hooks/core/` | Paths, time, events, writer, on-disk binding and recovery |
| `hooks/collect/` | Translation of tool results into metadata (never text) |
| `hooks/analysis/` | Pure reducer, statistics, Bash classifier, lines of code, merge |
| `hooks/query/`, `hooks/commands/`, `hooks/format/` | Filtered reads, aggregates, activity categories, `/kpi` and text reports |
| `hooks/report/`, `assets/report/` | HTML report (dataset + template, style and plain-JS app) |
| `hooks/export/`, `hooks/maintenance/` | CSV/JSON export, pruning, rebuild |
| `hooks/ui/` | Band, panel, sparklines |
| `hooks/i18n/` | Languages: English catalogue (the key is the Italian text in the code), labels of stored codes, language migration |
| `hooks/update/` | Updates: version comparison, marketplace install and catalogue, reading the release from git repos, compatibility check |
| `types/index.d.ts` | `$.state` contract |

Texts are written in Italian in the code, with `L.t('…')`, and translated in `hooks/i18n/en.ts`: a text without a translation does not compile (`tsc`). The codes stored on disk (`interattiva`, `ricarica`, `altro`…) stay Italian and are only translated when shown (`hooks/i18n/codes.ts`). The HTML report's texts live in the `EN` dictionary of `assets/report/app.js`. Code comments are in Italian.

### Releasing a version

1. Bump `version` in `.claude-plugin/plugin.json`, otherwise neither automatic updates nor `claude plugin update` see anything new.
2. If the code uses engine events or APIs newer than the current minimum, raise `minClaudeCode` in `.claude-plugin/compat.json`. Claude Code has no field for a minimum version, and a version that uses missing APIs passes validation but breaks silently: this file is what stops installs with an older Claude Code from updating. Align the requirements in this README too.
3. Update the CHANGELOG, then bring the version to `main`: the marketplace follows the default branch.

Documentation (in Italian in [docs/it/](docs/it/)): [KPI catalogue](docs/kpi.md) · [on-disk formats](docs/storage.md) · [privacy](docs/privacy.md) · [CHANGELOG](CHANGELOG.md).

## Known limits

- The **cost** is the one Claude Code computes (API equivalent, its service calls included); there is no cost per model or per subagent. Since 0.4.0 it matches `/cost`, including what is spent outside turns; only what Claude Code spends after closing a session that is never resumed is left out.
- Of the **user's answer** in a permission dialog only the "no" is seen (since 0.5.0; before, it counted as an interruption): decisions, dialogs, denials and rejections are counted.
- The outcome of **piped** Bash commands reflects only the last command, except for builds and tests whose output holds a known failure marker (`BUILD FAILURE`, failed tests…), which count as failed.
- On **Linux** browsers installed as snap or flatpak (Firefox on Ubuntu, Brave, Chromium) cannot read hidden folders such as `~/.claude`: `/kpi report` then opens a copy of the report in the Downloads folder (`kpi-report.html`, overwritten each time). To avoid the copy set `reportDir` to a visible folder, for example `~/Documents/kpi`.
- **Documents created** (Word, Excel, PDF…) are seen only inside a git repo: files outside it, ignored by git or created and deleted in the same turn are not counted.
- Sessions from before the install are not imported.

## License

[MIT](LICENSE) © 2026 Thomas Amerio
