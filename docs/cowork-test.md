# Test plan: desktop app and Cowork (macOS)

_Italiano: [docs/it/cowork-test.md](it/cowork-test.md)_

This finds out what kpi-tracker does in the Claude desktop app and in Cowork, which cannot be tried from the CLI. Report the outcome of each step (one line or the copied output is enough): it decides what to support after 0.4.0.

## Before starting

- Claude app for macOS up to date. In the Code tab, in a local session, `/status` shows the **Claude Code** row: note the version (mods work from 2.1.286).
- The plugin zip, from the repo folder:

  ```bash
  git archive --format=zip -o ~/Desktop/kpi-tracker.zip HEAD
  ```

## 1. Desktop app, Code tab

1. Install the plugin: **+** next to the prompt box → **Plugins** → **Add marketplace** with `tommy6134/kpi-tracker` → **Add plugin**. If the plugin is already installed from the terminal with the user scope, skip this step.
2. Open a **local** session in any project and ask Claude for a couple of things that use tools (read a file, run `ls`).
3. Check:
   - [ ] the KPI band above the prompt (cost, tokens, context);
   - [ ] `/kpi live` opens the panel; the **HTML report**, **Folder** and **Close** buttons work;
   - [ ] `/kpi` shows the summary, and the session has the `desktop` kind in `/kpi sessions`;
   - [ ] `/kpi report` opens the browser; `/kpi folder` opens Finder on the reports folder;
   - [ ] `/kpi session current`: "KPI cost · according to Claude Code (/cost)" shows two equal values (or almost, if a turn is running);
   - [ ] `/kpi update --check`: note the outcome (automatic updates are off in the app; this tells whether they at least work by hand).
4. In the terminal, `ls ~/.claude/kpi/`: the app's data must be in the same folder as the CLI's.

## 2. Cowork

1. Install the plugin on your account: **Customize → Plugins → Add → Upload plugin** with the zip (or **Add marketplace** with `tommy6134/kpi-tracker`).
2. Start a Cowork task with a work folder and type `/kpi`. If it is not found, try `/kpi-tracker:kpi`.
   - [ ] does the command exist? What does it answer?
   - [ ] does a band appear above the prompt?
3. Ask Claude, in the task: _"Run `echo HOME=$HOME CONFIG=$CLAUDE_CONFIG_DIR ENTRY=$CLAUDE_CODE_ENTRYPOINT; ls -la ~/.claude/kpi 2>&1; pwd` and show me the output"_.
   - [ ] note the output: it tells whether the mod wrote data, where, and how Cowork can be recognised.
4. Close the task, open a new one and repeat the command of step 3.
   - [ ] is the previous task's data still there?

## What to report

The boxes ticked or not, the Claude Code version, and the output of Cowork steps 3 and 4. They decide:

- **desktop app**: if `/kpi update` works, automatic updates get turned on there too;
- **Cowork**: if the mod runs, the data goes to the mounted work folder (the only one that persists) and only text output is used; if it does not, it is documented as unsupported.
