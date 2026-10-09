# QA session, 2026-10-09: the work of 2026-10-08 and 2026-10-09

**Kinan:** "do a QA on the things you've done the last two days, as thorough as you can."

**Scope:** commits `9e87d0823d3` (finding 417, decisions (ii) and C), `25f1a66482b` (T75's B and D,
finding 418), `f2a2c3ba166` and `4aa2af5a4f4` (documentation), on top of `43e926d7e53`.

**Method, five axes:**

1. Empirical: run the new scrubbing pass over real text and count what it masks.
2. Adversarial: worst-case inputs, bypasses of the classification and the duplicate guard.
3. Structured code review of `43e926d7e53..HEAD`.
4. Live: the dashboard as each tier, for (ii), C and the new ledger entries.
5. Documentation: every claim in the new report items checked against the code and the counts.

## 1. The scrubbing pass against real text (finding 419)

Three corpora, scripts in this session's scratchpad (`qa-scrub-corpus.ts`, `qa-scrub-prose.ts`,
`qa-scrub-lines.ts`):

- **Every QA ledger on this machine** (6 ledgers, 541 resource and intent values): 6 values changed,
  all two genuine fixture secrets (`QA-GAMMA-SECRET-7731`, `QA-EPS-SECRET-4410`). No false positive.
- **The project's documentation** (`docs-notes/`, `mg/`, upstream `docs/`, 802 files): **248 lines
  changed, many of them false positives.** This is the text a ledger actually holds: rule
  descriptions, prompts and narration talk about passwords, keys and tokens in exactly this way.
- **Governance source and the real installation ledger** (262 files, 136,164 lines): mostly test
  passwords, correctly masked.

**Finding 419 (fixed): the second pass masked ordinary prose and identifiers.** Seven classes:

| Class                                     | Example (masked part in brackets)                                                                                                                 | Cause                                                                           |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| A description after a strong word         | "Root's password was [compromised]", "password is [low-entropy]", "password is [split] across", "password: [refused]", "pin was [**unasserted**]" | Any word not on a 50-word list was taken for the password                       |
| A code name in backticks                  | "The key is [`userDelete`]", "silent token [`NO_REPLY`]", "Bot token: [`channels.telegram.botToken`]"                                             | A backtick counted as a quote, and a quoted value as a secret                   |
| A reference to where a secret lives       | "api_key: [os.environ/ANTHROPIC_API_KEY]", `apiKey="[$OPENROUTER_API_KEY]"`, "password: [`OPENCLAW_GATEWAY_PASSWORD`]"                            | No notion of a reference                                                        |
| "PIN" meaning a pin                       | "an incompatible pin is [cleared.]", "pin [`contextWindow`]"                                                                                      | "pin" was a strong word                                                         |
| A quantity before "token"                 | "1,[000-token] context window", "128,[000-token]"                                                                                                 | The credential-name rule took any number of 3+ digits                           |
| A name with a short number                | "[MANTIS_ARTIFACT_R2_SECRET_ACCESS_KEY]"                                                                                                          | Any digit plus upper case counted                                               |
| Model names, timestamps, encoded commands | "Llama-3.[3-70B-Instruct-Turbo]", "[transcript-2026-05-22T09-00-00-000Z-a1b2c3d4]", "echo [Y2F0IH4vLnNzaC9pZF9yc2E=] \| base64 -d"                | The randomness test looked at the whole hyphenated run, and did not know base64 |

The last example is the serious one: masking a base64-encoded command hides an obfuscated
command (`cat ~/.ssh/id_rsa`) from the investigator the ledger exists for.

**Fix** (`src/governance/free-form-redaction.ts`), red first: 21 new "leaves" cases failed, then 23
with two more found on the re-scan; 5 new "masks" cases (a plain-word password ending its
sentence, at the end, an all-digit PIN, an OTP, a random key that is also valid base64) pinned
that the narrowing opened no hole.

- A strong word (password, passphrase, passcode, OTP, one-time/recovery codes) with a connector
  masks a value with a digit, symbol or capital past the first letter; a plain word only when it
  ends its clause and is not an ordinary word, a descriptive English ending (-ed, -ing, -ly, -able,
  -ive, -ous, -ful, -less, -ness, -ment, -tion, -ance, -ence, -ity) or a hyphenated compound.
  Markdown emphasis and closing punctuation are stripped first and the punctuation is kept.
- A weak word (token, key, secret, credential, PIN, API key …) needs a digit: with letters and six
  or more characters after a connector or "value", or four or more digits alone (a PIN); with no
  connector, upper and lower case and digits, eight or more long.
- A backtick no longer counts as a quote. References are never secrets: `$…`, `%…`, `{{…}}`,
  `process.env`, `os.environ`, `--flags`, dotted or slashed name paths with no digit, upper-case
  environment variable names, keys of three or more colon parts.
- The credential-name rule needs the number after the label (`SECRET-7731`, `PASSWORD_2024`).
- The randomness rule judges each piece between hyphens and underscores (a key is one long
  piece), and leaves base64 that decodes to readable text.

