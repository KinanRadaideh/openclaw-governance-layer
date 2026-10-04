# Writing guide: from this repository to the report

**Written 2026-09-11, at the start of the documentation phase** (T18, with T17 and
T13 beside it). Start here if you are writing the report. This file does not hold
the material — it says **where the material is**, **which numbers you may quote and
how to re-derive them**, and **which claims the evidence does not support**.

> **Current report state (re-run 2026-09-28):** Kinan's report-so-far is
> synchronized into `docs-notes/report/main-reference.tex` and
> `docs-notes/report/chapter3.tex` (his 2026-09-27 paste). Chapter 3 is written
> through Section 3.5.2.3, Path Canonicalization; the next stub is 3.5.2.4 Baseline
> Policy. `node docs-notes/report/section-status.mjs` should report
> `written 17 | stub 26 | total 43`. What T70 and findings 381–396 change in each
> heading: `docs-notes/report/DOCUMENTATION-UPDATES.md` (since 2026-10-03 the one file).

> **Source-authority rule:** Begin with the material mapped to the report
> section, including `CHAPTER3-MATERIAL.md`, `GOVERNANCE.md`, and the relevant
> figure catalogue. Then inspect the current implementation and focused tests
> before stating how the system works. Documentation can describe an earlier
> implementation; code and current tests determine the developed design. When
> they disagree, verify the behavior, write the current result, and correct or
> flag the stale note.

> **The standing rule, from `mg/HANDOFF.md` §2.** Everything explained about this
> project carries a plain-language version alongside the technical one. A
> supervisor and an examining panel decide whether this project succeeded, and
> neither will read the code. A finding that exists only in engineering terms is
> not finished.

> **Sentence-shape rule:** Reduce the use of `while`, especially the general
> contrastive construction "A, while B." Use two sentences, a semicolon, or a
> direct conjunction when simultaneity is not being expressed. Reserve `while`
> for genuinely simultaneous events or cases in which the contrast is necessary.
> For example, prefer "Outbound messaging uses channel integrations that the
> operator has already authorized. Reads of previously governed state only
> inspect records created through governed operations."

> **Personification rule:** Do not give software human judgment, intention, or
> speech. Functions and components do not `answer`, `refuse`, `want`, `know`,
> `believe`, or `decide`. Name the implemented operation and its result. A
> function can evaluate a condition, return a value or error, block an action,
> or record an outcome. For example, replace "The authorization function
> answers whether the account may act" with "The authorization function
> determines whether the account may act", and replace "The account guard
> refuses the change" with "The account guard returns an error and prevents
> the change."

> **`Deliberately` rule:** Do not use `deliberately` in report prose. The word
> attributes intention without identifying the implemented behavior or its
> reason. State the design choice and its justification directly. For example,
> replace "The session deliberately excludes the bearer token" with "The
> session excludes the bearer token so that reading the session store does not
> expose a reusable credential."

> **`Remains` and `retains` rule:** Reduce the use of `remains`, `remain`,
> `retains`, and `retain`. These verbs often leave the mechanism or present
> state indirect. State the current fact or the operation that keeps it true.
> For example, replace "The User retains access to the stop control" with "The
> User can still use the stop control", and replace "The record remains in the
> ledger" with "The ledger continues to store the record."

> **`A, but not B` construction rule:** Reduce sentences shaped as "A, but not
> B" or "A is X but not Y." They often create a polished contrast where two
> direct facts would be clearer. State the implemented behavior first, then
> state the boundary in a separate sentence when it matters. For example,
> replace "The hierarchy is cumulative but not flat" with "Higher roles inherit
> lower-tier capabilities. Assignment and ownership still limit the agents
> affected by an operation."

> **Contrast and juxtaposition rule:** Do not build a paragraph or section from
> repeated contrasts. Constructions using `while`, `but`, `without`, `instead
of`, `rather than`, and paired positive-negative claims can make every
> sentence sound like a correction to the previous one. Describe the current
> design in a direct sequence. Include an alternative or negative boundary only
> when it explains a consequential design decision or prevents a likely
> misunderstanding.

> **`Therefore` rule:** Reduce the use of `therefore`, especially when it appears
> after a noun and before its verb in the construction "The component therefore
> performs the action." State the causal relationship directly or place the
> reason beside the result. For example, replace "The policy engine therefore
> returns a denial" with "The policy engine returns a denial because no
> allowance matched." Use `therefore` when a formal conclusion benefits from
> the logical signpost and a direct rewrite would be less clear.

> **`Consequently` rule:** Reduce the use of `consequently`, especially when it
> begins a sentence that can state the result directly. Place the cause beside
> the result or divide the explanation into two clear sentences. For example,
> replace "Consequently, each ledger entry remains on one physical line" with
> "This escaping writes each ledger entry on one physical line." Use
> `consequently` when a formal argument benefits from a clear transition from
> established premises to their result.

> **`X without Y` construction rule:** Reduce constructions that explain a
> benefit as "X without Y," especially when they compress two independent
> claims into one polished contrast. State the benefit and the avoided outcome
> directly, often as two sentences. For example, replace "This representation
> supports delegated control without turning a permission for one agent into an
> installation-wide grant" with "This representation supports delegated
> control. A permission for one agent does not become an installation-wide
> grant." Retain `without` when literal absence is the fact being described and
> a rewrite would be less precise.

