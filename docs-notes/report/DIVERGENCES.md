# Where the built system differs from the preliminary design

**Started 2026-09-20, at Kinan's instruction.** Chapters 1 and 2 describe the
design as it was _proposed_. Chapter 3 describes it as it was _built_. Where the
two differ that is normal and expected for a project of this kind, and the two
model reports do the same thing. **What is not acceptable is letting the reader
discover the difference on their own.**

So the rule for Chapter 3 is:

> Every difference between the preliminary design and the developed design is
> **stated openly and then justified**. Say what Chapter 1 or 2 proposed, say
> what was built, and say **why the change was made**. A difference that is
> explained is engineering judgement; the same difference left unmentioned looks
> like an oversight, and an examiner who spots one will start looking for more.

Each row below names the section of Chapter 3 that owes the explanation.

---

## 1. Verified differences

These have been checked against the code or the registers.

### 1.1 A hash chain, not a Merkle tree

|                    |                                                                                                                                                                                                                                                                                                 |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Chapter 2 says** | §"Tamper-Evident Logging and Traceability" describes cryptographic hash chaining with SHA-256, and then adds that "for systems generating high volumes of telemetry, this sequential chaining is often structured into a **Merkle Tree**", describing the root hash and efficient verification. |
| **What was built** | A **keyed HMAC-SHA256 hash chain**, one entry linked to the previous, with a separate checkpoint file and an independent verifier. No Merkle tree.                                                                                                                                              |
| **Explain it in**  | §"Hash Chaining and Verification"                                                                                                                                                                                                                                                               |

**Why it was designed that way**, and this is the part to write out:

- A Merkle tree earns its keeping when a verifier needs to prove **one** entry
  belongs to the log without reading the whole log. That is a requirement of
  distributed systems with untrusting parties. Here the verifier is the operator
  of the same machine, and the ledger is a local append-only file.
- The ledger is verified end to end, which a chain does in a single pass. The
  tree's advantage would be a cost with no buyer.
- The chain is **keyed** (HMAC rather than a bare hash), which a plain SHA-256
  chain is not. That is a strengthening over Chapter 2's description, not a
  weakening: an attacker who can rewrite entries still cannot recompute the
  chain without the installation's key.

### 1.2 Redaction reuses the host's, rather than adding regex and entropy analysis

|                    |                                                                                                                                                                                                                                     |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Chapter 2 says** | §"Automated Data Sanitization" promises a pre-processing filter using "strict pattern matching algorithms (such as complex Regular Expressions) and entropy analysis" to detect secret formats and replace them with a placeholder. |
| **What was built** | Recorded text is redacted **at the ledger boundary** by the host's own `redactToolPayloadText`, so every write into the ledger passes through it.                                                                                   |
| **Explain it in**  | §"Data Sanitization"                                                                                                                                                                                                                |

**Why it was designed that way:**

- The host already had a tested redactor that its own maintainers keep current
  as new secret formats appear. Writing a second one would have meant two
  redactors to maintain and two chances to miss a format.
- **Placement matters more than cleverness here.** A regex filter applied by
  each caller can be forgotten by one caller; a redactor applied at the single
  boundary where entries are written cannot. Chapter 3 should make that
  argument, because it is the stronger engineering point.
- It also holds the line on the constraint of adding no new dependencies.

### 1.3 Two different conflict mechanisms, and Chapter 1 describes only one

|                    |                                                                                                                                                                                                                                                                                                                                                                                                    |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Chapter 1 says** | §1.6: "The system is protected from contradictory policies by prioritizing those created earlier, and notifying users when such a conflict appears so it may be resolved."                                                                                                                                                                                                                         |
| **What was built** | **Both halves of that are true**, of the conflict _detector_: on creation the candidate is compared against active rules inside the policy's write lock, the earlier rule prevails, the candidate is still stored, and the conflict is reported. **But that is not how a decision is reached.** At evaluation time a matching **denial beats a matching allowance whatever their creation order**. |
| **Explain it in**  | §"Evaluation Order", with a sentence in §"Rule Model"                                                                                                                                                                                                                                                                                                                                              |

**This is an incompleteness rather than a contradiction**, and it is the more
dangerous kind, because a reader of Chapter 1 alone would reasonably conclude
that creation order decides outcomes. It does not.

**Why it was designed that way:** creation order is a reasonable way to tell an
author that a new rule adds nothing, because it answers "which of these two did
you mean?". It is a bad way to decide a security outcome, because it makes the
safety of the system depend on the order somebody typed things in. Deny-first
evaluation means a denial cannot be undone by writing an allowance afterwards,
which is the property the default-deny posture needs.

### 1.4 The confirmed stop is slower than one second

