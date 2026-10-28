# KPI catalogue

_Italiano: [docs/it/kpi.md](it/kpi.md)_

Every KPI is **measured**: ratios (cache hit, cost per turn…) are computed from measured values, not estimated. Every KPI aggregates by day, week, month, project, model, session kind, branch and repo, and by activity category when the categories are on.

**Source** column: the engine event (mod hook) or the field the data comes from. **Gran.** column: E = per event, T = per turn, S = per session.

## Session

| KPI | Definition | Source | Gran. |
| --- | --- | --- | --- |
| Sessions | number of sessions (folders) | storage | S |
| Kind | interactive, print (`claude -p`), sdk, desktop, vscode | `session.start` (`isInteractive`, `surface`), `CLAUDE_CODE_ENTRYPOINT` | S |
| Segment origin | startup, resume, clear, fork, reload (hot reload) | `classic.SessionStart.source`, `$.state` | S |
| Segments | processes that worked on the session (resumes, reloads) | storage | S |
| End reason | clear, resume, logout, prompt_input_exit, other, interrupted | `session.end.reason`, heartbeat | S |
| Duration | from the start to the last activity | `$.session.usage().startedAt`, events | S |
| Claude Code versions | per segment | `$.session.version()` | S |
| Project, repo, branch | launch folder, git repo, branch (and changes) | `session.start.cwd`, `$.session.repo()`, `git rev-parse` | S/E |
| Resume | seconds since the last response, context tokens, expired cache | `classic.SessionStart` (resume/fork) | S |
| Previous/next session | link between sessions split by `/clear` | storage | S |
| Activity category | optional: from a keyword in the branch name, or else from the file class with the most lines added (rules in `categorie.json`, see the README). Computed when reading, never stored | branches, `files.byClass` | S |

## Time and activity

| KPI | Definition | Source | Gran. |
| --- | --- | --- | --- |
| Active time | sum of the main turns' durations | `turn.complete.durationMs` | T |
| Utilisation | active time / session duration | derived | S |
| User response time | from the end of a turn to the next prompt (p50, p90) | clock, `prompt.submit` | T |
| Activity map | turns per hour × weekday (local time) | `turn.complete` | T |
| Active days | days with at least one event | events | S |

## Prompts

| KPI | Definition | Source | Gran. |
| --- | --- | --- | --- |
| Prompts by origin | composer, sdk, task-notification, scheduled-trigger, peer, channel, auto-continuation, plugin… | `prompt.submit.origin.kind` | E |
| Prompts by source | user, sdk, system, loop_wakeup, schedule_wakeup, poll_event | `classic.UserPromptSubmit.source` | E |
| Queued | prompts written while a turn was running | `prompt.submit.turnId` | E |
| Length | characters, words, lines (mean, max); the text is not stored | `prompt.submit.text` (lengths only) | E |
| Attachments | images, documents, audio | `prompt.submit.attachments[].type` | E |
| @ mentions | by kind (file, already read, pdf) | `prompt.mention` | E |
| Expansions | expanded slash commands and MCP prompts, by name | `classic.UserPromptExpansion` | E |

## Turns and requests

| KPI | Definition | Source | Gran. |
| --- | --- | --- | --- |
| Main / subagent turns | | `turn.complete` (with or without `agentId`) | T |
| Turn duration | mean, p50, p90, max, histogram | `turn.complete.durationMs` | T |
| Outcome | answer, interrupted, refusal (with category), error | `turn.complete.reason`, `refusal.category` | T |
| Requests per turn | model requests in a turn | `turn.step` | T |
| Tools per turn | | `tool.call` | T |
| Stop reasons | end_turn, tool_use, max_tokens, pause_turn, refusal… | `turn.step` (result) | E |
| Time to first token (TTFT) | from the request to the first content chunk | `turn.step` wrapper (`streamTiming` option) | E |
| Request latency | request duration | `turn.step` wrapper | E |
| Output speed | output tokens per second of generation | derived | E |
| Server-side tools | calls run by the API (count, duration) | `turn.step.serverToolUses` | E |
| Model fallback | the model that answered differs from the one requested | `turn.step` | E |
| Response length | characters of the final response (the text is not stored) | `turn.complete.answer` (length only) | T |

## Tokens, cost, context, rate limits