> **`Instead of` and `rather than` construction rule:** Reduce constructions
> built around `instead of` or `rather than`, especially when they turn a direct
> explanation into a contrast between the chosen design and an alternative.
> State what the design does first. Describe the rejected alternative only when
> that comparison explains a consequential decision. Prefer "The policy engine
> evaluates the canonical path" to "The policy engine evaluates the canonical
> path rather than the supplied path." Retain either construction when the
> replacement or choice itself is the technical point.

> **Colon and semicolon rule:** Reduce colons and semicolons in report prose.
> Prefer a complete sentence, a short introductory clause, or a properly
> formatted list. Use a colon when it genuinely introduces material and a
> semicolon when two closely related independent clauses are clearer together.
> Do not use either mark to compress an explanation that would be easier to
> read as two sentences.

> **Enumeration rule:** Reduce the use of lists of three in prose. Do not group
> three examples, properties, consequences, or clauses merely because a
> three-part sentence sounds complete. Include only the items needed for the
> engineering point, combine closely related items, or give a fuller list when
> the subject genuinely requires one. This rule does not prohibit a natural
> three-item list when all three items are distinct and necessary.

> **Word-choice rule:** Reduce the use of `convert` and its related forms.
> Prefer the verb that names the actual operation, such as `produce`, `derive`,
> `map`, `parse`, `normalize`, or `transform`. Use `convert` only when the text
> describes a genuine change from one representation, format, or type into
> another and no more precise verb improves the sentence.

> **`Canonical` rule:** Reduce the use of `canonical` and related forms. Use it
> only when the system selects one authoritative representation from multiple
> equivalent forms, or when it names an exact implementation concept such as
> `canonicalPayload`. In other cases, choose the term that states the actual
> property, such as `fixed-order`, `normalized`, `resolved`, `defined`, or
> `authoritative`. Do not use `canonical` as a general synonym for correct,
> standard, or preferred.

> **`Explicit` rule:** Reduce the use of `explicit`, `explicitly`, and related
> forms in report prose. State the actual condition or action instead, such as
> `named by a rule`, `selected by the operator`, `stored in the field`, or
> `granted through the dashboard`. Retain `explicit` only when the distinction
> from an implicit, inferred, or default value is technically necessary.

> **`Preserve` rule:** Avoid `preserve` and its related forms in report prose.
> The word can make a component sound as though it has a human intention, and
> it often leaves the actual mechanism unstated. Name the current property
> unchanged or the operation that keeps it unchanged. For example, replace
> "This preserves the order of the records" with "Appending both records to the
> same chain keeps their order unchanged."

> **System-`must` construction rule:** Do not describe a system, component, or
> audit record with the construction "must do X." Describe the implemented
> mechanism, what it does, and the reason for the design. For example, replace
> "The ledger must retain enough information to explain an action" with "The
> ledger records the action, actor, resource, and decision so an investigation
> can reconstruct the event." Retain `must` for a quoted requirement or a true
> external obligation when changing it would alter the requirement's meaning.

> **`Alone` rule:** Reduce the use of `alone` when describing what one feature,
> signal, or condition does or does not do. State the feature's actual criterion
> or limitation directly. The sentence "Apparent entropy alone does not cause a
> value to be masked" is an example of the unwanted construction; prefer "The
> redactor does not classify a value as sensitive from apparent entropy."
> Retain `alone` when the engineering point genuinely compares one component
> with a combination of components, and the combined behavior is then named.

> **Capability-claim rule:** Avoid `makes no claim`, `does not claim`, and
> similar wording when describing the limits of the developed system. State the
> supported capability boundary directly. For example, replace "The design
> makes no claim of universal secret discovery" with "Secret detection is
> limited to registered values, recognized formats, and structured credential
> positions."

> **Terminology-consistency rule:** Use one canonical noun for the same entity
> throughout a passage. Do not replace it with a near-synonym merely to vary the
> wording, because the change can suggest that the text has introduced a second
> concept. Define the term on first use and repeat it when the same entity is
> meant. Use another noun only when it identifies a real technical distinction,
> and state that distinction where it first matters. For example, call the HMAC
> secret the `installation key` throughout. The environment variable and the
> `ledger.key` file are alternative sources for the installation key, not
> alternative names for it.

> **`Silently` rule:** Do not use `silently` in report prose. Name the missing
> or misleading observable result instead. State that the operator receives no
> warning, the interface reports success, the action produces no visible
> outcome, the event is not recorded, or the error is not returned, according
> to the behavior being described. This makes the failure concrete and
> testable.

> **Current-design-only rule:** Do not discuss older implementations, legacy
> behavior, backward compatibility, or the meaning assigned to earlier data
> in report prose. Describe the current design and its present semantics
> directly. For example, say that an omitted rule effect is interpreted as
> `allow`; do not explain that choice by referring to an earlier policy format.
> If a design choice also has a current operational or security justification,
> state that supported reason. Do not invent a replacement rationale. When no
> current reason is established, state the behavior and omit the historical
> explanation.

