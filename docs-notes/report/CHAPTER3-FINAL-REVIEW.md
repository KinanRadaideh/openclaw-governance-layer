# Chapter 3: complete source review

Reviewed 14 October 2026. Active document: `docs-notes/report/ch3-updated.tex`.
All ten writing chunks are applied. This is a source-backed documentation review, not a
new runtime test campaign or a claim that the document has been uploaded to Overleaf.

## Scope and evidence

Compared the active report with `DOCUMENTATION-UPDATES.md` C4--C117, the writing guide,
the supplied original export, current implementation, and relevant test code. The current
checkout is `governance-layer`, HEAD `a2b897f19d12255ca7ad18b6e6e553e514ae790c`; working-tree
report changes are additional to that commit. Three bounded read-only reviews covered
policy, ledger, and access/runtime. The primary agent checked consequential corrections
directly and merged them into the same active document.

| Chunk | Review coverage                                                                                               | Outcome                                                                                                                                        |
| ----- | ------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| 1     | Framing, requirement wording, tool/OS-call distinction, postures, recording, stop controls, Linux evidence    | Corrected the unconditional one-second statement and qualified tail detection; added C113 messaging boundary                                   |
| 2     | Constraints and alternatives, central gate, path representation, log integrity, identity, management, tenancy | Required update facts represented; same-host boundary kept                                                                                     |
| 3     | Architecture and rule model, resource extraction, descriptions, expiry, browser navigation                    | Corrected required literal capitals versus regex classes/escapes and qualified current-format missing descriptions                             |
| 4     | Evaluation order, path normalization, baseline patterns, foreign folders, grants                              | Corrected posture consultation order, default workspace layout, and listing through symbolic links                                             |
| 5     | Entry fields, append locks, gap insertion, checkpoint writes, rotation, append-only protection                | Required updates represented, including best-effort loop-detector recording and failure boundaries                                             |
| 6     | Verification, witness receipts, alerts, administrative attribution, sanitization/projection                   | Corrected leading gap sequence, append-only checkpoint membership check, and absolute tamper-detection claim; named timeline/node-host outputs |
| 7     | Roles, authentication, ownership, session updates, assignments                                                | No additional required factual correction identified                                                                                           |
| 8     | Prompt recording, stopping, approval routing, notes, expiry, cancellation                                     | No additional required factual correction identified; live warning-placement check remains open                                                |
| 9     | Task settlement, native relay, tenancy, registration, host deletion, nested folders                           | No additional required factual correction identified; configured-relay and persistence limits are stated                                       |
| 10    | Interface, deployment alerts, security table, policy seal, summary                                            | Final required/selected optional updates applied; no off-host witness represented as built                                                     |

## Earlier-chunk corrections applied during review

| Finding                          | Corrected wording/mechanism                                                                                                                                            | Direct evidence                                                                                                               |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| R1: network regex overstatement  | Required literal capitals trigger warnings; capital-containing regex classes or escapes can match lower-case hostnames. Hostless inputs use the raw-resource exception | `src/governance/rule-warnings.test.ts:204`; `rule-validation.ts:309`; `resource-extraction.ts:170`                            |
| R2: missing description scope    | Describes malformed rules in the current stored format, avoiding a blanket claim about every accepted stored input                                                     | `src/governance/policy-store.ts:302`                                                                                          |
| R3: evaluation ordering          | Policy loads before containment; effective posture is consulted after denial/allowance matching                                                                        | `src/governance/policy-engine.ts:698`, `1119`                                                                                 |
| R4: workspace layout             | Nested placement is the default onboarded layout; configured agent workspaces can lie elsewhere                                                                        | `src/agents/agent-scope-config.ts:263`                                                                                        |
| R5: listing confinement          | Listing regex excludes absolute arguments and parent traversal, but argument symbolic-link targets are not path-governed                                               | `src/governance/baseline-policy.ts:337`; `policy-engine.ts:879`; `command-working-folder.test.ts:74`                          |
| R6: stop latency                 | Removed unconditional one-second compliance assertion and the prohibited word “deliberately”; creation can delay the Gateway; measurements belong in Chapter 4         | `DOCUMENTATION-UPDATES.md` C86/C109; `src/gateway/governance-agent-termination.ts`; writing guide                             |
| R7: first chain sequence         | An ordinary intact chain starts at one; a leading authenticated gap can start later after stored history is removed                                                    | `src/governance/audit-ledger.ts:879`, `1196`; `ledger-gap.test.ts:142`                                                        |
| R8: checkpoint checker ownership | Append validates membership/hash of a lagging checkpoint. Direct verification rejects ahead/equal-head mismatches but does not perform that membership check           | `src/governance/audit-ledger.ts:752`, `1306`; `scripts/verify-ledger.mjs:355`                                                 |
| R9: tamper evidence scope        | A surviving checkpoint/receipt is needed to expose removed tails. Checkpoint rewind plus unseen removed entries can evade detection without the key                    | `src/governance/ledger-witness.ts:4`, `35`; `audit-ledger.ts:1306`                                                            |
| R10: named log outputs           | Named the opt-in diagnostics timeline and node-host error output alongside generic host log sinks                                                                      | `src/infra/diagnostics-timeline.ts:186`; `src/node-host/stderr-line.ts:10`; `src/logging/log-free-form-redaction.test.ts:436` |

