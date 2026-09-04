# T54: what should a folder grant measure against?

> ## ✅ Decided and built, 2026-09-04
>
> **None of the four options below is what was built.**
>
> Kinan asked for more options, then for the most thorough one. Brainstorming
> produced a **fifth** that the first four had all missed, because all four
> share a framing that turned out to be wrong.
>
> **The four below treat the folder-grant control as the thing at fault.** It is
> not. It is one of three places a path becomes a pattern, and the same
> disagreement lives in the other two: a rule hand-written with an absolute path
> in the ordinary add-rule form was inert in exactly the same way, and so was an
> absolute denial consulted by the search-withholding half of T7, where the
> consequence is a forbidden file staying in the results the model reads.
>
> **The fifth option: fix the comparison, not the writer.** A file inside the
> workspace has two legitimate names, and which one the canonical form picks
> depends on the _session's_ working directory — something the person writing a
> rule cannot know. So rules are now matched against **both** spellings, and the
> canonical one is still the one recorded. Four call sites, one helper
> (`resolveGovernedPathForms`), no new data, no migration, and nothing an
> operator has to understand.
>
> **Building it found finding 254**, which is more serious than the defect that
> started this: a core denial Root cannot switch off, protecting "the governance
> directory in use", was generated as an absolute pattern and therefore matched
> nothing when the store was relocated inside an agent's workspace. Measured,
> the agent could read `policy.json`, `users.json`, `audit-ledger.jsonl` and
> `ledger.key` — the signing key that makes the ledger tamper-evident.
>
> **The rest of this document is kept as written**, because the reasoning in it
> is why the fifth option was recognised as better, and because §3's Option 3
> is a trap worth leaving visible: it is the one-line change, and it widens
> access. See `mg/SESSION-LOG-2026-09.md` §2026-09-04 (late) for what was built.

---

**A decision for Kinan, with Mohammad and Malek.** Finding 253. Nothing is
blocked on it — the system is safe to keep using — but the answer changes a
control that exists to protect secrets, so it is worth reading properly rather
than picking the smallest diff.

---

## 1. The problem, in plain terms

### What the control is for

The dashboard has a control called **"Allow a folder, except…"**. You type a
folder, you list some paths inside it that must stay forbidden, and it writes
two ordinary rules for you: one allowing the folder, one forbidding each
exception. A forbidding rule always wins, so the exception holds even though the
folder around it is allowed.

The point of it is the exception. "The agent may read my whole project, **but
not the credentials in it**" is the sentence it exists to let you say.

### How the system writes down a file path

Every time an agent touches a file, the layer writes down which file, in one
canonical form:

- **Inside the agent's own project folder → the short form.** `src/app.ts`
- **Outside it → the full path.** `/etc/passwd`

That is deliberate and it does real work. Rules stay portable — `src/` means the
same thing on your laptop and on the VPS, rather than being pinned to one
person's home directory. And an agent trying to sneak out of its folder
(`project/../../etc/passwd`) automatically **stops matching** the short-form
rules, because the path stops being short. The escape gives itself away.

### Where it goes wrong

To write a rule, the folder control has to pick one of those two spellings. To
pick, it needs to know where the agent's project folder is.

**It has a slot for exactly that information, and nobody fills it in.** The
field exists, it is documented in the code as _"Workspace root, so a relative
path normalises the way the gate will read it"_, and neither the dashboard nor
the command line passes it. So the control falls back to guessing from wherever
the server process happens to be running, which is not the agent's project
folder.

The result:

| You type           | It writes                 | The agent's file is recorded as | Match?         |
| ------------------ | ------------------------- | ------------------------------- | -------------- |
| `work`             | `^work(/\|$)`             | `work/secrets/prod.key`         | ✅ works       |
| `/home/kinan/work` | `^/home/kinan/work(/\|$)` | `work/secrets/prod.key`         | ❌ **nothing** |

Type a short path and it works. Type a full path and **both rules are written,
both are listed back to you as confirmation, and neither one does anything.**

### Why this is worse than an ordinary bug

You do not get an error. You get a **confirmation**. The panel prints "Written
as separate rules:" and shows you the allowance and the exception — a display
that was added on purpose, so that "these are ordinary rules you can remove one
at a time" would be demonstrated rather than merely claimed. Here it
demonstrates a protection that is not in force.

And it can leave the door open rather than shut. With both rules inert, whether
the agent can read your secrets comes down to whatever else is in the policy. If
something broader already permits reads — which is the whole reason you reached
for a carve-out — then **the exception was the only thing forbidding it, and the
exception is not there.** In the sweep that found this, the carved-out file was
readable.

### Why nobody hit it

The form's own example asks for a short path (_"e.g. src"_), every test uses a
short path, and every walkthrough uses a short path. The broken road is the one
nobody has driven down.

---

## 2. The hard part

If the fix were "fill in the missing field", this would not be a decision.

The difficulty is that **a rule is written once and judged many times, against
whichever agent is acting at that moment.** An Administrator can write a grant
that binds _every_ agent in the organisation, and those agents have different
project folders. There is no single folder to measure against.

There is a second wrinkle: the folder the layer compares against is the folder
the agent's **session** is running in, which is not guaranteed to be the folder
the agent was configured with. So even looking up "the agent's folder" is right
usually rather than always.