> **Report-wide depth standard (2026-09-26):** Write every newly drafted or
> revised report section at the level of detail established by the expanded
> Rule Model section. Identify the component's role, then explain its current
> implementation through the owning types, functions, files, stored fields,
> evaluation order, defaults, and failure behavior that materially define it.
> Explain why consequential design choices exist and what security or operator
> outcome they protect. Include a representative example when it clarifies how
> the mechanism is used. Connect diagrams and code figures to the prose through
> LaTeX references, and explain what the cited implementation means in plain
> language. Maintain this depth through evidence and mechanism, not repetition,
> inflated background, or line-by-line narration of ordinary code. A section
> does not need a code figure merely to satisfy this standard.

> **Baseline Policy section note (Section 3.5.2.4):** List every baseline rule
> supplied by the current installation. For each rule, retain the exact regular
> expression from `src/governance/baseline-policy.ts`, retain its stored
> description, and explain in plain language which actions or resources it
> covers. Also identify the rule's resource kind, effect, access direction, and
> scope where those fields affect its meaning. Recheck the source and focused
> tests when drafting the section so the report describes the rules that are
> actually shipped rather than a copied or outdated inventory.

> **Technical-specificity rule (2026-09-23):** Include exact function, module,
> data-structure, protocol, and mechanism names when they are relevant to the
> engineering point. Explain what an identifier does in plain language, but do
> not replace a useful identifier with a generic phrase merely to make the
> report sound less technical. For example, name
> `runBeforeToolCallHook` when discussing the central pre-execution function.

> **Figures and source-code excerpts (2026-09-26):** Use diagrams and code
> figures independently according to what makes the subject clearer. A section
> may contain a diagram, a code excerpt, both, or neither. Short excerpts from
> this project's source may explain an important design mechanism and act as
> presentation anchors: they should help the presenter locate a critical system
> in the repository and explain how it works during the project defense. Keep
> each excerpt focused on one idea, preserve the exact identifiers and behavior
> of the verified current implementation, and explain it in plain language.
> Give the source path in the accompanying text or caption. Do not use a figure
> or code figure merely to prove that design or code exists. Typeset report
> excerpts as numbered LaTeX figure objects with a restrained dark code panel,
> explanatory inline comments, a caption, and a short plain-language
> explanation below the code. Do not use screenshots of source code. Do not place long
> functions, setup code, test scaffolding, or unrelated error handling in the
> chapter; move substantial listings to the Code appendix.

> **Code panels are dark, not light (Kinan, 2026-09-28):** Every source-code figure
> uses the dark `reportcode` style: a near-black panel (`reportcodebg`, `20242B`)
> with light text and colored keywords, comments, and strings. Do not use the
> light style (pale grey `F6F8FA` panel, dark text) that came with the 2026-09-27
> paste; Kinan chose dark over it after comparing the two. The dark panel is drawn
> by the `reportcodebox` environment defined in `main-reference.tex`, so every
> `lstlisting` must sit inside `\begin{reportcodebox}` and
> `\end{reportcodebox}`; the style's text is near-white, and a listing outside
> the box prints white on white. Notes and captions belong outside the box. Copy
> new excerpts from `docs-notes/CODE-SNIPPETS.md`, where every example is already
> wrapped.

> **Fork premise (clarified 2026-09-25):** The supervisor directed the team to
> develop an OpenClaw fork. The Chapter 3 introduction may give its existing
> brief explanation of that premise. After the introduction, state that the
> system is a fork only when the fact is relevant; do not justify the choice,
> compare it with a plugin architecture, or restore an Integration Strategy
> subsection. Spend the remaining design discussion on decisions the team was
> required to make within the fork.

---

## 0. What you are writing

**The template** is `Documentation/GradProj/PSUT_Eng_SDP_Template_v3/main.tex`
(LaTeX, PSUT style). Its chapters:

| #          | Chapter                            |
| ---------- | ---------------------------------- |
| 1          | Introduction                       |
| 2          | Background and Literature Review   |
| 3          | Design                             |
| 4          | Results                            |
| 5          | Conclusion and Future Work         |
| Appendices | Offering Template (required); Code |

**What already exists**, all in `Documentation/GradProj/`:

- `Grad_Proj___Current.pdf` — the report as it stood **before** nearly all of the
  implementation. It is Mohammad's baseline (`mg/HANDOFF.md` §0b), and it is the
  document Chapters 3–5 must not contradict without saying so.
- `Chapter 2 Background - Draft.docx` — a Chapter 2 draft.
- The model reports whose Chapter 3/4 structure `docs-notes/CHAPTER3-MATERIAL.md`
  follows: the NGO-Ledger, the decentralised firewall and the counterfeit-drugs
  reports. Read one before writing §3.5 or §4.
- `demonstration.mp4` and `demonstration_discord.mp4` — **check what they show and
  when they were recorded before citing them**; this guide has not verified them
  against the T2 run.

> **Chapter 3 is being written now, in `docs-notes/report/chapter3.tex`.** The conventions
> that govern it — the file layout, the `fig:gov-` label prefix and why it exists, how a
> figure is cited, and what `main.tex` still needs — are in `mg/HANDOFF.md` §2b. Read that
> before this guide's chapter-by-chapter table. **Differences between the built
> system and Chapters 1-2's preliminary design are registered, with the reason for
> each, in `docs-notes/report/DOCUMENTATION-UPDATES.md` §2 and §5** — Chapter 3 must state every one of
> them openly and say why.

