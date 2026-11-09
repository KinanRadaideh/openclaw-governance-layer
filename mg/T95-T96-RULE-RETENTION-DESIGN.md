# T95 + T96: expired rules stay until removed; every rule deletion says whether the rule had expired

(Decisions D1–D6; D6 was found in the live run.)

Added 2026-11-09. Kinan: "do T95 and T96. plan/design them (if anything needs designing), then
build them, then test them (including a live dashboard test), then document them for inclusion in
ch3." Built after T94's testing finished (T94 was then uncommitted in the same tree; no T94
file is touched here). Committed 2026-11-09: code `632e6e3a3d3` (T94's code is `ea635423905`). Record of the work: `mg/WORK-LOG-2026-11-09.md` §1.

## What the code did (verified 2026-11-09, before any change)

- **T95 confirmed.** `addRule` (`src/governance/policy-store.ts`) ran
  `doc.rules = pruneExpiredRules(doc.rules, Date.now())` inside its write lock, before the
  ceiling check. `pruneExpiredRules` (`policy-types.ts`) dropped every rule whose expiry was more
  than `EXPIRED_RULE_RETENTION_MS` (7 days) in the past, and **every rule with an unreadable
  expiry, at once**. No ledger entry was written for any rule removed this way. A second exported
  helper, `pruneExpiredPolicyRules`, did the same as its own write; nothing in production called
  it (one test did).
- **T96, the dashboard's Remove button** (`removeRule`, route
  `DELETE /control-ui/governance/policy/rules/:id`) wrote `governance.policy.rule.remove` with
  `describeRule(removed)`: effect, kind, access, pattern, scope, `expires <timestamp>` or
  `indefinite`, description. The timestamp was there; **whether the rule had already lapsed was
  not**. A reader had to compare the expiry with the entry's own timestamp, and an unreadable
  expiry gave them nothing to compare.
- **T96, agent deletion** (`clearAgentPolicy`, called by full agent deletion in
  `agent-provisioning.ts`) removed every rule naming the agent and wrote one
  `governance.policy.agent-cleared` entry with **a count** ("2 rules, …"). The deleted rules were
  neither identified nor described, and their expiry status was not stated.
- **Not a deletion operation, left as is:** loading `policy.json` drops a malformed allowance (no
  description) and core-tier rules the file claims (they are rebuilt from source). Both arise only
  from editing the file outside the dashboard, which the policy seal (T86 D9) already records as a
  sealed `governance.policy.file-changed` alert. Recorded as a residual in Ch4 material, not built.
- Matching was already correct for retained expired rules: the engine (`policy-engine.ts`, both
  the denial pass and the allow pass), the per-agent projection, conflict detection and the search
  audit all skip `isRuleExpired` rules. The Policy page already marks them "expired".

## Decisions

**D1 (T95). Adding a rule deletes nothing.** The prune call leaves `addRule`; `pruneExpiredRules`,
`pruneExpiredPolicyRules` and `EXPIRED_RULE_RETENTION_MS` are deleted, so no silent deleter remains
to be called again. An expired rule stays stored, shown on the Policy page as expired, and applied
to nothing, until an operator removes it (D3) or its agent is deleted (D4). Why: a deletion nobody
asked for and nothing recorded is the one kind requirement 5 cannot account for; and the rule the
operator investigating "why was this denied?" needs is exactly the lapsed one.

**D2. The ceiling counts every stored rule, expired ones included.** `MAX_POLICY_RULES` (1,000) is
about the size of the document and the loop the gate runs, and an expired rule still costs both.
The old code checked the ceiling after pruning so a policy full of lapsed rules "recovered on its
own"; now it does not, so the refusal says how many of the stored rules have expired and that
removing those frees room (`TooManyRulesError(expired)`). Rejected: counting only live rules
(the file could then grow without bound, which is what the ceiling exists to stop).

