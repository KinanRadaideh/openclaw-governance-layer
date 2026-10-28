# Finding 450: tools added by plugins, a decision for Kinan (2026-10-28)

**Status: decided and built, 2026-10-28.** Kinan took every recommendation in §4 ("Take
recommendations"). 11 tools are governed (`resource-extraction.ts`), 78 are declared with
reasons (`DELIBERATELY_UNGOVERNED` in `qa-round11.test.ts`), and the coverage test is green. The
cross-cutting choice (refuse unknown tools) stays "not now", as recommended. What was built and
checked is in `mg/FINDING-450-LOG-2026-10-28.md`. §6 below describes the state before the
decision.

## 1. The problem in one paragraph

The governance layer stops every agent action that is not allowed ("default-deny"), but it can
only do that for tools it knows how to read: it has to find the file, command or web address
inside the call. Chapter 3 says **"Every host tool is either governed or listed with a reason"**
(Table 3.1, `tab:gov-ungoverned`). The test behind that sentence only looked at OpenClaw's core
tools. OpenClaw also ships **plugins**, add-ons bundled with it, and they add tools of their own.
**27 bundled plugins declare 96 tools. 7 of those are already covered under core names. The
other 89 are neither governed nor listed.** When an agent calls one of them, the ledger records
the call as `ungoverned` and the call goes ahead; only the plugin's own checks apply. Lockdown
still stops them, because it is checked first.

## 2. How the list was found

Every plugin must name its tools in its manifest (`openclaw.plugin.json`, under
`contracts.tools`), and OpenClaw refuses to load a plugin tool that is not named there
(`src/plugins/registry-registrars-tools-hooks.ts`, `registerTool`). So the manifests are a
complete list of what bundled plugins can add. The test reads them through OpenClaw's own
inventory, `BUNDLED_PLUGIN_CONTRACT_SNAPSHOTS`. I then read each plugin's code and docs to see
what its tools reach and what the plugin checks itself.

**What no test can cover:** plugins someone installs from outside the repository. Nothing in the
repository names their tools. Today they are recorded as `ungoverned` like the 89 (see §4).

## 3. The 89 tools, in eight groups

"On by default" means an agent gets the tool with no setup. Everything else needs an operator to
switch the plugin on, connect an account, or add the tool to the agent's allowed list.

| #   | Group                                                   | Tools                                                                                                                                                                         | What they reach                                                                                                                                                                                                                                                                         | What the plugin checks itself                                                                                                                                                                                                                                                         | On by default?                                                                                               |
| --- | ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| 1   | **Runs programs on the Gateway machine** (1)            | `lobster`                                                                                                                                                                     | A Lobster "pipeline" can run any shell command (`exec --shell '…'`) on the machine the Gateway runs on. In effect, a second `exec`.                                                                                                                                                     | The working folder must stay inside the Gateway's own folder. Turned off when the agent is sandboxed. Approval steps exist, but the pipeline itself decides whether to include them.                                                                                                  | No: an operator must add `lobster` to the agent's allowed tools.                                             |
| 2   | **Files on a paired device** (4)                        | `file_fetch`, `dir_list`, `dir_fetch`, `file_write`                                                                                                                           | Read, list and write files on a "node", a device paired with the Gateway (laptop, phone, server). **A node can be the Gateway's own machine.**                                                                                                                                          | Strong, and closed by default: every call is refused unless the operator lists the command in `gateway.nodes.commands.allow` **and** gives per-device allowed folders. It also has "never" folders that always win, an ask mode, a size cap and a symlink check.                      | The tools appear, but every call is refused until an operator configures them.                               |
| 3   | **Steers another coding agent** (6)                     | `codex_threads`, `codex_session_send`, `codex_session_interrupt`, `codex_sessions_list`, `codex_session_read`, `codex_endpoint_probe`                                         | Codex sessions: list and read their transcripts, send instructions to a running Codex agent (which can itself run commands), interrupt it, fork, rename or archive threads.                                                                                                             | Only the owner gets the tools, and only after an operator configures the Codex plugin. Changes and raw transcripts each need a further policy switch.                                                                                                                                 | No.                                                                                                          |
| 4   | **Web pages and web searches** (4)                      | `firecrawl_scrape`, `tavily_extract`; `firecrawl_search`, `tavily_search`                                                                                                     | Scrape/extract: a web address the agent names, fetched by the Firecrawl or Tavily service. Search: a search term, with no address.                                                                                                                                                      | Only checks that the address is http(s).                                                                                                                                                                                                                                              | No: needs the plugin switched on (and usually an account key).                                               |
| 5   | **Calls and meetings** (5)                              | `google_meet`, `teams_meetings`, `zoom_meetings`, `voice_call`, `whatsapp_call`                                                                                               | Meetings: open a Chrome window on the Gateway machine or a node, join the meeting, listen, speak. `voice_call`: places phone calls through Twilio, Telnyx or Plivo. `whatsapp_call`: calls the person who wrote in.                                                                     | Meetings accept only their own vendor's addresses (`meet.google.com`, Teams, `*.zoom.us`). `whatsapp_call` "cannot call arbitrary phone numbers". **`voice_call` can ring any number once switched on**; I found no outgoing allowlist (there is one for incoming calls).             | Meetings: yes (they still need a signed-in browser to join). `voice_call`, `whatsapp_call`: no.              |
| 6   | **Chat and workplace apps the operator connected** (19) | `qqbot_channel_api`, `qqbot_remind`, `zalouser`, `discord_widget`, `discussion`, and 14 `feishu_*`                                                                            | The chat or workplace account the operator connected: send messages, read a discussion, post widgets, schedule a QQ reminder, call QQ's APIs. Feishu tools also edit, move and delete documents, wiki pages, tables and drive files.                                                    | Each uses only the connected account's own permissions. QQ deletes need a "confirmed" flag that the model itself sets. The Feishu sharing tool (`feishu_perm`) is off by default. `qqbot_remind` schedules a later agent turn that has **no tools** and only posts the reminder text. | `qqbot_remind`: yes. The others appear only once an operator connects that account.                          |
| 7   | **Secrets** (1)                                         | `onepassword`                                                                                                                                                                 | Reads a secret value from 1Password and gives it to the agent.                                                                                                                                                                                                                          | Only secrets the operator registered by name. Each secret is set to `auto`, `approve` or `deny`, and the default is `approve` (a human is asked). Approvals expire. The plugin keeps its own audit history.                                                                           | No.                                                                                                          |
| 8   | **OpenClaw's own records, models and display** (49)     | 35 `workboard_*`, `memory_store`, `memory_recall`, `memory_forget`, 5 `wiki_*`, `intent`, `llm-task`, `diffs`, `node_inference`, `qa_restart_wait`, `qa_restart_unsafe_probe` | Data OpenClaw keeps for itself: a task board, long-term memory, a wiki folder the operator chose, standing reminders. `llm-task` asks a model for JSON with no tools. `diffs` draws a diff from text it is given. `node_inference` runs a prompt on an Ollama model on a paired device. | Each stays inside its own store or folder. The `qa_*` tools belong to the QA test plugin, which is not shipped in packages.                                                                                                                                                           | `node_inference`: yes. Workboard is off by default and every workboard tool must also be allowed one by one. |

The nine seen in the QA (`file_fetch`, `dir_list`, `dir_fetch`, `file_write`, `teams_meetings`,
`zoom_meetings`, `google_meet`, `node_inference`, `qqbot_remind`) are exactly the ones that are
on by default.

## 4. The choices

There are two ways to account for each tool:

- **Govern it:** write an "extractor" so the gate can read the call. The call then falls under
  default-deny, so an Administrator must allow it with a rule before an agent can use it.
- **Declare it:** add it to the list of deliberate exclusions with the reason written down. The
  call goes ahead as today and is recorded as `ungoverned`, but the omission becomes a decision.

"Control surface" below means governing by the tool and action name alone (for example "allow
`file_fetch`"), the way `nodes`, `browser` and `sessions_spawn` are already governed. That is a
small change. Governing by the actual file or address is finer, and in some cases a lot more work.

| #   | Group                  | Options                                                                                                                                                                                                                                                                                                                             | My recommendation (yours to decide)                                                                                                                                                            |
| --- | ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Lobster                | **A** Govern as a control surface: refused unless a rule allows `lobster`; the whole pipeline goes in the ledger. **B** Declare: "off unless an operator allows the tool". Governing each command _inside_ a pipeline is not possible from the gate: it sees only the pipeline text, and Lobster runs the steps itself.             | **A.** It runs shell commands on the Gateway machine. Leaving it outside default-deny contradicts what `exec` being governed is for.                                                           |
| 2   | Files on a device      | **A** Govern as a control surface, like `nodes`. **B** Declare, relying on the plugin's own closed-by-default folder policy. **C** Govern by the actual file path. That needs paths that name _which device_, and the path model cannot express that today; a large change.                                                         | **A**, with the plugin's folder policy kept as a second layer. Today the gate governs `nodes` but not `file_write` to the same device, and that inconsistency is hard to defend in the report. |
| 3   | Codex                  | **A** Govern all six as a control surface aimed at another agent, as `sessions_spawn` and `subagents` already are. **B** Declare: owner-only, configured by an operator, changes need a separate switch. **C** Mixed: govern `codex_session_send`, `codex_session_interrupt` and `codex_threads`; declare the three read-only ones. | **C.** Instructing a running agent is governed elsewhere in the system. Reading session lists is like `sessions_list`, which is already declared.                                              |
| 4   | Web pages / searches   | Scrape and extract: **A** govern as network access by the address's host, using the same extractor as `web_fetch`; **B** declare. Searches: declare with `web_search`'s reason ("no hostname to match").                                                                                                                            | Scrape/extract **A** (small change; same rules as `web_fetch`). Searches: declare.                                                                                                             |
| 5   | Calls and meetings     | **A** Declare all five under the T8 reasoning, "the integration is the permission": an operator connected the meeting or phone account. **B** Govern `voice_call` as a control surface and declare the rest. **C** Govern all five.                                                                                                 | **B.** Meetings only accept their vendor's addresses, and `whatsapp_call` only rings the person who wrote in. `voice_call` can ring any number and costs money.                                |
| 6   | Chat and workplace     | **A** Declare all 19 under T8. **B** Declare the messaging ones under T8 and give Feishu its own reason: "acts in the workplace app the operator connected, within the permissions granted to it; the sharing tool is off by default". **C** Govern the Feishu delete and move actions.                                             | **B.** T8 was argued for messages. Editing and deleting company documents is a stretch of it, so it deserves its own written reason.                                                           |
| 7   | Secrets                | **A** Declare: the plugin's own per-secret policy is stricter than a gate rule could be (it asks a human by default, approvals expire, it keeps its own audit). **B** Govern as a control surface.                                                                                                                                  | **A.** Note for the report: the secret value comes back to the agent; the ledger's redaction applies to what is recorded.                                                                      |
| 8   | Own records and models | **A** Declare, reusing "Model-facing bookkeeping" and "Reads of state" where the reason matches. Declare the two `qa_*` tools as "test plugin, not shipped".                                                                                                                                                                        | **A.**                                                                                                                                                                                         |

### One choice that cuts across all the groups

**What the gate does with a tool it has never heard of.** Today such a tool is allowed and
recorded as `ungoverned`. This covers the 89 above until you decide, and any plugin installed
from outside. The alternative is to refuse (or ask about) any tool that is neither governed nor
declared, which is default-deny applied to the tool list itself. That needs the declared list to
move from the test file into the product, and it would stop outside plugins working until an
Administrator decides about them. **My recommendation: not now.** It is a behaviour change with
its own QA; keep it in mind for Chapter 4 or later work.

## 5. What each choice means for Chapter 3

The sentence, "Every host tool is either governed or listed with a reason", appears in Table 3.1
(`tab:gov-ungoverned`), the Requirements 5 and 6 paragraph, and the "Security boundaries" table
(row Tool coverage).

- **If every group is governed or declared, whichever way each one goes:** the sentence becomes
  true for every tool OpenClaw ships. Two edits are still owed:
  1. **"host tool" should say "every tool OpenClaw ships, including its bundled plugins"**,
     because plugins installed from outside are recorded but not listed.
  2. **Table 3.1 gains rows** for the declared plugin groups. Where a reason matches an existing
     row, the tools join that row (searches → "No hostname to match"; group 8 → "Model-facing
     bookkeeping"). New rows would be: chat and workplace apps, calls and meetings, the secrets
     broker, the test plugin, and the read-only Codex tools.

  The governed count and the "52 / 18 / 34" figures in `docs-notes/UNGOVERNED-TOOLS.md` change
  and must be re-derived. Governed tools do not appear in Table 3.1.

- **If you narrow the sentence instead of deciding per group:** for example, "Every tool in
  OpenClaw's core catalogue is either governed or listed with a reason; tools added by plugins are
  recorded in the ledger as ungoverned." That is honest and needs no code. But it says out loud
  that a shell-running tool (`lobster`, once allowed) and a file-writing tool sit outside
  default-deny, which an examiner may read as a gap. The test would still need a plugin list, or
  the next plugin arrives unseen, which is how this finding happened.
- **If the gate later refuses unknown tools (the cross-cutting choice):** the sentence can be
  stronger: "…and a tool on neither list is refused."

Either way, Chapter 3 should not be edited until this is decided (QA of 2026-10-28, §4 row 1).

## 6. What was changed, and what is not done

- **`src/governance/qa-round11.test.ts`:** a new case, _"governs, or explicitly declines to
  govern, every tool a bundled plugin contributes"_, reads every bundled plugin's declared tools.
  It **fails on the current tree, listing the 89** (run 2026-10-28: 1 failed, 23 passed). A
  second new case checks that it really reads the plugin list: more than 90 names, including the
  nine seen in the QA. It passes. `oxfmt --check` is clean. Typecheck and lint were not run (test
  file only).
- **Once you decide:** the governed ones get extractors in `resource-extraction.ts` with tests.
  The declared ones go into `DELIBERATELY_UNGOVERNED` with their reasons. The test then goes
  green, and `docs-notes/UNGOVERNED-TOOLS.md` and the finding register are updated.
- **Not checked:**
  - nothing was driven live for this note;
  - whether a Lobster step that calls an OpenClaw tool (`openclaw.invoke`) passes through the
    gate;
  - `memory-wiki`'s folder guard, line by line.
- **Small correction to the QA note's finding 450 text:** the setting is
  `gateway.nodes.commands.allow`, not `gateway.nodes.allowCommands`. Not edited, since this task
  touches only the test and this note.