**When to write which chapter.** T48, has the design stopped moving?, was answered
**yes** by Kinan on 2026-09-15: Chapter 3 is written now. As of 2026-09-13 no decision about approvals is open (T68 and T69 were both decided and built that day). **Two decisions opened on 2026-09-14** and are Kinan's: C13, what deleting an agent from the dashboard should remove on the host, and C14, whether accounts from before organisations get a way to be removed (finding 371). C13's open question was answered by a probe on 2026-09-15: a new agent with a deleted agent's name inherits its leftovers (finding 372, §3.5.90). C13 was then decided and built the same day (§3.5.91), which fixed 372 and found 373 and 374. C14 was accepted the same day. A live check on 2026-09-18 found and fixed 375 and 376, and a second, with a model connected, on 2026-09-19 found and fixed 377–379 and opened **C15** (§3.5.93), who a request filed by _Always allow_ is attributed to, which Kinan decided and which was built the same day with **A13**, renaming and re-owning from the dashboard (§3.5.94). On 2026-09-27 T70 made every rule carry a required description (§3.5.95), and a dashboard QA across all four tiers found 381–396 (§3.5.96): all fixed that day except 395, which a separate session fixed on 2026-09-28; a fresh code review then refined 385, 395 and 396 and the description limits, and everything was committed and pushed by 2026-09-29 (`0b477ce46db`, `mg/SESSION-SUMMARY-2026-09-29.md`). T3 (Linux) closed on 2026-09-21; T47 (the by-hand plan) can still produce findings. **Write Chapter 3 now, and leave
Chapter 4's numbers until last.**

---

## 1. The registers, and what each is for

| Register                    | Document                                                                                                                                        | Use it for                                                                                                                                                                                                                                                                                             |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Report material, by section | `docs-notes/CHAPTER3-MATERIAL.md`                                                                                                               | Chapters 3 and 4. Organised raw material — decisions, rationale, data, code — **not draft prose**                                                                                                                                                                                                      |
| Plain language              | `docs-notes/QA-IN-PLAIN-TERMS.md`                                                                                                               | The lay version every finding needs; Chapter 4's QA narrative; the defence                                                                                                                                                                                                                             |
| Engineering detail          | `GOVERNANCE.md` (findings 1–134 in full, an index to 396), `mg/REMAINING-WORK.md`, `mg/REMAINING-WORK-DASHBOARD-SWEEP.md`, the two session logs | Checking a claim, finding a reproduction, recovering the reasoning behind a decision                                                                                                                                                                                                                   |
| Figures                     | `docs-notes/FIGURES.md`                                                                                                                         | F1–F26, each in prose, Mermaid and TikZ, with keep/cut advice (T17); re-audited and the Mermaid parsed 2026-09-19; the kept figures compiled and visually checked 2026-09-20 (F25, F26 on 2026-09-23); eight Chapter 3 figures are placed in `chapter3.tex` and print as 3.1–3.8 (compiled 2026-09-28) |
| Limits                      | `mg/HANDOFF.md` §7, "Honest caveats to carry into the report"                                                                                   | Chapter 5, and every place a claim needs its qualification                                                                                                                                                                                                                                             |
| Evidence                    | `old-docs/T2-LIVE-RUN.md`, `scripts/verify-ledger.mjs`, `docs-notes/qa-sweep-*/`                                                                | Chapter 4's artefacts: the live refusal, the independent chain check, the probes                                                                                                                                                                                                                       |

**`CHAPTER3-MATERIAL.md` is not in reading order past §3.5.56.** Newer §3.5
sections are appended at the end of the file, after "Appendix material". List them
before planning a chapter:

```bash
grep -n "^## →\|^### 3\.5\.\|^### 4\.x\." docs-notes/CHAPTER3-MATERIAL.md
```

---

## 2. Chapter by chapter

### Chapter 1 — Introduction

Mostly written, in `Grad_Proj___Current.pdf`. **Check it against what was built**,
rather than rewriting it:

- **§1.3's nine requirements are the spine of Chapters 3 and 4.** §3.1 and §4.x.5
  quote them verbatim; keep the wording identical in all three places.
- If it describes a **command-line** surface, reconcile it with §3.5.77: one was
  built and then removed on 2026-09-07. Two surfaces remain.
- If it describes **several organisations per installation**, reconcile it with T49,
  decided 2026-09-15: one organisation per installation is the boundary (§3.5.89).

### Chapter 2 — Background and Literature Review

A draft exists. Two things from this repository bear on it:

- **Prompt injection is framed as containment, not prevention** (§4.x.26, T13).
  Chapter 2's attack discussion should set that up rather than imply the layer stops
  persuasion.
