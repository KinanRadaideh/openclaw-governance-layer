# T97: the installation ledger's events in Root's audit view

(Decisions D1–D8.)

Added 2026-11-10. Kinan, reading Chapter 3's "The refusal is recorded as an
`agent-not-registered` entry in the installation ledger": "Investigate and understand T97 … a
ledger which is not visible to Root. then design/plan it, build it, test it, and document it,
especially in Documentation Updates md file." Backlog row: `mg/REMAINING-WORK.md` §"T97".
Record of the work: `mg/WORK-LOG-2026-11-10.md` §1.

## What the code did (verified 2026-11-10, before any change)

- **The installation ledger is a real chain.** `INSTALLATION_LEDGER_GROUP = "installation"`
  (`src/governance/paths.ts`) names `groups/installation/audit-ledger.jsonl`, written by the same
  `appendLedgerEntry` as every organisation's chain: keyed HMAC, its own checkpoint entry in
  `ledger-checkpoint.json`, rotation, gap lines. `newGroupId` mints only `group-<millis>-<hex>`,
  so no organisation can be named `installation`.
- **What is written to it** (every caller found by search):
  1. `policy-engine.ts`: a tool call from an agent with no registry record, `ruleId`
     `agent-not-registered`, decision `deny` (an agent entry, no `entryKind`).
  2. `host-prompt-audit.ts`: a prompt that reached an unregistered agent from a chat, a job or
     another host entry point (`governance.agent.prompt`, actor `host-prompt`).
  3. `auth-audit.ts`: a failed sign-in whose username belongs to nobody, and the
     suppressed-failure count (`governance.auth.*`, actor `unauthenticated`).
     **Corrected 2026-11-11 (QA, finding 457):** every failed sign-in and every lockout, a real
     account's included; the login route passes no organisation for either, deliberately (one
     record for both cases, so the trail is no account-existence oracle). The page's line under an
     installation row said such an event "belongs to no organisation"; reworded.
     `mg/QA-SESSION-2026-11-11.md`.
  4. `organisation-deletion.ts`: the second copy of an organisation's deletion outcome
     (`governance.organisation.delete`), "what an operator finds after the organisation is gone".
  5. `user-store.ts`, `account-credentials.ts`, `account-deletion.ts`: changes to accounts that
     predate organisations (`groupId` absent; the M3 migration's deletions).
  6. `audit-ledger.ts`: a gap line, when the installation chain disagrees with its checkpoint.
- **Nothing reads it except the terminal.** `GET /control-ui/governance/ledger`
  (`governance-dashboard-oversight.ts`) reads `tailLedger(session.groupId)` only, and
  `POST ledger/verify` verifies only the session's organisation. `scripts/verify-ledger.mjs`
  enumerates `groups/`, so it has always verified `groups/installation` too. So Root, the tier
  that owns installation-level decisions, could not see from the dashboard that an unregistered
  agent had tried to act, which Chapter 3 tells the reader is recorded.

## Decisions

**D1. Merged when read, never when written.** The two chains stay two files with their own
sequence numbers, hashes and checkpoints. The route reads both and combines the two lists in the
response. Nothing stored changes, no entry is copied or rewritten, and verification of each chain
is exactly what it was. Rejected: writing installation events into the organisation's chain as
well (a second copy whose hash chain is not the one the event was sealed in, and a rewrite of
history for existing entries, which T97 rules out).

**D2. Only Root of the installation's one organisation receives them, decided on the server.**
The condition is `session.role === "root"` **and** the session's organisation is the only
organisation any account in `users.json` belongs to (`installationOrganisation()`, a new
read-only helper: the single distinct `groupId`, or none). Administrators, Users and Viewers get
the response they got before, byte for byte, whatever their assignments; nothing on the client
decides this. Why Root alone: these events are about the installation (unknown sign-in names,
agents nobody registered, deleted organisations), and Root is the tier the design gives
installation-level judgement (the deployment report, the Codex backend, acknowledging integrity
alerts). Why the second condition: an installation holding two organisations exists only in the
isolation tests or by hand-editing `users.json`; there the events have no single owner, so no
Root receives them rather than every Root. Accounts that predate organisations (no `groupId`) are
ignored, as `wouldCreateSecondOrganisation` ignores them. A successor organisation's Root (after
an organisation was deleted) receives the whole installation chain, including the deleted
organisation's deletion record: that chain is the installation's, and this is exactly the reader
`organisationDelete`'s comment wrote the copy for. The deleted organisation's own retained chain
stays unread, as before.

**D3. Each installation entry is marked in the response and on the page.** The response adds
`ledgerScope: "installation"` to each installation entry; organisation entries carry no new field,
so every existing reader and every lower role's response is unchanged. The field is not part of
`LedgerEntry` and not hashed: it says which file the entry came from, which the route knows and
the entry does not. The page prints `installation #<seq>` where it prints `#<seq>` (the two chains
number independently, so `#3` alone would be ambiguous) and a line under the row: "Installation-
level event: recorded in the installation's own audit ledger, outside the organisation's chain.
Only Root sees these."

**D4. Ordered by time, each chain kept in its own order; paged after merging.** Both chains are
read with the same fixed window as before (`MAX_LEDGER_PAGE`, 1,000 newest of each), the two
oldest-first lists are merged by timestamp (a merge, so each chain's own order is never changed
even if the clock stepped back), equal timestamps put the organisation's entry first, and then the
newest `limit` entries are returned. Why this pages correctly: the newest `limit` of the union can
only contain entries that are among the newest `limit` of their own chain, and `limit` is at most
the window. Cost: Root's worst-case read is two windows (2,000 entries) instead of one; still a
constant, so finding 82's bound holds. Organisation filtering (`projectLedgerForActor`) runs on
the organisation entries exactly as before; the installation entries need none (Root sees every
field, and the rule is "Root or nobody").

**D5. Root can verify the installation chain from the dashboard.** For the same reader (D2),
`POST ledger/verify` adds `installation: <the installation chain's own verification>` beside the
organisation's result, which stays in the same top-level fields. The page shows it as a second
row, "Installation ledger integrity", with its own verdict, evidence and recorded alerts. The two
verdicts are never combined: they are two chains with two heads, and a break in one says nothing
about the other. (2026-11-11, finding 456: nor may a fault in one fail the other. An installation
chain that cannot be read now adds no rows to Root's view and is reported as that chain's failed
verification; before, it failed Root's whole `ledger` and `ledger/verify` responses.) Why in T97: showing Root entries it then cannot check would weaken the very
property the ledger exists for. The terminal check (`scripts/verify-ledger.mjs`) already covered
the chain and is unchanged.

**D6. The existing filters apply unchanged.** An unregistered agent's refusal is an agent entry
(`Agent actions`); a failed sign-in is a sign-in (`Sign-ins`); the deletion copy is a policy/admin
entry. No new filter: T97 asks for marking, and a filter would be a feature nobody asked for.

**D7. Not built: the installation chain's own integrity alerts in the banner.** A gap line
written into the installation chain now appears to Root as a marked row and in the installation
verification (D5), but the banner (`integrity/alerts`) and Root's acknowledgement read the
organisation's chain only, and the browser witness covers the organisation's head only. Changing
the banner means deciding which chain an acknowledgement is written to; that is a design question
of its own, not T97's. Recorded as limitation L58 (`docs-notes/report/CH4-LIMITATIONS.md`).

**D8. Nothing else changes.** No stored field, no route for any other role, no ledger write, no
permission. The tests include one that asserts an Administrator's, a User's and a Viewer's ledger
and verify responses are identical with and without installation events present.