| KPI | Definition | Source | Gran. |
| --- | --- | --- | --- |
| Tokens | uncached input, output, cache read, cache write, total; per model, agent, day | `turn.step.usage` (or `turn.complete.usage` without `streamTiming`), `session.compact.usage` | E |
| Cache hit | cache read / (input + cache read + cache write) | derived | T/S |
| Subagent share | subagent tokens over the total | `agentId` | S |
| Cost | USD computed by Claude Code: sum of the ledger's deltas, including what was spent between one segment and the next (module reload, resume from a new process) | `session.measure.cost.usd`, `$.session.usage().cost` | S |
| Cost per turn | cost delta between two end-of-turn measurements, attributed to the last turn | derived | T |
| Cost outside turns | the part of the cost spent outside a main turn: background subagents that finish later, service calls, exit. `session.measure` fires only at the end of a turn, so the ledger is read when a subagent finishes, every minute, before `/kpi` and when the session closes | `$.session.usage().cost` | S |
| Cost per commit, per 100 lines, per session | | derived | A |
| Context | fill % (max, mean at turn end, last), window size | `session.measure.context` | T |
| Compactions | by trigger (manual, auto…), tokens before/after, reduction %, tokens spent | `session.compact` | E |
| Rate limits | % used at 5 hours, 7 days, spend (last, max, reset) | `session.measure.rateLimits` | T |
| Rate limit blocks | | `classic.StopFailure.error = rate_limit` | E |

## Models and effort

| KPI | Definition | Source | Gran. |
| --- | --- | --- | --- |
| Requests and tokens per model | | `turn.step` | E |
| Effort | distribution of low, medium, high, xhigh, max | `turn.step.effort` | E |
| Model switches | from, to, origin (command, picker, auto…) | `classic.PostModelSwitch` | E |
| Subagent models | | `agent.spawn` (result) | E |

## Tools

| KPI | Definition | Source | Gran. |
| --- | --- | --- | --- |
| Calls per tool | built-in, MCP, plugin; main or subagent | `tool.call` | E |
| Outcome | ok, error, denied (by a rule, the mode, a hook or the auto mode classifier), rejected by the user in the permission dialog, interrupted; error rate. The kind of failure is recognised from the start of the error text, read in memory and never stored | `tool.call` (result) | E |
| Duration | without permission waits and hooks (mean, p90) | `classic.PostToolUse(Failure).duration_ms` | E |
| Wall time | including the permission wait | clock around `tool.call` | E |
| Read-only | share of calls run read-only | `tool.call.isReadOnly` | E |
| Parallelism | tools per batch | `classic.PostToolBatch` | E |
| Background | commands and agents in the background | Bash and Agent results | E |
| MCP servers | calls and errors per server | `mcp__server__tool` name | E |
| WebFetch | domains (host only), bytes, HTTP codes, errors | WebFetch result | E |
| WebSearch | searches | WebSearch result | E |
| Todos | total and completed of the last list | TodoWrite result | E |
| Read | lines read, unique files read | Read result | E |

## Bash

Categories: **git, test, build, package, docker, fs, network, other** (stored as `altro`). Only `program subcommand` is stored (e.g. `mvn test`), never the arguments.

| KPI | Definition | Source | Gran. |
| --- | --- | --- | --- |
| Commands by category | with outcome (ok, error, interrupted, timeout, background) | classifier + result | E |
| Most used commands | `program subcommand` | classifier | E |
| Tests | runs, passed, failed, pass rate | test category + outcome | E |
| Builds | runs, succeeded, failed | build category + outcome | E |
| Piped commands | the outcome reflects only the last command | classifier | E |
| Sandbox off | | Bash input `dangerouslyDisableSandbox` | E |

## Files and code

