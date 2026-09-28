# The QA of 2026-09-27: what it changes in Chapter 3

Until 2026-09-28, `chapter3.tex` carried eight comment lines beginning `% QA 2026-09-27,
finding …`, each under the heading it concerned. Kinan asked for them to be moved out of the
report source. They now live here, one section per Chapter 3 heading, in chapter order. Each
section gives the comment as it was, what went wrong, what was changed, and what the section
should say once it is written.

Section numbers are the ones the chapter prints today. The full record of each finding (how it
was found, the test that proved it, the live re-check) is in `mg/QA-SESSION-2026-09-27.md`, and
the table of all sixteen findings is in `DOC-CHANGES-AFTER-T70.md` §0.

| Heading                          | Written?    | Findings      |
| -------------------------------- | ----------- | ------------- |
| 3.5.2.3 Path Canonicalization    | **written** | 385           |
| 3.5.4.2 Two-Gate Authentication  | stub        | 396           |
| 3.5.4.3 Ownership and Assignment | stub        | 381, 382, 383 |
| 3.5.6.2 Kill Switch              | stub        | 384 (and 395) |
| 3.5.7.1 Escalation Routing       | stub        | 386           |
| 3.5.7.2 Persistent Approvals     | stub        | 393           |
| 3.5.9 Tenancy and Agent Registry | stub        | 385           |
| 3.5.11 Management Interface      | stub        | 390           |

---

## 3.5.2.3 Path Canonicalization (written): finding 385

**The comment that was here:** "a path inside another agent's workspace nested under this
agent's own is now rendered absolute, so the baseline's "inside the workspace" read allowance
no longer reaches it, and recursive search results there are withheld."

**What went wrong.** On a normal installation, OpenClaw puts every agent after the first inside
the first agent's folder. The default agent `main` works in `ws-main`, and an agent `gamma`
created later works in `ws-main/gamma`. The baseline lets an agent read any file inside its own
workspace, so `main` could read everything `gamma` had. In the QA, a User who was not allowed to
use `gamma` asked `main` to read a file in `gamma`'s folder and got its contents back.

**What changed.** When a path leads into another agent's workspace that sits inside this agent's
own, canonicalization now gives it only its absolute form, the same form a path outside the
workspace gets. The baseline's read allowance matches only the workspace-relative form, so it
no longer applies. The read is then treated like any path no rule covers: refused, or put to a
person, depending on the escalation setting. Recursive searches (`grep`, `find`, `ls`) also leave
out results inside those nested folders, the same way they leave out a path a deny rule covers.
The list of nested workspaces comes from `nestedAgentWorkspaceRoots` in
`src/governance/agent-workspace-roots.ts`. It is built from OpenClaw's own configuration and
reused until that configuration changes. It is passed to `resolveGovernedPath` and
`resolveGovernedPathForms` in `path-normalize.ts` and to `search-audit.ts`.

**What the written text now leaves out.** This is the only section of the eight that is already
written, so four places are now slightly incomplete:

1. The paragraph on `formatPathRelativeToCwdOrAbsolute` says a location inside the workspace is
   represented relative to it. That is still true, except for a location inside another agent's
   nested workspace, which is represented absolutely.
2. The paragraph on `resolveGovernedPathForms` says an in-workspace path has two forms. The
   nested case has one (the absolute form).
3. Figure `fig:gov-pathnorm`: the third box ("inside workspace: relative and absolute") and the
   caption say the same as point 2. Kinan decides whether the figure shows the exception or only
   the prose does.
4. The closing paragraph on recursive search tools could add that results inside a nested
   agent's workspace are withheld.

In plain terms, one added paragraph would cover all four: OpenClaw nests later agents'
workspaces inside the default agent's, so a location can be inside this agent's workspace and
still belong to another agent; such a location is treated as outside, and the baseline's
permission to read inside the workspace does not reach it.

**One more caveat (checked 2026-09-28):** the search withholding runs at `afterToolCall`,
which only the in-process runtime has. On the native Codex harness a search that reaches a
nested agent's files is recorded but not withheld, the same limit that applies to a denied path
there (`CHAPTER3-MATERIAL.md` §3.5.61). A direct read is governed on both runtimes.

---

## 3.5.4.2 Two-Gate Authentication (stub): finding 396

**The comment that was here:** "the dashboard's Gateway credential is the device token of its
live connection; a request sent while the connection is re-established is refused by the
Gateway's gate, and the page now says it is reconnecting instead of ending the governance
session."

**What went wrong.** Restarting the Gateway signed every dashboard operator out with "Your
session ended". Their governance sessions had not ended: reloading the page showed them still
signed in.

**Why.** The first gate (the Gateway credential) is answered by the dashboard with the device
token of its live connection to the Gateway. Just after a restart, the page sends requests
before that connection is back, so they go out without the credential, and the Gateway's first
gate refuses them. The page took every such refusal to mean the second gate (the governance
account session) had closed.

