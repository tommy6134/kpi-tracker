# Test plan: Cowork

_Italiano: [docs/it/cowork-test.md](it/cowork-test.md)_

This checks on a real Cowork what the automated tests cannot: where the mod runs, where it writes, and what Cowork shows. One short task is enough, so the test costs little usage. It is written for the Linux desktop app (beta); on macOS the app's folder is `~/Library/Application Support/Claude` instead of `~/.config/Claude`.

## Before starting

- Claude desktop app up to date and signed in. In Cowork's settings, **Run new tasks in the cloud** off: a cloud task is not recorded.
- In the Code tab, in a local session, `/status` shows the **Claude Code** row: note the version (mods work from 2.1.286).
- The plugin zip of the branch under test, from the repo folder:

  ```bash
  git archive --format=zip -o ~/kpi-tracker.zip HEAD
  ```

- Note what is already there: `ls ~/.claude/kpi ~/.claude/kpi/_meta`.

## 1. Install in Cowork

**Customize → Plugins → Add → Upload plugin** with the zip.

- [ ] the plugin page lists the hooks;
- [ ] it has a **Settings** tab with the options (note yes or no).

The uploaded plugin reaches the CLI too, as `kpi-tracker@synced`. If the CLI has the marketplace copy, the synced one is not loaded.

## 2. One short task

1. New Cowork task, with one connected folder, better a git repo.
2. One prompt that uses tools: _"List the files of the connected folder and read the README"_.
3. Type `/kpi env`; if the command is not found, `/kpi-tracker:kpi env`.
   - [ ] the command exists and answers (copy the table).
4. Type `/kpi`, then `/kpi live`.
   - [ ] `/kpi` answers with the summary;
   - [ ] `/kpi live` says that Cowork has no panel;
   - [ ] a band above the prompt appears (note yes or no).
5. Close the task.

## 3. On disk

```bash
cat ~/.claude/kpi/_meta/ambiente-cowork.json
ls ~/.claude/kpi
find ~/.config/Claude/local-agent-mode-sessions -path '*/.claude/kpi' -prune -print
```

- [ ] `ambiente-cowork.json` exists, with `"kind": "cowork"` and `"cowork": "host"`;
- [ ] the task's project is the connected folder (`-home-…`), not `-var-empty` nor `Cowork`;
- [ ] `find` prints nothing: no KPIs in the task's own `.claude`.

## 4. From the CLI

- `/kpi sessions --kind cowork`: [ ] the task is there, with cost, tokens and tools;
- `/kpi session <id>`: [ ] the details match the task;
- `/plugin`: [ ] if the marketplace copy is installed, the `@synced` copy is reported as not loaded.

## 5. Delete the task

Delete the task in the app, then `/kpi sessions --kind cowork` again: [ ] the task is still there.

## After the test

Remove the uploaded plugin from **Customize → Plugins**: otherwise it stays on the account and keeps reaching the CLI as `@synced`.

## What to report

On Linux, with Claude Code open on this repo, nothing: Claude reads the files itself. Otherwise the ticked boxes, the Claude Code version, the `/kpi env` table and the output of step 3.