| KPI | Definition | Source | Gran. |
| --- | --- | --- | --- |
| Lines added, removed, net | per file, extension, class and day. Classes: test, cobol (`.cbl` `.cob` `.cpy` `.cobol`), mainframe (the mainframe files that are not COBOL: `.jcl` `.pli` `.pl1` `.rexx` `.rex` `.bms` `.ezt` `.clist`), config, doc, src, other. The class comes from the path, so a change of the rules applies to past sessions too once they are recomputed | `gitDiff` or `structuredPatch` of Edit/Write; content for created files | E |
| Files created, modified, read (unique) | | Edit, Write, Read | E |
| Documents created and regenerated | Word, Excel, PowerPoint, PDF and OpenDocument files (`docx`, `doc`, `odt`, `pdf`, `xlsx`, `xls`, `ods`, `pptx`, `ppt`, `odp`), counted per extension. They are born from Bash commands (pandoc, python-docx, openpyxl, scripts), so the plugin compares the repo's `git status` at the start of the session and at the end of every turn with Bash commands (in the background, 2 s at most, `--no-optional-locks`); a commit made in the meantime is read with `git diff`. Created = new file; regenerated = tracked file modified, or one already there written again. Not seen: files outside the repo or ignored by git, folders without git, files created and deleted in the same turn. Since 0.5.0; only counts, never the names | `git status`, `git diff` | T |
| Edits changed by the user | edits the user changed in the dialog | `userModified` | E |
| Files outside the project | | path outside the launch folder | E |
| Churn | files modified 3 or more times | details | S |

Lines written by subagents are counted from their tool calls, without double counting.

## Git

| KPI | Definition | Source | Gran. |
| --- | --- | --- | --- |
| Commits | by kind (committed, amended, cherry-picked), sha, branch | `gitOperation.commit` of the Bash result | E |
| Pushes | per branch | `gitOperation.push` | E |
| Merges and rebases | | `gitOperation.branch` | E |
| Pull requests | by action (created, merged…), number, URL | `gitOperation.pr` | E |
| Branches | branches seen and switches. The branch is read at start, at every prompt (in the background: a switch made from another terminal shows up at the next prompt) and after Claude's git commands | `git rev-parse` | E |
| Lines per commit | | derived | A |

## Permissions

| KPI | Definition | Source | Gran. |
| --- | --- | --- | --- |
| Decisions | allow, ask, deny per tool | `tool.check` | E |
| Decided by | rule, hook, mode | `tool.check` (`rule`, `hook`) | E |
| Dialogs shown | | `classic.PermissionRequest` | E |
| Denied by the classifier | denied by the auto mode classifier | `classic.PermissionDenied` | E |
| Denied tool calls | by a rule, the mode (don't ask) or a hook. Until 0.4.0 a call denied by a rule counted as a tool error | `tool.call` (deny, error text) | E |
| Rejected by the user | "No" in the permission dialog, also with a message for Claude. Since 0.5.0: until 0.4.0 a rejection counted as an interruption, and the old data stays that way (the text is not stored) | `tool.call` (error text) | E |

## Subagents and workflows

| KPI | Definition | Source | Gran. |
| --- | --- | --- | --- |
| Subagents launched | by type and model; background, fork, teammate | `agent.spawn` | E |
| Duration, tokens, tools per type | | turns and tools with `agentId` | E |
| Outcomes and errors | | Agent tool result | E |
| Workflows | distinct runs | `agent.spawn.workflow` | E |
| Max concurrent | | `classic.SubagentStart/Stop` | S |

## Skills, commands, instructions

| KPI | Definition | Source | Gran. |
| --- | --- | --- | --- |
| Skills | invocations, outcomes | `skill.prompt`, Skill tool result | E |
| Slash commands | by name and origin (also `/clear`, `/compact`, `/model`) | `command.run` | E |
| Instruction files loaded | by type (User, Project, Local, Managed) | `classic.InstructionsLoaded` | E |
| Tasks | created, completed | `classic.TaskCreated/Completed` | E |
| Folder changes | | `classic.CwdChanged` | E |

## Errors and notifications

| KPI | Definition | Source | Gran. |
| --- | --- | --- | --- |
| API errors | rate_limit, overloaded, billing_error, max_output_tokens, server_error… | `classic.StopFailure` | E |
| Failed, interrupted, refused turns | | `turn.complete` | T |
| Tool errors | | `tool.call` | E |
| Interrupts | interrupted turns, interrupted commands | `turn.complete`, results | E |
| Stops for max_tokens | | `turn.step` | E |
| Notifications | by type | `classic.Notification` | E |

## Not available

- cost per request, per model or per subagent (Claude Code exposes only the session's total cost);
- the user's "yes" in the permission dialog (the "no" is counted since 0.5.0);
- the engine's service calls (titles, classifiers), included only in the total cost;
- Bash's numeric exit code (only ok/error).