**What changed.** A refusal to a request that carried no Gateway credential is now shown as "The
dashboard is reconnecting to the Gateway…" and does not end the session. A refusal to a request
that did carry the credential still ends it. The code is `refusal()` in
`ui/src/pages/governance/api.errors.ts` and `isSessionLost` in `identity.ts`. One accepted
tradeoff, named in the code: on a Gateway set up with no credential at all, a lost session shows
as "reconnecting" instead of clearing the page.

**What the section should say.** The two gates are checked separately and refused separately,
and a refusal from the first is never read as the end of the second. A Gateway restart does not
sign operators out. This is a concrete example of why the design has two gates and not one.

---

## 3.5.4.3 Ownership and Assignment (stub): findings 381, 382, 383

**The comment that was here:** "an Administrator who owns agents cannot be demoted or deleted; a
tier change releases a User's assignment list; a User or Viewer can be moved to another
Administrator only while holding that Administrator's agents."

Two rules govern this section. First, an agent is owned by an Administrator (or by Root).
Second, a User or Viewer may hold only agents owned by the Administrator they answer to. Before
the QA, each rule was checked where it is first set up, but not by every later change that could
break it.

**381: an Administrator could be demoted or deleted while still owning agents.** The agents were
left owned by a User, or by an account that no longer existed, and the dashboard showed a raw
account id as the owner. Now the demotion or deletion is refused, naming the agents: "Give each
one another owner first (Edit… then Change owner, in Agents in your organisation), or remove
it."

**382: a User could end up holding another Administrator's agent.** This happened two ways:
promote a User and then demote it under a different Administrator (its agents were kept), or
move it to another Administrator in a single request. In the QA, the moved User then prompted
the agent and got a reply. Now a change of tier between User or Viewer and Administrator or Root
clears the account's agent list, and the ledger entry says so ("assigned agents released: …").
A move to another Administrator is refused while the account holds agents that Administrator
does not own.

**383: the refusal named a remedy the dashboard did not offer.** It told Root to "assign those
accounts to another Administrator first", and no control could. Each User and Viewer row now has
an "Administrator this account answers to" picker, which asks for confirmation.

The checks are `assertOwnershipSurvives` in `src/governance/account-ownership.ts`, called by the
role-change and delete routes in `src/gateway/governance-dashboard-accounts.ts`, and
`setUserRole` in `user-store.ts`.

**What the section should say.** State the two rules, then that they are checked on every change
to an account (a role change, a move to another Administrator, a deletion), not only when an
agent is registered, given a new owner, or assigned. The rules span two stores, the account
store and the agent registry, so each change is checked against both.

---

## 3.5.6.2 Kill Switch (stub): finding 384, with 395 for context

**The comment that was here:** "the dashboard's Lock down and Stop controls stay available while
another action runs."

**What went wrong (384).** While any other dashboard action was running, the Lock down and Stop
agent buttons were greyed out with no explanation. Creating an agent takes 35 to 77 seconds, so
for that whole time the emergency stop could not be pressed.

**What changed.** The two stop controls no longer wait for other work on the page. While an
agent is being created, the page says "Creating {name}. This can take a minute or more; the
emergency stop stays available meanwhile."

**395, still open (not in the comment; added here because it belongs to the same section).**
While an agent is being created, the Gateway itself stops answering anything for 35 to 60
seconds. This comes from upstream OpenClaw code that rereads every plugin's details without
yielding. A lockdown pressed during that time is accepted by the page, but it takes effect only
when the Gateway answers again. Running agents are frozen for the same time, so none of them
can act meanwhile either. **Update, 2026-09-28:** a separate session fixed most of it (fork
only, uncommitted when this was written): the longest wait during an agent's creation fell from
28–35 s to about 6 s on two isolated Gateways. About 6 s remains, from real work for the new
agent's workspace (`mg/QA-SESSION-2026-09-27.md`, finding 395's entry).

**What the section should say.** The emergency stop is never made unavailable by other work in
the dashboard. One sentence on the remaining window during agent creation, with the figure that
holds once 395's fix is committed, here or in 3.5.12 System Security.

---

## 3.5.7.1 Escalation Routing (stub): finding 386

**The comment that was here:** "an answer that arrives after another account's is refused, and
the dashboard now says so."

**What went wrong.** Several accounts can answer the same question, and the first answer
decides. A second answer is refused. The refusal did reach the page, but the page removed the
question card at once and the message went with it. In the QA, Root pressed "Allow once" after
an Administrator had already pressed "Deny", saw the card vanish, and then saw the agent report
it had been denied, with nothing saying Root's answer had not been used. The same happened to an
answer pressed in the last second before the question expired.

**What changed.** The page now keeps a notice until it is dismissed: "Your answer to "…" was not
used: the question had already been answered by another account, cancelled, or had expired…".
The code is `answer()` in the dashboard's `approval-controller.ts`.

**What the section should say.** The first answer decides. A later answer is refused, and the
operator who gave it is told that it was not used.

---

## 3.5.7.2 Persistent Approvals (stub): finding 393