|                    |                                                                                                                                                                                                                                                            |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Chapter 1 says** | §1.6: a "Sub-Second Kill Switch" that terminates "within a guaranteed response time of one second or less". §1.3 requirement 7 says the same.                                                                                                              |
| **What was built** | The stop **signal** is dispatched in milliseconds. The **confirmed** stop of a task started from the dashboard measured **2.2 s and 2.8 s** on the development laptop on 2026-09-19, on a machine whose Gateway was logging event-loop stalls at the time. |
| **Explain it in**  | §"Kill Switch", and again in Chapter 4                                                                                                                                                                                                                     |

**Why it was designed that way**, and this needs care because it reads as a
missed requirement unless the distinction is made properly:

- The design deliberately reports a **confirmed** stop rather than a sent
  signal. A system that returns "stopped" the instant it calls `kill()` is
  faster and less honest: the agent may still be finishing a write.
- So the number is larger than Chapter 1's because it measures something
  stricter than Chapter 1 measured. Say that plainly, give both numbers, and
  give the machine they were taken on.
- Quote the VPS figure too once T3 re-measures there. A laptop under load is
  the worst case, not the deployment target.

### 1.5 Who sets the escalation timeout

**Corrected 2026-09-20, hours after it was first written.** The first version of
this entry claimed there was no per-user escalation toggle and that the timeout
sat with an Administrator by oversight. **Both halves were wrong**, and reading
the code rather than the outline is what found it. The entry is kept rather than
deleted because the mistake is instructive: a divergence register that invents
divergences is worse than none, and the first draft was written from a section
heading instead of from `src/`.

|                                        |                                                                                                                                                                                                                                                                                                    |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Chapter 1 says**                     | §1.6: the human-in-the-loop prompt "times out if an Administrator does not respond within a time window **preset by the Root**", and the feature is "toggled on or off by the Administrator for specific agents and by the Root for specific users".                                               |
| **What was built, matching Chapter 1** | **Both escalation axes exist.** The per-agent axis (`agentAsk`) is an Administrator's, and the per-user axis (`policy/user-ask`, `doc.userAsk`) is **Root's**, exactly as §1.6 assigns them. Where both apply, **the stricter of the two wins**, rather than one taking precedence over the other. |
| **What diverges**                      | **Only the timeout.** The installation-wide escalation window (`policy/hitl-timeout`) is set at **Administrator and above**, not Root. Widened from Root on 2026-09-03 at Kinan's direction.                                                                                                       |
| **Explain it in**                      | §"Escalation Routing"                                                                                                                                                                                                                                                                              |

**Why the timeout was widened:** it sits with the other installation-wide policy
settings, the posture and the default ask mode, which are all Administrator, and
the tier that answers an escalation is the tier that should be able to say how
long one waits. Leaving it at Root would have meant an Administrator could be
held to a waiting period they could not adjust for work only they see.

**Why the two axes combine as the stricter rather than by precedence**, which is
worth a paragraph of its own in Chapter 3: precedence would treat one axis as
more authoritative, and neither is. An Administrator's view of an agent's
trustworthiness and Root's view of a person's judgment are independent
statements, and the safe reading of two independent restrictions is to honour
both.

`src/gateway/governance-dashboard-api.ts` carries this reasoning in a comment at
the route itself, which is where it was found.

---

## 2. Still to check

**A full sweep of Chapter 1 §1.6 against the built system has not been done.** It is now a
numbered task: **A14** in `mg/REMAINING-WORK-DASHBOARD-SWEEP.md` §A, added 2026-09-20 at
Kinan's instruction, and it is Claude's to do alone.
The five above were found while reading the chapter for other reasons, which
means there are probably more. Before Chapter 3 is finished, read §1.6
paragraph by paragraph against the code and add what is missing here. Candidates
noticed but not yet verified:

- §1.6 says an Administrator's answer to a prompt "**optionally becomes
  policy**". What was built files a **rule request** that an Administrator
  approves; the answer itself never writes a rule. Close, but the mechanism
  differs and C15 later changed who the request is attributed to.
- §1.6's **Viewer** "can read sanitized audit logs permitted by the Root". Check
  this against the tier's actual read scope, which also includes the rule
  requests queue in full.
- §1.6 describes network allowlisting "at the application layer" dictating which
  IP addresses or domains an agent may contact. Check what the network rule kind
  actually matches against.
- §1.6's RBAC descriptions of each tier should be read line by line against
  `docs-notes/ROLE-MODEL.md`, which is the checked account of what each tier can
  do.

---

## 3. How to use this file

- Chapter 3 sections that owe an explanation carry a `% DIVERGENCE` comment in
  `docs-notes/report/chapter3.tex` pointing here.
- When a new difference is found, add it here **with its justification**, not
  just its existence. The justification is the part that takes thought and the
  part the report needs.
- Chapter 5 can draw on this file too: a difference that was forced rather than
  chosen is future work.
