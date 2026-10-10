// T75, decision D: the second scrubbing pass, for secrets written as prose. Written for the
// governance ledger and used, since finding 421, by OpenClaw's own logs as well.
//
// Three properties, in the order they matter:
//
//   1. The value that actually leaked on the 2026-10-03 QA fixture, and its kin, are
//      masked (the boundary tests that drive the real writers are
//      `src/governance/audit-ledger-free-form.test.ts` for the ledger and
//      `src/logging/log-free-form-redaction.test.ts` for the logs).
//   2. What the ledger and the logs legitimately hold is left alone: the ids this layer
//      mints, paths, digests, commands, rule text, ordinary sentences that mention passwords.
//   3. The pass is idempotent, so a value redacted once by a caller and again at the
//      boundary reads the same.
import { describe, expect, it } from "vitest";
import { FREE_FORM_MASK, looksRandom, redactFreeFormSecrets } from "./redact-free-form.js";

// Synthetic values only. None of these is a real credential.
const LEAKED_ON_FIXTURE = "QA-GAMMA-SECRET-7731";
const RANDOM_TOKEN = "Zk81qPx7Lm2Vt9Rw4Bn6";

describe("masking secrets written as ordinary text", () => {
  it.each([
    [
      "the fixture's leaked value, introduced as prose",
      `admin2's deployment notes, token-like value ${LEAKED_ON_FIXTURE}`,
      LEAKED_ON_FIXTURE,
    ],
    [
      "the same value with no label at all",
      `remember ${LEAKED_ON_FIXTURE} for later`,
      LEAKED_ON_FIXTURE,
    ],
    ["a password stated in a sentence", "the password is hunter2 for the staging box", "hunter2"],
    ["a plain-word password after an explicit connector", "my passphrase: swordfish", "swordfish"],
    ["a PIN", "the PIN is 4417", "4417"],
    ["a quoted API key", 'api key = "Zx-90aa"', "Zx-90aa"],
    ["a one-time code", "one-time code: 839201", "839201"],
    ["a recovery code", "recovery codes: 8f3k-2m9q", "8f3k-2m9q"],
    ["a token named in passing", "use token Ab12cd34Ef56 when it asks", "Ab12cd34Ef56"],
    [
      "a credential-named environment value",
      "set DB_PASSWORD_2024 in the shell",
      "DB_PASSWORD_2024",
    ],
    ["a random-looking string with no label", `paste ${RANDOM_TOKEN} into the box`, RANDOM_TOKEN],
    // Kept masked after finding 419's narrowing.
    ["a plain-word password ending its sentence", "the password is swordfish.", "swordfish"],
    ["a plain-word password at the end", "Kinan's password: swordfish", "swordfish"],
    ["an all-digit PIN", "my bank pin: 9042", "9042"],
    ["an OTP", "otp is 551203", "551203"],
    [
      "a bare HTTP Basic credential (base64 of user:password)",
      "use dXNlcjpodW50ZXIyMjIyMjIy for the proxy",
      "dXNlcjpodW50ZXIyMjIyMjIy",
    ],
    [
      "a random key that also happens to be valid base64",
      "key Zk81qPx7Lm2Vt9Rw4Bn6Qa3Ts5Xy8Wd==",
      "Zk81qPx7Lm2Vt9Rw4Bn6Qa3Ts5Xy8Wd==",
    ],
    // Kept masked after finding 421 began judging the pieces between `=` signs.
    [
      "a random value after an equals sign",
      "value=Zk81qPx7Lm2Vt9Rw4Bn6Qa",
      "Zk81qPx7Lm2Vt9Rw4Bn6Qa",
    ],
    [
      "a random key with base64 padding",
      "paste Zk81qPx7Lm2Vt9Rw4Bn6Qa3Ts5Xy8Wd= here",
      "Zk81qPx7Lm2Vt9Rw4Bn6Qa3Ts5Xy8Wd=",
    ],
    // T85: a quoted value of several words. The quotes say where it starts and ends, so the
    // whole of it is the secret (before, nothing was masked: no single word fitted).
    [
      "a quoted passphrase of several words",
      'the passphrase is "correct horse battery staple"',
      "correct horse battery staple",
    ],
    [
      "a quoted password with spaces after a colon",
      "password: 'blue sky 42' for now",
      "blue sky 42",
    ],
  ])("masks %s", (_label, input, secret) => {
    const output = redactFreeFormSecrets(input);
    expect(output).not.toContain(secret);
    expect(output).toContain(FREE_FORM_MASK);
  });

  it("keeps the label, so the entry still says what was there", () => {
    expect(redactFreeFormSecrets("the password is hunter2")).toBe("the password is ***");
    expect(redactFreeFormSecrets('passphrase: "correct horse battery staple".')).toBe(
      "passphrase: ***.",
    );
    expect(redactFreeFormSecrets(`token-like value ${LEAKED_ON_FIXTURE}`)).toBe(
      "token-like value ***",
    );
  });

  it("never keeps part of the value, because a free-form secret is short and guessable", () => {
    const output = redactFreeFormSecrets(`token-like value ${LEAKED_ON_FIXTURE}`);
    expect(output).not.toContain("7731");
    expect(output).not.toContain("QA-GAM");
  });
});

