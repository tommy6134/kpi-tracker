# Changelog

## 0.4.0

Automated tests on Linux (Ubuntu 25.10, Claude Code 2.1.311); the desktop app and Cowork are still to be tried on macOS. The minimum Claude Code stays 2.1.287: if the engine lacks the APIs the language migration uses, the migration is simply skipped.

- **Exact cost.** The KPI cost now matches `/cost` and the status line. `session.measure` fires only at the end of a main turn, so what was spent outside turns (background subagents that finish later, service calls, the stretch before `/exit`) never arrived, and the next segment (reload, resume) took it as its baseline: on real data between 4 and 45 cents were missing at each boundary. The plugin now reads Claude Code's cost ledger when a subagent finishes, every minute, before `/kpi` and when the session closes, and the cost between one segment and the next is counted when the ledger belongs to the same session.
- New KPI **cost outside turns**, in `/kpi stats`, `/kpi session`, the HTML report and the `cost_outside_turns_usd` export column. `/kpi session current` also shows the cost according to Claude Code next to the KPI one.
- At the first start of 0.4.0 the past sessions are recomputed once from the raw events, with a line in the transcript stating the recovered cost.
- **English and Italian.** New `language` option (`en` by default, picked at install time or from `/config`): band, panel, `/kpi`, help, messages, HTML report and CSV/JSON exports (columns, values, file names) in the chosen language. Whoever updates from 0.3.0 with recorded data and never chose a language stays in Italian: the plugin sets `it` once.
- `--lang it|en` (`--lingua`) changes the language of one command. Every subcommand and option is accepted in both languages.
- The HTML report has an English/Italiano selector next to the theme (`#en` / `#it` in the address pick the language too).
- The CSV format follows the language: standard (`,` and `.`) in English, Italian Excel (`;` and decimal comma) in Italian; `--standard` and `--excel` force one.
- Numbers and dates in the language's format: `1,234.56` and `2026-10-12` in English, `1.234,56` and `12/10/2026` in Italian.
- The codes stored on disk do not change (`interattiva`, `ricarica`, `altro`…): reports and exports translate them when they show them, and old data needs no migration.
- Documentation in English (`README.md`, `docs/`) with an Italian copy (`README.it.md`, `docs/it/`).
- **Open the folder** of reports and exports in the file manager: new `/kpi folder [report|export|data]` (`cartella`), `--folder` (`--cartella`) on `/kpi report` and `/kpi export` (the file's folder, also with `--out`), a **Folder** button in the `/kpi live` panel. In WSL reports and folders open with Windows' `explorer.exe`.
- The HTML report's header shows the reports and exports folders with **Open** (`file://` link), **Copy path** and **Copy command**: a page opened from `file://` cannot start the file manager, Claude Code can.
- HTML report: the custom period's date fields no longer show when another period is selected, and the header wraps on narrow screens.
- **Desktop app, Cowork and chat**: a README section explains what works where (the desktop app's Code tab shares `~/.claude` and data with the CLI; Cowork is still to be tried; chat cannot run mods), and [docs/cowork-test.md](docs/cowork-test.md) is the checklist to try the desktop app and Cowork on macOS. Band, panel and `/kpi` are tested on the `desktop` surface too.

## 0.3.0

From 0.2.0 one last manual update is needed (`claude plugin marketplace update tommy6134` and `claude plugin update kpi-tracker@tommy6134`); after that, the plugin updates itself.

- Automatic updates with a compatibility check: once a day, and right after a Claude Code update, the plugin refreshes the marketplace catalogue and installs the new version only if the Claude Code in use is recent enough. It becomes active with `/reload-plugins` or at restart.
- A version that requires a newer Claude Code is not installed: a warning with the required version and `claude update` (toast, a line in the band, `/kpi`, transcript; toast and transcript only once).
- New `.claude-plugin/compat.json` with the minimum Claude Code (`minClaudeCode`) of each version. At startup each version checks its own, and warns if the engine is too old.
- Works with your own marketplaces too (e.g. a company catalogue on GitLab), with any marketplace or plugin name and any `CLAUDE_CONFIG_DIR`. If the catalogue lists the plugin with a git repo (`url`, `github`, `git-subdir`), version and `compat.json` are read with `git fetch --depth 1` into `_meta/upstream.git`, never asking for credentials in the terminal; with a pinned commit (`sha`) or from npm the catalogue decides.
- New `/kpi update` (`aggiorna`): update status and immediate install; `--check` (`--verifica`) only checks.
- New `autoUpdate` option: `auto` (default), `avviso`, `off`.
- If the marketplace's native auto-update is on, the plugin says so once and does not step in: the native one does not check the Claude Code version.
- Failed checks (network, `git`): a new attempt after an hour, without warnings; after three failures in a row, a line in the transcript.

## 0.2.0

Tested on Linux (Ubuntu 25.10, Claude Code 2.1.299) and on Windows.

- `/kpi live` panel redesigned with cards: four cards on top (cost, context, duration, turns) and one card per section with the title on the border. One metric per row with the value on the right; tools, Bash commands, files and subagents have one row each.
- Threshold colours: values green, yellow from 50%, red from 80%. Borders are grey except Context, Limits and Errors, which take the threshold colour; zeros are dimmed.
- If there are errors, the Errors card moves right under the top cards.
- The panel no longer hides the bottom sections when space runs out: it scrolls with the wheel or the arrow keys.
- Adaptive layout: top cards 2×2 in a narrow panel and on one row from 68 columns; sections on two columns from 78.

## 0.1.1

Tested on Linux (Ubuntu 25.10, Claude Code 2.1.299).

- New `reportDir` option: folder for HTML reports and exports, instead of `_reports/` and `_exports/` in the data folder.
- Linux: snap and flatpak browsers cannot read hidden folders, so `/kpi report` opened an error page while saying "Opened in the browser". Now, if the report is in a hidden folder, a copy in the Downloads folder (`kpi-report.html`) is opened.
- A session closed by `/clear` or by a resume now counts as ended, no longer as interrupted.
- `--since` and `--until` reject non-existent dates (`32/13/2026`, `30/02/2026`) instead of returning zero sessions.
- `--out` accepts `~/…` and Windows paths, and rejects relative ones with a message; a multi-part export without an extension no longer overwrites the first part.
- HTML report: drop-down menus readable in the dark theme on Linux and Windows.

## 0.1.0

First public version.

- Recording of every measurable KPI through the engine hooks: sessions and segments, prompts, turns, requests (TTFT, latency, per-request tokens), cost, context, compactions, rate limits, tools, Bash commands by category, lines of code, git (commits, pushes, PRs), permissions, subagents and workflows, skills, slash commands, errors, notifications.
- Data in `<configDir>/kpi/<project>/<session>/` with raw JSONL events, summary and details; crash recovery and full rebuild.
- Live band above the prompt and session panel (`/kpi live`).
- `/kpi` with summary, statistics, sessions, projects, session detail, filters and groupings; output visible only to the user (`--ctx` to include it in the context).
- Offline HTML report with charts and interactive filters; CSV (Italian Excel or standard) and JSON export at four levels; pruning and rebuild.
- Privacy by design: no text of prompts, responses or command arguments.