**After:** documentation 34 changed lines, every one a real or example secret, a configuration
placeholder in a credential field, or a random-looking id (accepted below); QA ledgers unchanged
(the same two secrets); tests 63/63 in `free-form-redaction.test.ts`.

**Accepted, stated as a limit:** a random-looking identifier (ElevenLabs voice ids such as
`EXAVITQu4vr4xnSDxMaL`, a Google Sheets id in a link) cannot be told from a key by its shape and is
masked. A link whose id is the capability is arguably a secret anyway.

## 2. Adversarial: worst-case timing

`qa-scrub-redos.ts`: eleven inputs shaped to make each rule backtrack ("password is" repeated,
"token" repeated, an endless hyphenated token, a long dense run, unclosed quotes, base64-like runs,
astral characters), at 8,000 and 64,000 characters: **every case under 15 ms at 64,000**, linear.
The pass runs before the 4,096-character clamp, like the upstream redactor, so an agent-supplied
megabyte command costs on the order of 0.2 s at the boundary: noted, not changed.

## 3. Adversarial: classification and the guards

- **The plugin marker cannot be forged from outside.** `client.internal` is built only in-process
  (`server-plugin-runtime-client.ts`, and `sessions-suggestions.ts`, which copies an existing
  client's); nothing reads it from the websocket. A public `agent` request carrying
  `backgroundPromptSource` is either refused by the schema or run without it (gateway test).
- **Finding 420 (fixed): agent-to-agent messages were recorded as a person's.** A sub-agent's
  report, `sessions_send` and agent-step messages carry `inputProvenance: { kind: "inter_session" }`
  and arrive on `INTERNAL_MESSAGE_CHANNEL`, whose value is `"webchat"`, so the entry read "prompt via
  webchat (no governance account): …", the same line as a person typing in OpenClaw's chat. The
  recorder now takes the declared provenance from the agent command and the chat turn
  (`FollowupRun.run.inputProvenance`) and says "declared as a message from another session,
  <source>: written by an agent, not a person", or "declared as a system message" for restart
  recovery. **D19:** the text is kept (an agent's words are governed output like its narration,
  and pass both scrubbing passes); the clause says "declared" because any gateway client can set
  the field, which is also why it labels and never withholds. Two tests, red first.
- **Fingerprint (fixed): the plain SHA-256 was a guessing oracle.** A background prompt is mostly a
  known template, so a reader of the ledger could recover a short secret inside it (a heartbeat
  event "…the password is hunter2") by hashing candidates. Now HMAC-SHA256 under the ledger key with
  a domain tag (`background-prompt.ts`); only a key holder can test a copy. **D20** reverses D13'.
- **Duplicate guard (fixed): check-then-act, and keyed too loosely.** It is now claimed before the
  write with no `await` between check and claim, released if the write fails, and keyed on agent,
  run id and the message's hash, so two different prompts that share a run id (or two tests) do
  not suppress each other.
- **Base64 exemption (fixed): it let HTTP Basic credentials through.** Base64 that decodes to
  `user:password` stays masked.

## 4. Structured code review (`code-review`, extra-high, range `43e926d7e53..HEAD`)

Twelve findings reported. Fixed: the keyed fingerprint, 419, 420, the unregistered-agent warning
(moved to the end of the entry by T75's change, where the ledger's 4,096-character cut removes it
from a long prompt; first again), the Basic-credential exemption, the static-plus-dynamic import of
`host-prompt-audit.js` in four files (`AGENTS.md:289`; now static everywhere), the duplicate guard
leaking between tests and its check-then-act race. Skipped, with reasons:

- `effectivePosture` reads `agentMode` by the id as given, while the same engine normalizes for the
  timeout lookup. Not changed: the host hands over canonical ids, and normalizing here meets
  finding 129's trap (`normalizeAgentId` turns an id with no canonical form into `main`).
- A held question's folder owner is recomputed against the current configuration, so after the
  folder's agent is deleted with "keep" the read is no longer reserved to its owner. Already a stated
  limit (`DOCUMENTATION-UPDATES.md` §3.10).
- Every chat turn now awaits a ledger append before it starts. The cost the agent-command path has
  always paid; accepted.
- Ten entry-point records instead of one owner. D11's reason stands (no single funnel exists: CLI
  backends bypass `runEmbeddedAgent`, fallback models repeat it); the guard test keeps it honest.

Checked and sound: (ii)'s routes refuse an allow from anyone but the owner and Root, live and held;
the card disables the withheld buttons and the inline card has no keyboard shortcuts; C refuses
before deleting and moves after, restricted to the enclosing workspace, never throwing;
organisation deletion records "left in place"; 417's helper is used by all three readers; every
new caller of the recorder handles a rejected turn.

**Mutations for the QA's fixes:** 13 of 13 caught (`scratchpad/mutate-qa.cjs`) after one test was
added: the first run left "a backtick counts as a quote" alive, because no case put a backticked
plain word after a strong word; "password: `rotate` it every month" now does.

## 5. Live (rebuilt `dist`, fixture `scratchpad/qa`, launch entries `qa-mock-openai-10` and `governance-gateway-qa10`)