---

## 3. The options

### Option 1 — Look up the agent's folder when the rule is written

If the grant names one agent, find that agent's project folder and use it to
decide the spelling.

- **Good:** exactly right for the common case. Full paths and short paths both
  work, and a full path pointing _outside_ the project keeps working too, which
  is a case you genuinely want (`/etc`, `~/.ssh`).
- **Cost:** the governance layer does not currently record an agent's folder. It
  would have to read it back from the host's configuration, or start keeping it.
- **Does not solve:** a grant binding every agent. That still has no single
  folder, so it needs one of the other options underneath it.
- **A subtler cost:** the rule is frozen at the moment you write it. If the
  agent later runs somewhere else, the rule quietly stops applying — which is
  the same class of silent failure one step further away, and harder to notice.

### Option 2 — Refuse what cannot work, and say why

Keep the behaviour, but have the control reject a path it cannot express
faithfully, naming the reason and the form to use instead.

- **Good:** cheapest, and it removes the silent failure completely. It takes
  away nothing that works today — it only forbids the case that is already
  broken. A refusal you can read beats a confirmation you cannot trust.
- **Cost:** you lose the ability to use this particular shortcut with a full
  path. The ordinary "Add a rule" form still lets you write any pattern by hand,
  so nothing becomes impossible, just less convenient.
- **Honest caveat:** to know which full paths are safe to accept, it still needs
  to know the project folder. The simple version — refuse every full path in
  this one control — is blunt but truthful.

### Option 3 — Write the rule so it matches either spelling

Build the pattern the way the **shipped rules already do**. Every built-in rule
is written to match at the start of the path _or_ just after a slash, so
`(^|/)\.openclaw/governance(/|$)` catches both `.openclaw/governance` and
`/home/kinan/.openclaw/governance`.

- **Good:** the smallest change by far — one function — and it makes the
  problem disappear for both spellings at once. It is also consistent with how
  the rest of the system already works.
- **The catch, and it is a real one:** it matches in _more_ places than you
  asked for. A grant on `src` would also cover `vendor/src`, `node_modules/src`,
  anything ending in `/src`.
- **Why that matters more here than for the built-in rules:** every shipped rule
  using this trick is a **denial**. A denial that catches too much is annoying
  but safe. This control writes an **allowance**, and an allowance that catches
  too much hands out access you did not intend. That is the one direction you
  never want to be wrong in.
- **A middle version:** apply it to the exception (the denial) only, and leave
  the allowance strict. The security half then always binds. The result is odd
  but safe: the folder is not actually allowed, and the carve-out is definitely
  forbidden.

### Option 4 — Change nothing, write the limitation down

- **Good:** free.
- **Bad:** it leaves a control that confirms a protection it did not apply. That
  is the exact bug class this project calls its worst, and it has been recorded
  as such a dozen times. I would argue against it.

---

### Option 5 — Fix the comparison instead of the writer (**this is what was built**)

Leave the rule alone. **Match it against both of the file's legitimate names.**

The gate already resolves every path to a canonical absolute form and then
throws it away, keeping only the short one. Keep both, test rules against both,
and go on recording the short one.

- **Good:** it fixes folder grants, hand-written absolute rules and search
  withholding at once, from every surface, because it repairs the comparison
  rather than each of the three places that write a pattern. No new data, no
  migration, nothing an operator has to know, and no capability removed.
- **Good:** it puts the repair where the ambiguity actually is. The gate owns
  "does this rule bind this resource", and the resource had two names.
- **Safe, and this is the part that needed establishing rather than asserting.**
  The absolute form is the path the gate has _already_ resolved — links
  followed, `..` collapsed — so a rule matching it is a rule about that actual
  file. And the escape-detection property is untouched: the helper that produces
  the short form returns nothing at all for a path outside the workspace,
  rejecting `..`, `../` and absolute results outright. An escaped path therefore
  has exactly **one** form, the absolute one, and `^src/` still cannot match it.
  Manufacturing a `..`-relative spelling is the one thing that would reopen the
  hole, and there is a test asserting it never happens.
- **Cost:** one extra path resolution per distinct resource on a call that
  already does several, and one extra regex test per rule. Patterns are cached
  and rules are few.

## 4. What I would do

**Option 2 now, Option 1 later if you want full paths supported.**

Option 2 converts a silent failure into a visible refusal, costs almost nothing,
and cannot make anything worse — it forbids only the case that is already
broken. That is the whole of the safety problem dealt with, today.

Option 1 is the proper fix and can follow whenever the folder-lookup is worth
building. It is not urgent once Option 2 is in, because by then nobody can
unknowingly write a rule that does nothing.

**I would not take Option 3 for the allowance**, tempting as the one-line diff
is. Widening access to fix a matching bug is the wrong trade in a security
console, and this control's entire purpose is to be trusted about what it
forbids.

---

## 5. If you want to see it

```bash
node --import tsx docs-notes/qa-sweep-2026-09-04/gate-sweep.ts
```

The check named **"KNOWN GAP (253)"** asserts the current, broken behaviour on
purpose and says so in its own name. When this is fixed, that check goes red,
which is the signal to come back and rewrite it as a real assertion rather than
leaving a quiet pass behind.
