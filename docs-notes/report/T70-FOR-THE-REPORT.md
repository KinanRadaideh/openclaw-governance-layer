# T70 for the report: every policy rule says why it exists

Written 2026-09-27 for later inclusion in Chapter 3 (design) and Chapter 4 (testing). It
collects what happened with T70 in one place, and was checked against the code on the day
(`src/governance/policy-types.ts`, `rule-validation.ts`, `policy-store.ts`,
`folder-grant.ts`, `baseline-policy.ts`, `src/gateway/governance-dashboard-*.ts`,
`ui/src/pages/governance/`). The engineering record is `mg/SESSION-SUMMARY-2026-09-27.md`
and `docs-notes/CHAPTER3-MATERIAL.md` §3.5.95. The QA that followed it is in
`mg/QA-SESSION-2026-09-27.md`.

The drafts below follow `docs-notes/WRITING-GUIDE.md` and the rules in `mg/NEXT-AGENT.md`
(American spelling, no em dashes, labels rather than typed numbers). They are material for
Kinan to adapt, not accepted prose.

---

## 1. The problem T70 solved

Before T70, `PolicyRule.description` was optional. The HTTP route accepted a description,
and the Policy list used it as a rule's title, but the dashboard's **Add a rule** form had no
field for it and never sent one. The result was two classes of rule on one page:

- the shipped core and baseline rules, listed under sentences such as "Credential files
  (.env, private keys, .npmrc, .netrc)";
- every rule an operator wrote, listed under its regular expression, with a ledger entry that
  recorded the pattern and no reason.

A regular expression says what a rule matches, not why the permission exists. An operator
reviewing the policy months later, or an auditor reading the ledger after a rule was removed,
had no way to recover the purpose. T70 treats the description the way a version-control
system treats a commit message: the author must state, in words, why the change exists.

## 2. What was built

| Layer                      | Change                                                                                                                                                                                                                                                                                                | Where                                                                                |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Type                       | `description: string` is required on `PolicyRule`; the policy document's version became 2 (`POLICY_DOCUMENT_VERSION`)                                                                                                                                                                                 | `src/governance/policy-types.ts`                                                     |
| Validation at the boundary | `validateRuleDescription` refuses a missing, non-string, blank, or over-limit description with a 400 and trims the rest; `MAX_RULE_DESCRIPTION_LENGTH` is 500, shared with a rule request's reason                                                                                                    | `src/governance/rule-validation.ts`                                                  |
| Store invariant            | `addRuleChecked`, through which every rule is written, trims the description and refuses a blank one (`MissingRuleDescriptionError`), so an in-process caller cannot bypass the route                                                                                                                 | `src/governance/policy-store.ts`                                                     |
| Ledger                     | the rule add and remove entries end `; description: …`, after the ledger's ordinary redaction and length cap                                                                                                                                                                                          | `policy-store.ts` (`describeRule`)                                                   |
| Folder grant               | requires the operator's purpose, which leads the description of the grant and of each exception it writes                                                                                                                                                                                             | `src/governance/folder-grant.ts`, `src/gateway/governance-dashboard-folder-grant.ts` |
| Rule requests              | an approved request's mandatory reason becomes the rule's description                                                                                                                                                                                                                                 | `src/gateway/governance-dashboard-rule-requests.ts`                                  |
| Evaluation                 | the description is never consulted by the policy engine; the old `description ?? pattern` fallbacks were removed                                                                                                                                                                                      | `policy-engine.ts`, `rule-conflicts.ts`                                              |
| Dashboard                  | a required description field with a live character count; Add rule disabled until it holds text; the same for the folder grant's purpose; every policy view titles a rule by its description with the full regular expression beneath; search uses the description; the removal confirmation names it | `ui/src/pages/governance/`                                                           |

Examples of the descriptions the system now produces:

- typed by an operator: "Lets main report the host name for diagnostics";
- a folder grant with the purpose "Deploy the web app": "Deploy the web app (grant on
  C:/srv/webapp, except C:/srv/webapp/secrets)", and for its exception "Deploy the web app
  (exception to the grant on C:/srv/webapp: C:/srv/webapp/secrets)";