**The comment that was here:** "an approved escalation's rule is described as "Requested by
<account>, answering an escalation: Agent ... asked to run ..."."

**What went wrong.** "Always allow" files a request for a permanent rule. When an Administrator
approved it, the rule's description, which since T70 is the rule's title everywhere, read:
"Requested by hitl-approval: … Approving makes that permanent; rejecting leaves it needing
approval each time." It named an internal label where the account should be, and it kept, in
the rule's permanent title, an instruction meant for the person deciding the request.

**What changed.** The rule now reads, for example: "Requested by user1, answering an escalation:
Agent "scout" asked to run "exec" against command "uname -a"." The reason text comes from
`escalationRequestReason` in `src/governance/policy-engine.ts`, and the approval route in
`src/gateway/governance-dashboard-rule-requests.ts` credits the account that answered.

**What the section should say.** A rule created through "Always allow" is credited to the
operator who answered the escalation, and its description says only what the agent asked to do.
This heading also still has one of the six T70 comments (see the end of this file).

---

## 3.5.9 Tenancy and Agent Registry (stub): finding 385

**The comment that was here:** "agent workspaces nested in the default agent's are fenced from
it."

This is the same finding as in 3.5.2.3 above, seen from the tenancy side. The mechanism is
described there; this section is about whose boundary was crossed.

**Whose boundary.** Every Administrator can reach every agent in the organization by design, so
the boundary crossed was between Users, not between Administrators. In the QA, `user1` was not
assigned `gamma`: they could not prompt it, read its conversation, or see its ledger entries.
Yet they read `gamma`'s files through `main`. Because `user1` also answers `main`'s
escalations, they could have approved `main` writing into `gamma`'s folder too.

**What the section should say.** An agent's workspace belongs to that agent even when OpenClaw
places it inside another agent's folder. The governance layer reads the configured agents'
workspaces and fences each one off from the agent whose folder contains it. Upstream OpenClaw
nests workspaces this way on a normal installation; if Chapter 1 or 2 says agents are isolated
from one another's files, this is worth a line in `DIVERGENCES.md` as well.

---

## 3.5.11 Management Interface (stub): finding 390

**The comment that was here:** "the deployment report now reports the posture in force (Off
fails, Monitor warns)."

**What went wrong.** With governance switched Off for every agent, the deployment report said
"0 failed" and that "the shipped enforce default is in force". It said the same in Monitor. The
report never read the posture at all.

**What changed.** A new check, "Governance is enforcing" (`deployment.posture_enforce` in
`src/governance/deployment-status.ts`): it fails when the posture is Off, warns when the
installation or any agent is in Monitor (naming the agents), and passes only when every agent
enforces. The older "gate is armed" check no longer claims enforcement. A core rule switched off
by Root is now named by its description as well as its id. Kinan confirmed on 2026-09-28 that
Monitor stays a warning.

**What the section should say.** The deployment report states the posture actually in force.
The report calls itself evidence, and Chapter 4 will cite it, so it must never report
enforcement when there is none. This heading also still has one of the six T70 comments.

---

## Findings that had no comment in Chapter 3

These change dashboard wording or form behavior, not a design claim, so no comment was placed
for them. They are listed so that nothing from the QA is missing here.

- **387**: a stopped run's reason was shown twice in the conversation; now once.
- **388**: a core rule's title described the governance command line, which was removed, in the
  present tense; reworded, with the rule id unchanged.
- **389**: Add rule cleared the agent after a write, while the folder grant kept it; both keep it
  now.
- **391**: the per-agent rule lookup showed allow or forbid by color only; it now says "forbid ·
  global", "allow · this agent", and so on.
- **392**: after sign-out, the next account saw the previous one's agent-registry notices and a
  half-typed new account, including its password; both are now cleared on sign-out.
- **394**: the kill switch told a User that stopping someone else's agent "will still succeed"
  while the button was disabled; it now says the agent is not assigned to them.
- **395**: see 3.5.6.2 above (mostly fixed on 2026-09-28 in a separate session).

388, 389, and 391 all concern rule descriptions (T70). If Kinan wants them in the report, one
line in 3.5.11 Management Interface would cover them. 392 could be one sentence in 3.5.4.2, on
what signing out clears.

## The six T70 comments still in `chapter3.tex`

Left in place, because the request was for the QA comments. They read `% T70 (2026-09-27): …`
and sit under:

- 3.5.2.1 Rule Model (the code figure now shows `description: string`; the paragraph on the
  field is drafted in `T70-FOR-THE-REPORT.md`);
- 3.5.2.4 Baseline Policy;
- 3.5.2.5 Folder Grants;
- 3.5.3.3 Administrative Logging;
- 3.5.7.2 Persistent Approvals;
- 3.5.11 Management Interface.

The last five say the same thing: every rule now has a required description, and
`CHAPTER3-MATERIAL.md` §3.5.95 and `REMAINING-WORK.md` "T70" say what the section must mention.
They can be moved into `T70-FOR-THE-REPORT.md` the same way if Kinan wants.
