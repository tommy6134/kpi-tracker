# Privacy

_Italiano: [docs/it/privacy.md](it/privacy.md)_

kpi-tracker stores **metrics and metadata**, never content. Everything stays on your disk: the plugin sends data nowhere.

The only network traffic comes from **updates** (the `autoUpdate` option, unless `off`). At most once a day the plugin runs `claude plugin marketplace update`, that is a `git fetch` of the marketplace you installed it from. If the catalogue lists the plugin with a URL, it also runs a `git fetch --depth 1` of that repo to read its version. If there is a compatible new version, it runs `claude plugin update`. These are the same commands you would run by hand, and they only download: they do not run with `--plugin-dir` nor in `-p`/SDK sessions.

## What is stored

- numbers: tokens, costs, durations, counts, percentages, lines added and removed;
- names: tools, skills, subagents, MCP servers, slash commands (name only), models;
- absolute paths of the files read and modified, launch folder, git repo and branch;
- Bash commands reduced to `program subcommand` (e.g. `git commit`, `mvn test`), with a category;
- for commits: 7-character sha, kind, branch; for PRs: number, action, URL without query;
- for WebFetch: the host only (e.g. `docs.spring.io`);
- for documents created by commands (Word, Excel, PDF…): only how many, per extension.

## What is never stored

- the text of prompts and responses (only their **length**);
- the arguments of Bash commands: no commit messages, headers, tokens, passwords, URLs;
- the arguments of slash commands and skills;
- URL queries and paths;
- file contents, tool output, error messages;
- the session title (generated from the prompt text);
- the names of the documents created: the list of the repo's documents that `git status` returns stays in memory, only the counts are written.

## How it is guaranteed

- The Bash classifier (`hooks/analysis/bash-classify.ts`) drops quotes, heredocs, `$(…)` substitutions and assignments. A subcommand comes out only if it is in a known list for that program, otherwise it becomes `*`.
- Names go through `safeName`: a value that does not look like an identifier becomes `altro` (shown as "other").
- The outcome of a failed tool call (rejected by the user, denied, interrupted) is recognised from the start of its error text, in memory. The text is never stored, also when it carries the words the user typed in the permission dialog.
- The output of build and test commands is read in memory (its last 64 KB) to look for failure markers; only a flag is stored.
- The tests (`tests/units.test.ts`, `tests/ui-commands.test.ts`) check that no written file, exports included, contains prompt text, secret command arguments or commit messages.

## Model context

Only you see the `/kpi` report: the transcript, and so the model, gets a short line. The full report goes to the model only if you add `--ctx`.