- an approved request: "Requested by user1: I need scout to report uptime for the weekly
  health check" (observed live on 2026-09-27);
- an approved escalation (after finding 393, §5): "Requested by user1, answering an
  escalation: Agent "scout" asked to run "exec" against command "hostname"."

## 3. The two design decisions worth a paragraph each

### 3.1 A version-gated repair, not a standing allowance

Existing installations already held operator rules without descriptions, because the form had
never sent one. Refusing to load them would lock an operator out of their own policy, and
inventing a purpose would put words in their mouth. The loader therefore repairs a
**version-1** document as it reads it: each description-less rule receives the sentence
"No purpose was recorded for this rule (added by X on DATE, before descriptions were
required). Replace it with a rule that says why it exists, or remove it." The next write
stores the document as version 2.

Gating the repair on the version is what keeps it a one-time migration. In a version-2
document, no write path can produce a rule without a description, so such a rule can only
come from a hand edit and is treated as malformed.

### 3.2 Malformed rules fail towards restriction

The first implementation dropped every description-less rule from a version-2 document. The
existing QA round 10 tests failed, because dropping a hand-written **denial** silently widens
access. The final rule is asymmetric: a malformed **allowance** is dropped, since it grants
nothing, and a malformed **denial** is kept, enforced, and labelled "This denial was stored
without a description …". This is the same principle as the rest of the loader: an error in
stored policy may narrow what an agent can do, never widen it.

## 4. Finding 380, found while testing T70

After a folder grant, the dashboard cleared the form and immediately refilled it. Two draft
writes each spread the draft as it stood when the button was drawn, so the second, which
recorded the list of rules written, restored the folder and exceptions that the first had
cleared. T70's purpose field made the defect visible in a test. It was fixed by making the
reset one write, proved first by a failing test and then live.

## 5. What the QA of 2026-09-27 found in and around T70

The full dashboard QA confirmed T70's behaviour live, with a model connected, from the Root,
Administrator, User and Viewer accounts:

- a whitespace-only description keeps Add rule disabled; a padded description is sent trimmed
  and becomes the title, with the pattern beneath;
- the folder grant is disabled until a purpose is typed, and the purpose leads both generated
  descriptions;
- search by description works across operator, core and baseline rules;
- the removal dialog names the rule by its description;
- the ledger add and remove entries carry the description, and the chain verified both in the
  dashboard and with the standalone `scripts/verify-ledger.mjs` (96 entries, heads equal);
- the Viewer sees descriptions and no authoring controls.

Four findings touched the descriptions directly. All four were fixed on 2026-09-27, each
proved first by a failing test:

- **388.** A core rule's title, now shown everywhere, read "The governance command line,
  which can switch the gate off", although that command line was removed on 2026-09-07. It now
  says it was removed and is kept as a backstop. The opening words are unchanged on purpose:
  `seedRuleId` derives a shipped rule's id from them, and the ledger refers to that id.
- **391.** The per-agent lookup showed a rule's effect by colour alone. With the free-text
  description as the title, a forbid rule described as "Lets main report the host name" read
  as a permission. The status now says "forbid · global" or "allow · this agent".
- **393.** A rule created by approving an escalation's request was titled "Requested by
  hitl-approval: Requested after an escalation: … Approving makes that permanent; rejecting
  leaves it needing approval each time." It now credits the account that answered, which C15
  already recorded, and states only what happened.
- **Observation, fixed with 390.** The deployment report named a switched-off core rule by its
  id; it now gives the description and the id.

Finding 389 is adjacent. The add-rule form cleared the agent after a write, so the next rule
could silently apply to every agent. The folder grant already kept its agent, and the
add-rule form now does the same.

## 6. Evidence to cite in Chapter 4

- **Tests.** New `src/governance/rule-description.test.ts` (13),
  `src/gateway/governance-rule-description.test.ts` (routes, now also the escalation case),
  `ui/src/pages/governance/rule-description-form.test.ts` (now 14). About 180 existing
  fixtures gained descriptions.
- **Suite at T70's completion (2026-09-27, before the QA fixes):** governance suite on
  Windows 3,274 passed, 21 skipped, 0 failed in 203 files; the three typechecks, plain and
  type-aware lint, format, i18n verification and `build-all` clean. Re-measure after the QA
  fixes rather than quoting this figure (see `mg/QA-SESSION-2026-09-27.md`).