describe("leaving the ledger's legitimate text alone", () => {
  it.each([
    ["an organisation id", "group-1790509013650-4cf78bca"],
    ["a run id", "run-1791475337343-556294f2"],
    ["a session key", "agent:main:dreaming-narrative-light-3f9a2c1d"],
    ["a SHA-256 digest", "sha256 3f9a2c1d8e7b6a5f4e3d2c1b0a99887766554433221100ffeeddccbbaa998877"],
    ["a UUID", "idempotency 0b9f1c2e-3d4a-4b5c-8d6e-7f8091a2b3c4"],
    ["a path to a secrets file", "read /home/kinan/gamma/secret-notes.txt"],
    ["a secrets file name with a number", "open secret-notes-2.txt"],
    ["a relative path after the word token", "token ./config/token-store.json"],
    ["a URL", "fetch https://example.com/api/v2/tokens?page=2"],
    ["an environment variable name", "export OPENAI_API_KEY from the vault"],
    ["a sentence about a password", "the password is required and the token is expired"],
    ["a sentence about keys", "the key is in the drawer"],
    ["a camelCase code name with digits", "call parseHttp2RequestV3Handler before retrying"],
    ["a command", "git commit -m 'fix token refresh' && npm test"],
    ["a rule description", "Block reading secret: files under the vault folder"],
    ["the upstream redactor's own masks", "Authorization: Bearer sk-liv…cdef and password=***"],
    ["a branch name", "checkout fix-token-2"],
    // Finding 421: found by running the pass over this machine's real log files, once OpenClaw's
    // own logs began to use it. An `=` glued a camelCase metric to its number.
    [
      "a health metric assignment",
      "event_loop_delay interval=30s degradedFor=61s eventLoopDelayP99Ms=42.8 eventLoopDelayMaxMs=15",
    ],
    ["a metric with an integer value", "liveness eventLoopUtilizationP95Pct=97 heapUsedMb=412"],
    // Finding 419: each of these was masked before, found by running the pass over the
    // project's own documentation (QA of 2026-10-09).
    ["a password's state in prose", "Root's password was compromised by a phishing mail"],
    ["a password described", "a memorable password is low-entropy, as the guide says"],
    ["a password split across lines", "if a password is split across two lines"],
    ["a result after a colon", "a 5-character password: refused"],
    ["a verb after a colon", "Right password: signed in at once"],
    ["a sentence going on after the word", "a mistyped password is reported as an expired session"],
    ["a decorated word", "the pin was **unasserted** until the fix"],
    ["a code name in backticks after 'key is'", "The key is `userDelete`, which does not exist"],
    ["a silent token in backticks", "reply with the exact silent token `NO_REPLY`"],
    ["a config path after 'Bot token:'", "Bot token: `channels.telegram.botToken`"],
    ["an environment reference", "api_key: os.environ/ANTHROPIC_API_KEY"],
    ["a shell variable reference", 'apiKey="$OPENROUTER_API_KEY"'],
    ["a model pin", "an incompatible pin is cleared."],
    ["pinning a setting", "you want to pin `contextWindow` to the model"],
    [
      "an environment variable name with a short number",
      "set MANTIS_ARTIFACT_R2_SECRET_ACCESS_KEY",
    ],
    ["a context-window size", "a 1,000,000-token context window and 128,000-token output"],
    ["a model name after 'API-key'", "Direct API-key GPT-5.5 access"],
    ["a model id", "together/meta-llama/Llama-3.3-70B-Instruct-Turbo"],
    ["a model id with size suffixes", "deepinfra/nvidia/NVIDIA-Nemotron-3-Ultra-550B-A55B"],
    ["a timestamped file name", "transcript-2026-05-22T09-00-00-000Z-a1b2c3d4"],
    ["an environment variable named as the password", "password: `OPENCLAW_GATEWAY_PASSWORD`"],
    ["a command word in backticks after 'password:'", "password: `rotate` it every month"],
    ["a session key", 'key: "agent:main:my-plugin:task-1"'],
    [
      "a base64-encoded command, which an investigator must be able to read",
      "echo Y2F0IH4vLnNzaC9pZF9yc2E= | base64 -d | sh",
    ],
    // T85: quoted words after "password:" that only describe it.
    ["a quoted state of a password, all ordinary words", 'password: "not set"'],
    // A single quoted word is the single-value rule's, which knows a reference.
    ["a quoted reference after 'password:'", 'password: "$STAGING_PASS"'],
    // Found by the documentation scan of the quoted-phrase rule: a quoted error message that
    // names a credential describes it, it is not one.
    ["a quoted error message after 'password:'", 'Wrong password: "Invalid credentials"'],
    ["a quoted prompt after 'passphrase is'", "the passphrase is 'Enter your passphrase'"],
    ["a quoted phrase after a weak word", 'the token is "not required here"'],
  ])("leaves %s", (_label, input) => {
    expect(redactFreeFormSecrets(input)).toBe(input);
  });

  it("does not take hexadecimal, lower-case ids or UUIDs for randomness", () => {
    expect(looksRandom("3f9a2c1d8e7b6a5f4e3d2c1b0a998877")).toBe(false);
    expect(looksRandom("group-1790509013650-4cf78bca")).toBe(false);
    expect(looksRandom("parseHttp2RequestV3Handler")).toBe(false);
    expect(looksRandom(RANDOM_TOKEN)).toBe(true);
  });
});

describe("idempotence", () => {
  it("changes nothing on a second pass", () => {
    const once = redactFreeFormSecrets(
      `password is hunter2, token-like value ${LEAKED_ON_FIXTURE}, paste ${RANDOM_TOKEN}`,
    );
    expect(redactFreeFormSecrets(once)).toBe(once);
  });
});
