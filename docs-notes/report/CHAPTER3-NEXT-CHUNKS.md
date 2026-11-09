# Remaining Chapter 3 chunks: source and visual routes

Use with `CHAPTER3-CONTINUATION-HANDOFF.md` and `CHAPTER3-UPDATE-PLAN.md`. This is a reading map,
not a replacement for the numbered update instructions or current source. Recheck each claim
when writing. All paths below are relative to the repository root.

**Final checkpoint, 14 October 2026:** all ten chunks are applied and reviewed. This reading
map is now historical. See `CHAPTER3-FINAL-REVIEW.md` for corrections and outstanding
verification, and the change table for C112's T74 deferral. There is no next writing chunk.

## Chunk 4: Policy evaluation and grants (applied 14 October 2026)

Done; kept for reference. See `CHAPTER3-CHANGE-TABLE.md` rows C29, C35--C40, and WG3--WG5.

Boundary: `\subsubsection{Evaluation Order}` through Folder Grants, ending immediately before
`\subsection{Audit Ledger}`. Items: C29, C35–C40, and local C6 passages.

| Area              | Required facts and visual work                                                                                                                                                                           | Source route                                                                                                                               |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Evaluation Order  | Identify the separate installation ledger for unregistered agents; agent posture overrides installation posture; remove governance `off` from prose and outcome-table column                             | `src/governance/policy-engine.ts`, `policy-types.ts`, `policy-store.ts`, `paths.ts`; `policy-engine.test.ts`                               |
| Foreign workspace | Explain the owner-aware approval path and that foreign nested roots come from configured agents; deleting an agent can retire that boundary                                                              | `src/governance/agent-workspace-roots.ts`, `path-normalize.ts`; `nested-workspace.test.ts`, `nested-folder-retirement.test.ts`             |
| Baseline          | Recount current source rules; the correction backlog says thirteen baseline rules. Recheck listing-command pattern, seven host allowances, private-address restriction, and the command/network boundary | `src/governance/baseline-policy.ts`, `baseline-policy.test.ts`, `resource-extraction.ts`; `docs-notes/BASELINE-RULES.md`                   |
| Folder Grants     | Agent-scoped writes require registration in the organization; reflect actual generated allowances and exceptions                                                                                         | `src/governance/folder-grant.ts`, `folder-grant.test.ts`, `folder-grant-route.test.ts`; `src/gateway/governance-dashboard-folder-grant.ts` |

Read C29 in full: it specifies five changes, not merely a new count. C39 changes a core-table
row. C6 removes the outcome table's `off` column and its width declaration and fixes the path
diagram caption. Inspect F3 (`fig:gov-decision`), F5 (`fig:gov-pathnorm`), and F22
(`fig:gov-foldergrant`) against current source. Evaluation Order currently also has a code figure;
resolve its duplication under the one-visual formula and record any removal. Preserve exact
patterns in a legible form; do not paraphrase a regular expression into a different permission.

## Chunk 5: Ledger records (applied 14 October 2026)

Done; kept for reference. See `CHAPTER3-CHANGE-TABLE.md` rows C41--C47 and WG6.

Boundary: Audit Ledger opening and Entry Structure; stop before Hash Chaining and Verification.
Items: C41–C47 and the local C6 passage.

Read `src/governance/audit-ledger.ts`, `ledger-gap.ts`, `ledger-append-only.ts`, `paths.ts`, and
the relevant writer callers. Focused evidence: `ledger-gap.test.ts`, `audit-ledger.test.ts`,
`ledger-append-only.test.ts`, `ledger-rotation-failure.test.ts`, and `qa-round9.test.ts`.

Update the `ungoverned` decision row for integrity records. Explain loop-detector refusals with
the registered-agent and best-effort qualification. Explain checkpoint comparison under the
append lock, authenticated gap before the requested entry, deduplicated checkpoint-write failure,
and rotation failure after the entry/checkpoint are written. Distinguish Windows non-elevated
permissions from Linux root-only `chattr +a`, including the rotation consequence.

F25 (`fig:gov-ledger-append`) needs checkpoint comparison and gap insertion before payload
construction. Update the diagram and caption together. Audit-ledger field tables need the reserved
`loop-detector` label where relevant. Keep exact event attribution and sequence semantics.

## Chunk 6: Verification and sanitization (applied 14 October 2026)

Done; kept for reference. See `CHAPTER3-CHANGE-TABLE.md` rows C48--C66 and WG7.

Items C48–C66; stop before Access Control Model. Read the numbered instructions completely.
Source routes: `audit-ledger.ts`, `ledger-witness.ts`, `ledger-alerts.ts`, `ledger-key.ts`,
`scripts/verify-ledger.mjs`, `src/gateway/governance-dashboard-integrity.ts`,
`ui/src/pages/governance/integrity-controller.ts`, and the logging scrubbers. Follow imports for
sanitization rather than assuming the ledger and host logs use identical boundaries.

Focused evidence includes `ledger-gap.test.ts`, `ledger-witness-alerts.test.ts`,
`verify-ledger-script.test.ts`, `src/gateway/governance-integrity-routes.test.ts`, and
`src/logging/log-free-form-redaction.test.ts`. Inspect F26 (`fig:gov-ledger-verify`) and update
authenticated sequence jumps, checkpoint disagreement, witness receipts, alerts, and verification
results consistently. C59 changes the administrative-action table; C62 supplies actual scrubber
patterns. Named administrative actors, installation-ledger visibility, masking, truncation, and
conversation-storage limits need exact source checks. Do not overstate local tamper evidence as
immutable history or universal secret removal.

## Chunk 9: Runtime, tenancy, and lifecycle (applied 14 October 2026)

Done. See C100--C103, C114, and WG10 in the change table. Chunk 10 is also complete.
Preserve the source-backed qualifications for monitor, path-specific allowances, default
workspace layout, failed task persistence, and failed post-deletion folder moves.

## Later routes

| Chunk                      | Items and boundary                                                             | Primary reading and visual checks                                                                                                                                                              |
| -------------------------- | ------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 7: Access control          | C67–C84; Access Control Model and its three subsections                        | `docs-notes/ROLE-MODEL.md`, governance account/session stores, dashboard authentication and group authorization routes; inspect role-capability table and F2                                   |
| 8: Execution and approvals | C85–C99, relevant C110/C115, local C6; Prompt Execution Path through approvals | Prompt route, agent termination, lockdown, approval owners and answerers; inspect F6, F23, escalation settings, and cancellation attribution                                                   |
| 9: Runtime and lifecycle   | C100–C103/C114; Runtime Management through Agent Lifecycle                     | Task/slot registry, native harness relay, agent registry, nested-folder retirement, deletion routes; inspect F24, F21, F19, and lifecycle table; personally read sibling Codex for Codex prose |
| 10: Interface and closeout | C104–C117 and remaining C6; Management Interface through Summary               | Dashboard warning/deployment surfaces, security-owner modules and current tests; inspect security-limit and requirement-mapping tables, F11, and all remaining figure references               |

C112 depends on T74. Do not write an off-host witness as an implemented capability. D6-A agent
creation work was accepted but unbuilt in the 13 October engineering handoff; recheck its current
status before stating it. Approval routing changed to the dashboard for chat-origin requests, so
old claims about answering in chat need source verification.

At final closeout, search the whole active Chapter 3 for governance posture `off`, outdated rule
counts, removed figure labels, fixed printed figure numbers, unsupported measurements, editorial
notes, and overclaims inherited from frozen earlier chapters. Keep escalation `off` where it
means immediate denial. Update statuses from evidence rather than from the completion of a
writing pass.