- **Mutation testing:** 22 mutations, one per protection (route, validator, store, loader,
  version gate, malformed-denial handling, version upgrade, ledger text, folder-grant
  validation and composition, and eleven in the dashboard), 22 killed.
- **Live:** the two live runs described in §5 above and in `CHAPTER3-MATERIAL.md` §3.5.95.

## 7. Where it belongs in Chapter 3, and draft text

| Section                        | What to add                                                                                                                                                    |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 3.5.2.1 Rule Model             | A paragraph on the `description` field (draft 7.1). The code figure already shows `description: string` (updated in `chapter3.tex` on 2026-09-27).             |
| 3.5.2.4 Baseline Policy        | Core and baseline rules carry declared descriptions, and 388's wording for the kept command-line denial.                                                       |
| 3.5.2.5 Folder Grants          | The purpose field and the two generated descriptions (examples in §2).                                                                                         |
| 3.5.3.3 Administrative Logging | The `; description: …` suffix on rule add and remove entries, and why: after a removal, the ledger is the only remaining record of why the permission existed. |
| 3.5.7.2 Persistent Approvals   | An approved request's reason becomes the rule's description, crediting the answering account (393).                                                            |
| 3.5.11 Management Interface    | Description-first titles in every policy view, search, the removal confirmation, and the effect in words (391).                                                |
| Chapter 4                      | The evidence in §6, and the fail-towards-restriction test that caught the first repair (§3.2).                                                                 |

### 7.1 Draft for 3.5.2.1, Rule Model (after the paragraph on `createdBy`)

```latex
The \texttt{description} field records why a rule exists. It is required: a rule
without one is refused both by \texttt{validateRuleDescription} in
\texttt{src/governance/rule-validation.ts}, which checks input arriving from the
management interface, and by \texttt{addRuleChecked} in the policy store, through
which every rule is written. A description is trimmed and limited to 500
characters. The policy engine never reads it, so the words cannot change what a
rule matches. The description instead serves the operators who read the policy
later. The management interface lists each rule under its description, with the
exact pattern beneath, and the audit ledger records the description when a rule is
added or removed. After a rule has been removed, that ledger entry is the only
remaining statement of why the permission once existed.
```

### 7.2 Draft for the Rule Model figure's explanation (optional)

The current explanation reads "PolicyRule combines those values with a regular-expression
pattern, optional agent scope, and optional expiry." A version naming the new requirement:

```latex
The four union types restrict rule fields to values understood by the policy
engine. \texttt{PolicyRule} combines those values with a regular-expression
pattern, a required description, optional agent scope, and optional expiry. The
complete definition is in \texttt{src/governance/policy-types.ts}.
```

### 7.3 Draft for 3.5.2.4 or Chapter 4, on the repair

> **Checked against `docs-notes/WRITING-GUIDE.md` on 2026-09-28: do not paste this draft into
> Chapter 3 as it stands.** It explains a migration for older installations, which the guide's
> current-design-only rule keeps out of report prose, and its last sentence uses "silently",
> which the guide bans. The version-1 repair belongs in Chapter 4 as evidence, if anywhere. For
> Chapter 3, state only the current semantics, for example:
>
> ```latex
> A rule is stored with a description. When the policy store reads a rule that lacks
> one, it treats the rule as malformed. A malformed allowance is dropped because it
> grants nothing. A malformed denial is kept, enforced, and labeled as malformed,
> because discarding it would widen what an agent may do with no warning to the
> operator.
> ```
>
> The original draft follows, for Chapter 4.

```latex
Existing installations already held operator rules without descriptions, because
the management interface had never requested one. Refusing to load such a policy
would lock operators out of their own rules, and inventing a purpose would
misrepresent them. The policy store therefore repairs a version-1 document when it
is read, labeling each such rule as one whose purpose was never recorded, and the
next write stores the document as version 2. In a version-2 document no write path
can produce a rule without a description, so one found there is malformed. A
malformed allowance is dropped because it grants nothing. A malformed denial is
kept, enforced, and labeled, because discarding it would silently widen what an
agent may do.
```