Policy seal, deployment posture, disabled approval controls, deletion notices, log scrubbing,
cookie handling, and their failure boundaries were checked directly for chunk 10.
For Codex-dependent prose, the primary personally inspected sibling
`../codex/codex-rs/hooks/src/events/pre_tool_use.rs:198` and
`../codex/codex-rs/hooks/src/events/post_tool_use.rs:39`. A configured pre-tool deny can block
execution; arbitrary hook failure is not a universal fail-closed guarantee. The post-tool
outcome has no replacement tool-response field.

## Preservation and static checks

- The original nine requirement statements and their complete Chapter 3 section are unchanged.
- Front matter and Chapters 1--2 match the supplied export before the removed Chapter 3
  editorial map. The first original/draft difference is that source-only map at original line 707.
- Bibliography and appendices match the original after normalizing line endings, and their
  saved bytes match the pre-chunk tail hash.
- Chapter 3 braces balance with no negative depth. Environment nesting balances, including
  figures, tables, longtables, listings, and TikZ. There are no duplicate labels or missing
  report references. The final chapter has 19 figures and 13 table/longtable objects.
- Reviewed visible additions/replacements use bounded red groups or explicit red caption,
  table-cell, and diagram-label commands. Existing earlier red edits are kept. A source diff
  and color-scope scan was manually checked for false positives from unchanged line wrapping,
  structural commands, and unchanged visual text. This is not rendered-color verification.
- No obsolete governance `off` posture claim is left in Chapter 3. Remaining `off` wording
  concerns escalation, backend switches, inability to switch governance off, or off-host evidence.
- The writing guide's shortening pass influenced the revised prose. Security keeps both its
  required cross-boundary table and filesystem-race figure as a recorded one-visual exception.
  Its table is paginated; remaining float tables touched in chunk 10 use ordinary tabular.

## Later red-text writing-guide pass, 14 October 2026

Kinan identified wording defects missed by the first style check, including personification,
subject--therefore--verb constructions, and formulaic lists of three. The later pass reviewed
every red passage, including red captions, table cells, and diagram labels. This pass supersedes
the earlier style assurance; the source-backed behavior review above still applies.

The newly supplied attachment (`090ff4d4-5597-4e9c-8fc0-1eba8b98a323/Pasted text.txt`) matched
the active document before this pass. Changes were made in that active file only. No
replacement report or PDF was created. Three bounded agents handled disjoint chapter areas,
and the primary reviewed the merged wording and completed the introduction and later sections.

Revised 81 of the 177 bounded red spans and the wording in the two wholly red control tables.
The remaining spans were reviewed and kept where already suitable or where they contain exact
technical data. Screenshot wording now describes model-facing tool instructions and policy
evaluation directly. Removed red uses of judge/tells/refuses, preserve, system-must,
deliberately/silently, and subject--therefore--verb wording. Split avoidable three-part prose and
reduced repetitive contrasts and compressed semicolon constructions. Necessary exact permission
values, technical character classes, and role-authority lists are kept; black original wording
was outside this red-only task.

Preservation check: after substituting markers for red interiors and the two wholly red tables,
the rest of the source matches the pre-pass document exactly. Red-group count and boundaries
are unchanged. Technical texttt identifiers and values, inline patterns, and labels are
unchanged. Chapter braces and environment nesting balance, with no missing references.
The primary personally checked sibling Codex's pre-tool deny response and post-tool outcome
fields before revising the native-runtime explanation (`pre_tool_use.rs:241`,
`post_tool_use.rs:39`). No behavior or measured result was changed by this wording pass.

Compilation was attempted on the saved active document and still stops at missing
`style-PSUT-BSc-Eng.sty`. Rendered layout and color remain unverified here.

## Outstanding checks and deferred work

- **C112 / T74:** the off-host witness is not implemented. The existing same-host ledger and
  signed browser receipt are documented with their limits. No further writing chunk is pending.
- **Compile/layout:** the built-in compiler was called on the saved active document and stopped
  at missing external `style-PSUT-BSc-Eng.sty`. No separate report, PDF, or replacement editor
  tab was created. Overleaf still needs to verify actual red text, pagination, and layout.
- **C98 live acceptance:** the dashboard warning route is source-backed, but its post-D7
  live placement check was not performed in this report pass.
- Runtime test code was inspected, not executed. Chapter 4 owns measured compliance and test
  totals; this review does not replace that validation or implement accepted-but-unbuilt D6-A.
- Front-matter C1--C3 and Chapters 4--5 C118--C148 are outside this revision's scope.