**Decision (ii).** bea created **Zeta** from the dashboard's _Create agent_ form; OpenClaw put its
folder inside `main`'s workspace (`insideWorkspaceOf: main`). lina (a User holding `main`, which ada
owns) asked `main` to read `zeta/secret.txt`; the question listed `mayAllow` false for lina and ada,
true for bea and Root, "allowedBy": "bea, who owns zeta, or Root". An allow sent straight to the
API as lina and as ada was refused (403, "This asks to read inside zeta's folder, so only bea, who
owns zeta, or Root can allow it. You can deny it."). On lina's page both allow buttons were
disabled (`opacity 0.5`, `cursor: not-allowed`, the upstream disabled style) with that sentence as
tooltip and `aria-description`, Deny enabled, and the line above the card said whose folder it
was. bea's allow was accepted; the reply carried the file; ledger #55 names bea as the answerer and
#56 records the reply by length only.

**Decision C.** As Root, _Delete the agent…_ on Zeta carried the tooltip ("This agent's folder is
inside main's workspace. Deleting it asks whether the folder goes to the trash or stays where main
can read it."); the confirmation said the next step asks about the folder; the folder question
("What happens to the working folder of "Zeta"?") explained both options. **Leave the folder where
it is** (the 2026-10-08 run took "trash"): ledger #61 "its folder inside main's workspace was left
in place, where main can read it", the row notice said the same, and the folder stayed. As the
stated limit says, `main` then read `zeta/secret.txt` without a question (#63).

**T75 and 418 on the new build.** The heartbeat (#38) and the dream diary prompts (#44, #45) are
facts with an `HMAC-SHA256` fingerprint; the dashboard ledger renders them wrapped, with no
horizontal overflow (`scrollWidth` = viewport). Standalone verifier: INTACT, 64 entries,
checkpoint agrees.

**Observation, not a defect of this layer: a dream re-delivers old instructions.** Seconds after
the dream prompts (#44, #45), `main` read `epsilon/secret.txt` twice (#46, #47): the mock model
acted on a fragment quoting an earlier user's "Please read `epsilon/secret.txt` …". A real model
can do the same, which makes memory dreaming a channel by which past instructions are replayed
without anyone asking again. The gate governed both reads (allowed, because `epsilon` is no longer a
configured agent and the file is gone) and both are recorded; the dream entries before them now
explain why the agent acted. Worth a sentence in Chapter 5 (`DOCUMENTATION-UPDATES.md` §7).

**Not driven live:** an agent-to-agent message (finding 420's label; the mock model does not call
`sessions_send`), covered by two tests.

**Operator slips during the run, recorded because they are the reason to read before clicking:**
three times a click used a reference typed from memory instead of the one just returned; two hit
nothing (stale or missing), one landed on a harmless spot; the ledger and the page were checked after
each, and nothing was decided or deleted by them.

## 6. Documentation checked against the code

Every new claim from 2026-10-08/09 in `DOCUMENTATION-UPDATES.md`, `GOVERNANCE.md` (rows 417, 418),
`CHAPTER3-MATERIAL.md` (§3.5.100–3.5.102) and `QA-IN-PLAIN-TERMS.md` (§5.127–5.129) was read
against the code after the fixes. Corrected: the scrubber description for 3.5.3.4 Data
Sanitization (strong and weak words, PIN moved, references, per-piece randomness, the base64
exemption), the fingerprint (HMAC-SHA256 under the ledger key, in 3.5.3.4, 3.5.5 Prompt Execution
Path, the §8 PERMISSION-SPEC item and the design note, where D13' is marked reversed), the test
counts (64 and 23), the duplicate guard's key in row 418. Added: 3.5.5's sentence on agent-to-agent
messages (420), the Chapter 5 observation on dreams replaying instructions, rows 419 and 420,
design note §3.5.103, plain-language §5.130, counts 420 / 420 / 0. Confirmed without change: (ii)'s
and C's descriptions, organisation deletion recording "left in place" (it passes
`deleteFromHost: true` and no folder choice), 417's account.

## 7. Gates after the fixes

- Governance suite, documented command: **3,731 passed / 22 skipped / 0 failed, 239 files**.
- Core and core-test typechecks: 0.
- Full lint gate: the first run failed on one `prefer-array-find` in a test this QA added; fixed;
  re-run: **exit 0**, no errors.
- Build: exit 0, no `INEFFECTIVE_DYNAMIC_IMPORT`.

## Summary

Two new findings, both fixed: **419** (the second scrubbing pass masked ordinary prose,
identifiers and base64-encoded commands) and **420** (agent-to-agent messages recorded as typed
by a person). Six more defects fixed from the code review and the adversarial pass: the
unkeyed fingerprint (a guessing oracle), the unregistered-agent warning cut off by the ledger's
length cap, Basic credentials let through by the base64 exemption, a static-plus-dynamic import
against `AGENTS.md`, and the duplicate guard's race and test leakage. Four review points skipped
with reasons (§4). Decisions (ii) and C, finding 417 and T75's design held up under review and
live. Findings now **420 / 420 / 0**. Nothing committed.
