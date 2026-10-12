# Session log, 2026-10-12

One session, in plain terms. The engineering record is `mg/WORK-LOG-2026-10-12.md`. Nothing in
this session was committed: Kinan's word is needed, and it stacks on four earlier uncommitted
layers (the T86 build of 10-10, D5 and the QA of four days on 10-11, D2 on 10-11/12).

## What Kinan asked

1. (From the handoff) Build T86 D9, option A, then QA it.
2. Mid-session: "add to remaining work md file: figure out and address why/how our project takes
   so much space and reduce it. (what to do about it will come after)". Added as backlog row
   **T87**: Claude measures where the disk space goes and why, then brings the options; nothing is
   deleted until Kinan decides.

## What was done

**D9, option A (built and QA'd).** The gap: an administrator who lets an agent run a programming
language lets it edit the rules file, `policy.json`, directly, and nothing recorded that. Now
governance seals the file every time it writes it (a short code computed with the secret key that
also protects the audit ledger). Every time the rules are read the seal is checked; if the file was
edited, had its seal removed, was replaced with an older copy, or was deleted, governance writes a
sealed entry into the audit ledger and the dashboard shows an alert to administrators and Root
until Root acknowledges it with a reason. Nothing is blocked: the changed rules stay in force, as
the option says, so an administrator has to look.

Shown through the real Gateway: an administrator allowed the agent `main` to run one node script;
the script, which builds the file's path from pieces so no safety rule can recognise it, gave the
agent a new permission by editing the file. The agent's own next action triggered the check, and
the alert was in the ledger before anyone opened the dashboard. The older copy and the deleted
file were shown live too, and the alert banner in the real dashboard.

Every existing installation will see **one** alert after this update, because files written
before it carry no seal; the alert says so, and Root acknowledges it once.

**Found and fixed on the way.** The first version would have stopped the emergency stop from
saving when the ledger's key was damaged, and made old ledgers look tampered with; both fixed
before anything was committed (the full test run caught them). The review found that a sealed file
copied from another organisation would have passed; the seal now names the organisation. Two
messages left over from the removal of the "off" setting (10-10) still mentioned switching
governance off; corrected.

## What was left at that point (superseded by the section below)

- **Kinan:** whether `users.json` (accounts and roles), the agent registry and the rule-request
  file get the same seal; commit and push (five uncommitted layers now); the remaining T86 rows
  (D6, D7, D11, D14, D15); T74; T84; the VPS update and T83.
- **Claude, next:** T87 (measure the disk space), on Kinan's word.

## Later the same day: Kinan's last T86 decisions, and D7 built

**Kinan decided:** D9's follow-up closed ("no dont seal. dont mention as a limit either"); D15
closed (Kimi being proprietary is fine; testing on the VPS later); D14 option A (keep as stated);
D11 option A (keep the detector; the report describes it, not as a trade-off); D7 option A and D6
option A, with one of them to build now. I chose **D7-A**: it is governance's own code and closes a
gap on every chat-started run; D6-A means rewriting a large part of upstream OpenClaw.

**D7, option A (built and QA'd).** Until now, when an agent working through a chat app (Telegram,
Discord, Slack, WhatsApp) or OpenClaw's own control screen wanted to do something no rule covers,
the question appeared in that app, anyone there could press "allow", and the record could not say
who. Now every such question waits on the governance dashboard, answered only by the people
responsible for that agent, and the record names who answered. The chat gets a short message
saying so. Checked through the real Gateway with the control screen's chat and with a Telegram
conversation: the questions were on the dashboard, the control screen could neither see nor answer
them, and the answers were recorded against lina and ada.

**Found and fixed while checking it: finding 429.** Chat apps' own "/approve" command went through
the same internal door governance uses to give its answers, so someone who knew a question's code
could have approved it in the chat. Nobody in a chat is sent that code, but the door now opens only
for the dashboard.

**Figures:** see the work log §13–§14 (the gates on the whole tree). Findings **429 found, 429
closed, 0 open**.

**Left:** commit and push (six uncommitted layers now); D6-A, decided and not built; T87 (disk
space) on Kinan's word; the VPS and T83 after a push.

**At the very end:** Kinan asked whether background jobs still work (yes: only an action no rule
covers is refused at once, as before D7, and it is kept in "Awaiting your decision" for later), and
for a description of D6-A. Then the handoff was prepared: **the next agent's task is to bring
`docs-notes/report/DOCUMENTATION-UPDATES.md` fully up to date** (`mg/HANDOFF-2026-10-12.md` §4).