**D3 (T96). A removal entry states the rule's expiry status at the moment of deletion.** The
status is decided inside the write lock, at the instant the rule leaves the document, by the
canonical `isRuleExpired` (expiry at or before that instant = expired; an unreadable expiry =
expired, the engine's own reading). It is written into the scope parenthesis, before the free-text
description, so a description cannot imitate it:

    allow path read ^/srv/a(/|$) (all agents, expires 2026-11-09T10:00:00.000Z, expired at removal); description: …
    allow path read ^/srv/a(/|$) (all agents, expires 2026-11-10T10:00:00.000Z, not expired at removal); description: …
    allow path read ^/srv/a(/|$) (all agents, indefinite, not expired at removal); description: …
    allow path read ^/srv/a(/|$) (all agents, expires not-a-date, expired at removal: expiry unreadable); description: …

Recorded, never recomputed: a viewer reading the entry a year later sees what was true when the
rule was deleted. Kept in the hashed `resource` text rather than a new ledger field: no chain
format change, no new field for the dashboard or verifier to learn, and the entry is already the
record of what the rule was (Ch3 §audit). A Viewer sees it masked with the rest of the rule, as
before. `rule.add` entries are unchanged.

**D4 (T96). Agent deletion records every rule it removes.** After the `agent-cleared` summary
(kept: it is the act, and the posture/override/lockdown it also clears have no entry of their
own), one `governance.policy.rule.remove` per removed rule, same description and status as D3 plus
`removed with the agent` in the parenthesis, `ruleId` = the rule's id, `agentId` = the agent.
This reverses the 2026-09 T55 choice of a count only (admin-audit.ts comment rewritten): an
auditor filtering for rule removals missed every rule that left with an agent, and the count could
not say which rules, what they granted, or whether they had lapsed. The summary first, then the
removals, so the cause precedes its consequences in the chain.

**D5. Fixed on sight: the dashboard's "rule in force" check read an unreadable expiry as live.**
`noticeInForce` (`ui/src/pages/governance/panels/rule-check.ts`) kept a "broader than it looks"
notice for a rule whose `expiresAt` did not parse (`NaN <= now` is false), while the gate treats
that rule as expired. Now the same reading as `isRuleExpired`. UI only.

**D6. Found in the live run: the Remove dialog told an untruth about an expired rule.** Removing
any allow rule asked "Remove this permission? The agent will no longer be allowed to do this.";
for an expired rule the agent was already not allowed. T95 makes this the common case (expired
rules now wait for someone to remove them), so the dialog now says, for a rule that has expired
by the gate's reading: "Remove this expired rule? It already applies to nothing, so removing it
changes no decision. The audit ledger records the removal and notes that the rule had expired."
The expiry test is one exported helper, `ruleHasExpired` (`panels/rule-check.ts`), used by D5's
notice check too. UI only; Chapter 3 does not describe this dialog.

## Tests (new file, real files, no mocked writer)

`src/governance/rule-retention-and-removal-audit.test.ts`:

- T95: expired rule (8 days old, past the old retention), unreadable-expiry rule and live rule
  stored; add a fourth; all four stored; the expired and unreadable ones decide nothing (the gate
  asks/denies as with no rule), the live one allows.
- D2: a policy at the ceiling made of expired rules refuses the next add and names the expired
  count.
- D3 through `removeRule` reading the persisted ledger: active time-limited, expired, indefinite,
  exactly-at-expiry (boundary = expired, fake clock), one millisecond before (not expired),
  unreadable expiry; the chain verifies afterwards.
- D3 wording cannot be imitated from the description position (status precedes `description:`).
- D4 through `clearAgentPolicy`: one summary + one removal per rule with status and
  `removed with the agent`; global rules untouched and unrecorded; chain verifies.
- Route level: the dashboard's Remove button and agent deletion, driven in the live run (work log §1.4).
- D5: UI unit test for `noticeInForce` with an unreadable expiry (`rule-notice-unreadable-expiry.test.ts`).
- D6: the Remove dialog on the real page for expired, unreadable, live and indefinite rules
  (`rule-remove-expired-dialog.test.ts`).