- Where the gate attaches in OpenClaw — the single `before_tool_call` funnel — is
  explained in `CHAPTER3-MATERIAL.md` §3.2 ("Requirement 3: where the gate must
  sit"), and belongs as background if Chapter 2 introduces the host.

### Chapter 3 — Design

Follows `CHAPTER3-MATERIAL.md` section for section:

| Report section               | Source                                                                        | Notes                                                                                                                                                                                                                                                                                             |
| ---------------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 3.1 Design requirements      | §"→ 3.1"                                                                      | Two tables: the status table, and the 2026-09-02 re-verification by running each requirement. #9 is the partial one                                                                                                                                                                               |
| 3.2 Analysis of requirements | §"→ 3.2"                                                                      | Requirement 5's "100%" is the one an examiner will ask about. **Corrected 2026-09-21:** this cell read "states two honest narrowings", which was overtaken when requirement 5's narrowing was removed rather than disclosed. Neither 5 nor 7 is a narrowing now; both turn on what a phrase means |
| 3.3 Design constraints       | §"→ 3.3"                                                                      |                                                                                                                                                                                                                                                                                                   |
| 3.4 Design approaches        | §"→ 3.4"                                                                      | The alternatives considered and why each lost                                                                                                                                                                                                                                                     |
| 3.5 Developed design         | §"→ 3.5", §3.5.1 onward, **and the appended sections at the end of the file** | Group by design area when writing: the gate and its rule language; the audit ledger; accounts and tiers; the dashboard; multi-tenancy; and the removals                                                                                                                                           |
| Code                         | §"→ 3.x Critical code snippets"                                               | The Code appendix                                                                                                                                                                                                                                                                                 |

**The newest design material**, 2026-09-27: §3.5.95 (T70, every rule says why it
exists) and §3.5.96 (the dashboard QA after it, findings 381–396: nested agent
workspaces fenced, ownership invariants held across both stores, the deployment
report stating the posture, a refusal that outlives its card). 2026-09-15 to 19:
§3.5.89 to §3.5.94. **Earlier**, 2026-09-12 to 2026-09-14: §3.5.83 (the dashboard
driven through a browser under failure, findings 346–364, with T68 and T69),
§3.5.84 (A11, and an approval recorded that never applied, 365), §3.5.85 (the week
checked a second time, 366–368), §3.5.86 (the independent review closed item by
item) and §3.5.87 (the last three days checked again: one agent identifier holding
state in four stores, 369–371, and what deleting an agent leaves on the host), and
§3.5.88 (A12, a capability kept by the tier that holds it and out of its reach).
**Before them, 2026-09-08 to 2026-09-11:** §3.5.78 (the dashboard driven as every
tier), §3.5.80 (T64, text that loads with its page), §3.5.81 (T60, the approval
that finishes after its card closes) and §3.5.82 (T63, a task that outlives its
tab). §3.5.77 (removing the command line) is the one to read for why subtraction
is a design decision.

### Chapter 4 — Results

**A material file for Chapter 4 now exists: `docs-notes/CHAPTER4-MATERIAL.md`,
started 2026-09-21.** It holds Chapter 4's spine, the finished tables ready to
paste (beginning with the kill-switch table for Requirement 7), its two figures,
and the claims a results chapter is most likely to overstate. The raw evidence
stays in the `§4.x` sections of `CHAPTER3-MATERIAL.md`, which the table below
indexes. Do not duplicate evidence into the new file.

| Report content                 | Source                                                                                                                                        |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Test evidence                  | §4.x.1 — and re-derive every count (§3 of this guide)                                                                                         |
| Experiments                    | §4.x.2 tamper detection; §4.x.3 policy enforcement; §4.x.4 RBAC; §4.x.8 termination latency; §4.x.13 path confinement; §4.x.14 accountability |
| Validation of the requirements | §4.x.5 — table candidate, status dated 2026-08-20 with dated notes beneath                                                                    |
| Validation of the constraints  | §4.x.5b                                                                                                                                       |
| Linux                          | §4.x.9, and T3 in §5 of this guide                                                                                                            |
| The live demonstration         | `old-docs/T2-LIVE-RUN.md`; ledger entry #25 on the VPS (2026-09-06)                                                                           |
| The QA process                 | §4.x.6 is superseded as a summary; use §3.5.57–§3.5.87 for the method and `QA-IN-PLAIN-TERMS.md` for the lay account                          |
| Upstream contribution          | §4.x.7 and `old-docs/UPSTREAM-BUG-REPORT.md`                                                                                                  |
| Prompt injection               | §4.x.26                                                                                                                                       |

**The methodology argument worth a subsection**: the QA changed _axis_ whenever an
axis stopped finding things — modules, then capabilities across surfaces, then
failure branches, then an operator using it, then every tier, then the records
themselves. §3.5.73–§3.5.79 carry it, and §3.5.82 adds the lesson that
work taken over from another agent had to be verified as if untested. §3.5.83–§3.5.85 add
the dashboard QA pass and the two weekly checks (2026-09-12 to 14): composing features, and
reading a plan's promises against the code, found what testing each feature alone could not.
§3.5.86 adds closing an outside review item by item, and §3.5.87 the third check of those
days: a fix to what one store holds about an identifier (366) had to be carried to every
store holding state about it, and the check compared the identity a question was about,
not merely the name.

### Chapter 5 — Conclusion and Future Work

- **Limits:** `mg/HANDOFF.md` §7, caveats 1–29. Every one is written to be quoted.
- **Future work:** the open backlog (`mg/HANDOFF.md` §6), removing or finishing the
  multi-organisation support (T49, §3.5.89), per-agent models (T59), and the native Codex harness, where a denied search
  result can be recorded but not withheld (§3.5.61).

---

## 3. Numbers: never copy one — re-derive it

Every total written into these documents has gone stale at least once (findings
259, 282, 321, 323, 343, 344). **Run the command, then quote the result with its
date.** The right-hand column is only what the documents said on 2026-09-14.

| Number                        | Re-derive with                                                                                                                                           | Recorded 2026-09-14                                                                                                                                                                                                                                                                                                                                                        |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Findings found / fixed / open | The Findings cell of `mg/HANDOFF.md` §1's state table, checked against the registers                                                                     | 379 / 377 / 1 (169 open; 377–379 found and fixed 2026-09-19 by the live check with a model; 371 accepted 2026-09-15, C14; 375 and 376 found and fixed 2026-09-18 by the live check; 365–371 found 2026-09-13 and 14; 372 fixed and 373–374 found and fixed 2026-09-15, building C13)                                                                                       |
| Backlog items open            | Count the unstruck rows of `mg/HANDOFF.md` §6's open table                                                                                               | Nine unstruck including T1, so eight open (T48 and T49 closed 2026-09-15)                                                                                                                                                                                                                                                                                                  |
| Governance test counts        | `node node_modules/vitest/vitest.mjs run src/governance/ src/gateway/governance-*.test.ts ui/src/pages/governance/`                                      | 3,206 passed / 21 skipped / 0 failed / 196 files (2026-09-20, after C15 and A13)                                                                                                                                                                                                                                                                                           |
| Linux test counts             | The same suite, run on Ubuntu                                                                                                                            | **3,211 passed / 16 skipped / 0 failed in 197 files (2026-09-21, VPS at `0a7d51f1c12`).** Reconciles with Windows: both total 3,227 tests, five of which skip on Windows and run on Linux                                                                                                                                                                                  |
| Typechecks and lint           | `mg/HANDOFF.md` §4                                                                                                                                       | Four typechecks and the full lint gate 0 (2026-09-19, after 377–379)                                                                                                                                                                                                                                                                                                       |
| Startup JavaScript            | `node scripts/build-all.mjs` on an idle machine                                                                                                          | 316,840 B against a 324,608 B ceiling (2026-09-13)                                                                                                                                                                                                                                                                                                                         |
| Governance source modules     | `ls src/governance/*.ts \| grep -v '\.test\.ts' \| wc -l`                                                                                                | Re-measure; `mg/PROJECT-SUMMARY.md` §2 carries older figures                                                                                                                                                                                                                                                                                                               |
| Size of the fork's diff       | The command in `CHAPTER3-MATERIAL.md` §3.5.2b                                                                                                            | Last recorded 2026-09-06 — stale                                                                                                                                                                                                                                                                                                                                           |
| New dependencies              | `git diff main..HEAD -- package.json` (empty), and `git diff main..HEAD -- pnpm-lock.yaml \| grep "^[+-]  '"` (empty: no package entry added or removed) | **None added. Do not write that the lockfile diff is empty** — re-measured 2026-09-20, it carries **4 lines of deprecation metadata** that pnpm wrote onto two pre-existing upstream packages, `@aws-sdk/core` and `crypto-js`. `package.json` is byte-identical to upstream and no package entry was added or removed, which is the claim that is both true and checkable |
| Requirement status            | `CHAPTER3-MATERIAL.md` §3.1                                                                                                                              | Eight met, #9 partially met                                                                                                                                                                                                                                                                                                                                                |
| Termination latency           | §4.x.8                                                                                                                                                   | Quote with the date of its measurement                                                                                                                                                                                                                                                                                                                                     |

**Last re-derived 2026-09-29** (still re-derive before quoting): everything committed and
pushed at `0b477ce46db`. Findings **396 found, all 396 closed, none open**: 395 fixed, and 169
closed by Kinan as not reproducible, without a fix, so say that rather than "every defect was
fixed". Governance suite on Windows on the final code: **3,334 passed / 21 skipped / 0 failed**
in 206 files; the full lint gate (`node scripts/run-lint.mjs`) exit 0; core, core-test and UI
typechecks clean (`mg/SESSION-SUMMARY-2026-09-29.md`). Backlog nine unstruck, eight actionable
(T71 added); Chapter 3 17 written / 26 stubs.

---

## 4. Claims the evidence does not support

> **Language scope rule:** Treat English-only operation as an accepted project
> assumption. Do not discuss localization, translation support, language coverage,
> or the removal of localization code anywhere in the report. Track that work only
> in engineering records.

| Do not write                                                                            | Why not                                                                                                                                                                                                                                                                                                                                                                           | What is true                                                                                                                                                                                                                                                                                                             |
| --------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| ~~"Verified on Linux"~~ **This caution is retired, 2026-09-21**                         | It was true until the VPS was brought to `0a7d51f1c12` and the suite re-run there. It no longer is                                                                                                                                                                                                                                                                                | **Verified on Linux is now a claim the evidence supports**: governance suite 3,211 passed / 0 failed on Ubuntu, rehearsal 20/20, platform probe 14/14, on top of the installation and the live model run of T2. Quote the figures with the date and the commit                                                           |
| "Tested by operators"                                                                   | T47 has not been run, and T60/T63 have never been pressed by a person                                                                                                                                                                                                                                                                                                             | The dashboard was driven by hand from all four tiers by one tester, then through a scripted browser under failure (2026-09-12/13)                                                                                                                                                                                        |
| "The repository's tests all pass"                                                       | Only the documented commands are clean; 5 wider UI tests fail, a jsdom limitation (finding 345, A10)                                                                                                                                                                                                                                                                              | The verification commands in `mg/HANDOFF.md` §4 pass                                                                                                                                                                                                                                                                     |
| "The layer prevents prompt injection"                                                   | It governs what an agent does, not why                                                                                                                                                                                                                                                                                                                                            | It contains the damage when persuasion succeeds (§4.x.26)                                                                                                                                                                                                                                                                |
| "Deployed for several organisations"                                                    | One organisation per installation since 2026-08-30, the boundary T49 chose (2026-09-15)                                                                                                                                                                                                                                                                                           | One organisation per installation; separation between organisations is not claimed (§3.5.89)                                                                                                                                                                                                                             |
| "A denied file can never appear in a search"                                            | That holds on the in-process runtime, not on the native Codex harness                                                                                                                                                                                                                                                                                                             | §3.5.61                                                                                                                                                                                                                                                                                                                  |
| "Three operator surfaces"                                                               | The command line was removed on 2026-09-07                                                                                                                                                                                                                                                                                                                                        | Two: the HTTP control plane and the dashboard (§3.5.77)                                                                                                                                                                                                                                                                  |
| "Always allow grants permanent permission"                                              | It allows the action once and files a request                                                                                                                                                                                                                                                                                                                                     | An Administrator approves the permanent rule (§3.5.81)                                                                                                                                                                                                                                                                   |
| "A full request queue is always reported"                                               | Not on Discord or Telegram                                                                                                                                                                                                                                                                                                                                                        | Reported in the Control UI; recorded in the ledger everywhere (§3.5.81)                                                                                                                                                                                                                                                  |
| "No known security hole" without a date                                                 | Each sweep has found more                                                                                                                                                                                                                                                                                                                                                         | Quote it with the date of the most recent sweep (§4.x.5)                                                                                                                                                                                                                                                                 |
| "An Administrator can set every per-agent setting from the dashboard"                   | Governance cannot be switched off for one agent, by design; and until A12 (2026-09-14) an escalation override could be cleared from the page and not set                                                                                                                                                                                                                          | Posture (enforce or monitor), escalation and escalation timeout are each set for one agent from the Policy section                                                                                                                                                                                                       |
| "Per-agent models work"                                                                 | Never exercised (T59)                                                                                                                                                                                                                                                                                                                                                             | Upstream supports it                                                                                                                                                                                                                                                                                                     |
| ~~"100% of actions are recorded", unqualified~~ **This caution is retired, 2026-09-21** | It was true of the first implementation, which logged governed actions only. That narrowing was **removed**, not documented: every invocation is recorded and the ones the layer could not evaluate carry the distinct decision `ungoverned`                                                                                                                                      | **The unqualified claim is now the correct one.** Say what `ungoverned` means alongside it, because a record that is complete only because unevaluated calls were folded in with allowed ones would be worse than an incomplete one (§3.2, §4.x.10)                                                                      |
| "Escalations always reach a person"                                                     | From a dashboard prompt, none did until 2026-09-12 (finding 347); and with no dashboard open, one waits out its timeout                                                                                                                                                                                                                                                           | Since T68 (2026-09-13), a dashboard prompt's card reaches the accounts that manage the agent, on an open governance page; a chat run's reaches the Control UI (§3.5.83)                                                                                                                                                  |
| "A task survives its tab", dated before 09-12                                           | Closing the tab cancelled the task until 2026-09-12 (finding 350)                                                                                                                                                                                                                                                                                                                 | True from 2026-09-12; §3.5.82's title was written a day early                                                                                                                                                                                                                                                            |
| "The dashboard shows current data offline"                                              | It keeps what it last loaded; until finding 346 it presented stored answers as fresh                                                                                                                                                                                                                                                                                              | Panels that could not be reloaded are flagged as possibly out of date                                                                                                                                                                                                                                                    |
| "Only a governance account can answer an approval", unqualified                         | True only of an escalation from a dashboard prompt (T68, 2026-09-13)                                                                                                                                                                                                                                                                                                              | A dashboard escalation: only the accounts that manage the agent. A chat run's approval: anyone holding the Gateway credential (HANDOFF caveat 27)                                                                                                                                                                        |
| "Deleting an agent removes everything it had"                                           | Governance's delete clears the id's rules, posture, overrides and lockdown (T55) and refuses old questions about it (366, 370); on the host the operator chooses between removing its configuration entry only and OpenClaw's own delete (C13, built 2026-09-15, §3.5.91)                                                                                                         | After the list-only delete the agent's scheduled jobs, host exec approvals, session records and files stay, and a new agent under the same name inherits them and is told so (372); only OpenClaw's own delete removes them, moving the files to the Gateway account's `.Trash`. Neither delete touches the audit ledger |
| "Cancelling a task withdraws its approval", unqualified                                 | True for plugin approvals from 2026-09-13 (finding 363); driven on a live Gateway 2026-09-19 (§3.5.93), where the card took 17 seconds to close on a slow laptop                                                                                                                                                                                                                  | The task, its record and its card end together; a reviewer who answered first keeps the answer (§3.5.83)                                                                                                                                                                                                                 |
| "Stopped within one second", of the confirmed stop                                      | The signal is milliseconds; the _confirmed_ stop of a dashboard task measured 2.2 and 2.8 s on the laptop on 2026-09-19 (§3.5.93, HANDOFF caveat 5), and 1.6 s on 2026-09-27 (dispatch 3.5 ms). While an agent was being created the Gateway answered nothing, the stop included, for 35–60 s (finding 395); about 6 s remains after the fix (5.4–6.4 s, committed `15bebeb58b0`) | Quote both numbers, and the confirmed one from the VPS. Name the agent-creation window, about 6 s, in which a stop waits                                                                                                                                                                                                 |
| "The deployment report shows governance is enforcing", before 2026-09-27                | Until finding 390 the report never read the posture: with governance Off it said 0 failed and "the shipped enforce default is in force"                                                                                                                                                                                                                                           | Since 390, "Governance is enforcing" fails for Off and warns for Monitor, naming the agents (Kinan kept Monitor a warning, 2026-09-28)                                                                                                                                                                                   |
| "Each agent's files are private to it"                                                  | OpenClaw nests later agents' workspaces inside the default agent's; until finding 385 the default agent could read them all. On the native Codex harness a search reaching them is still recorded, not withheld                                                                                                                                                                   | A path inside another agent's nested workspace is treated as outside this agent's workspace: a read escalates or is refused, and in-process searches withhold it (§3.5.96)                                                                                                                                               |

---

## 5. Open items that change what you can write

| Item                                          | Affects                                         | Until it closes, write                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| --------------------------------------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| ~~**T3** Linux re-run~~ **Closed 2026-09-21** | §4.x.9; requirement 9                           | **Met** (corrected 2026-09-28; this row still said "Partially met" and contradicted §4): the suite re-run on the VPS at `0a7d51f1c12`, 3,211 passed / 0 failed, rehearsal 20/20, probe 14/14, with T2 as the live evidence. Quote with the date and commit                                                                                                                                                                                                                                                         |
| **T70** rule descriptions                     | Chapter 3's policy sections; Chapter 4          | Built 2026-09-27; only Kinan's live acceptance QA (T47 §6f) is open. Write the required description as built (`report/DOCUMENTATION-UPDATES.md` §3 and §5), and keep the version-1 repair out of Chapter 3 (current-design-only rule)                                                                                                                                                                                                                                                                              |
| **T47** by-hand plan                          | Chapter 4's validation                          | The tier sweep, described as one tester's evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| **T48** design settled?                       | Chapter 3                                       | **Answered yes by Kinan, 2026-09-15.** Write it; flag anything that changes after T3 or T47                                                                                                                                                                                                                                                                                                                                                                                                                        |
| **T49** multi-tenancy                         | Chapter 3's design; Chapter 5                   | **Decided by Kinan, 2026-09-15: (b).** "One organisation per installation"; the structure is internal, not a separation claim (§3.5.89)                                                                                                                                                                                                                                                                                                                                                                            |
| **T17** figures                               | Chapters 3 and 4                                | Use the F-numbers and the keep/cut advice in `FIGURES.md`                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| **T13** the read                              | The defence                                     | §4.x.26                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| **T58, T59**                                  | Chapter 4; Chapter 5                            | Nothing about per-agent models; T58's cause unknown                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| **T46** wizard wording                        | Any installation walkthrough                    | The setup wizard still presents upstream's wording                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| **C13** host deletion                         | Chapter 3's agent lifecycle                     | **Decided and built 2026-09-15 (§3.5.91): the operator chooses between the list-only delete and OpenClaw's own.** Say that deleting an agent clears governance's state for it and, as the operator chooses, removes its configuration entry only or everything OpenClaw's own delete removes; not that the list-only delete removes files, jobs or sessions (372). OpenClaw's delete with files has run end to end in a test on Windows (after finding 373's fix), not yet on the Linux VPS (T3) or a live Gateway |
| **C14** finding 371                           | None: accepted 2026-09-15 (b), nothing to write | Accounts from before organisations cannot sign in and are not removed by the dashboard; no shipped installation can hold one                                                                                                                                                                                                                                                                                                                                                                                       |
| **C15** request author                        | Chapter 3's approvals                           | **Decided and built 2026-09-19 (§3.5.94).** A request filed by answering a dashboard escalation names the account that answered; one from a chat run's approval stays `hitl-approval`                                                                                                                                                                                                                                                                                                                              |

---

## 6. Before quoting anything

1. **`git status`.** Uncommitted work means a document may describe code the
   repository does not yet hold.
2. **`node docs-notes/qa-sweep-2026-09-08/doc-audit.mjs`.** Dead references, and
   every finding-count claim side by side.
3. **Re-derive the number** (§3). When a document and a command disagree, the
   command is right — and the disagreement is a finding worth recording.
