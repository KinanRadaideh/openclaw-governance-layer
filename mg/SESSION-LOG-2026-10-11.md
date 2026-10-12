# Session log, 2026-10-11 to 10-12

One session, in plain terms. The engineering record is `mg/WORK-LOG-2026-10-11.md` (D5, then D2)
and `mg/QA-SESSION-2026-10-11.md` (the QA of four days). Nothing in this session was committed:
Kinan's word is needed, and it stacks on the uncommitted T86 build of 2026-10-10.

## What Kinan asked, in order

1. "The D tasks, do option A for D5."
2. "Do a QA of all the work done over the last 4 days."
3. "Let's make decisions for the next 3 D tasks": I proposed D2, D13 and D9 with options; he
   chose **D2-A, D13-B (leave it as it is), D9-A**, asked for D13 to be struck out first, then one
   of D2-A or D9-A to be built and QA'd. I chose D2-A.
4. Update the handoff files and write the prompt for the next agent, who is to do **D9-A**.

## What was done

**D5, option A (built).** A rule granted by approving a request can now expire. The
Administrator approving a request chooses how long the rule lasts (never, 1 hour, 8 hours, 1 day,
7 days, 30 days); a request, and the "Always allow" card on the dashboard, can suggest a lifetime,
shown preselected; the time counts from the approval. Checked live: a request asking for an hour
became a rule expiring an hour after approval; "Always allow" with "1 day" produced a request for a
day, approved from the page. The live check also found **finding 427**: after "Always allow", the
confirmation sometimes named the question by an internal code instead of its title. Fixed.

**The QA of four days (2026-10-08 to 10-11).** The work never reviewed before (the T86 build of
10-10 and D5) got a full review, attempts to get around it, a live check and a check of the
documents. It found **finding 428**: the browser check of 10-10 read the web address from a
different field than the browser does, so an agent could name an allowed site in one field and
have the browser open another site from a second field. Fixed, in work never released. Also fixed:
three small faults in D5 and stale text in the specifications (the removed "off" setting was still
in the permissions schema; the role model had not been told Users and Viewers now see installation
policy entries). The emergency stop's 10-10 change was shown working through the real Gateway for
the first time: a real background process ended, confirmed in 432 ms. Two limits were written down
for the report: a redirect from an allowed website is not re-checked, and the stop's new step
reaches the main machine only, not a paired device or a sandbox container.

**D13, option B (closed).** Nothing built; the report's table of unchecked tools stands.

**D2, option A (built and QA'd).** Shell commands are kept to the folders an agent may use. The
built-in "list a folder" permission now covers the agent's own project only (`ls src`, not
`ls /etc` or `ls ../..`), and installations made before it get the narrower version once,
automatically, unless an administrator had changed it. The folder a command runs in is checked
like opening that folder: inside the project it is allowed, elsewhere it needs a rule, or the
command is refused and the agent is told to run it in its own folder. The QA of D2 found one fault
in the new code (the record named the refused folder but not the command) and fixed it; checked
through the real Gateway: `ls /etc`, silently allowed before, now asks an administrator.

## Figures at the end

Governance tests **3,855 passed, 22 skipped, 0 failed** (251 files); typechecks, build and the full
lint gate pass. Findings **428 found, 428 closed, 0 open** (169 closed as not reproducible, so
never "all fixed").

## What is left, and whose it is

- **The next agent:** D9, option A: detect when the policy file is changed by something other
  than governance itself (for example an agent allowed to run code), raise an alert and record it.
- **Kinan:** commit and push (the T86 build, D5, the QA and D2 are all uncommitted); the remaining
  T86 rows D6 (choose an option), D7, D11, D14, D15; T74; T84; updating the VPS and running T83
  there.
