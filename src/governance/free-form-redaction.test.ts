// T75, decision D: the ledger's second scrubbing pass, for secrets written as prose.
//
// Three properties, in the order they matter:
//
//   1. The value that actually leaked on the 2026-10-03 QA fixture, and its kin, are
//      masked before the entry is sealed (the boundary tests at the end drive the real
//      `appendLedgerEntry`, resource and intent both).
//   2. What the ledger legitimately holds is left alone: the ids this layer mints, paths,
//      digests, commands, rule text, ordinary sentences that mention passwords.
//   3. The pass is idempotent, so a value redacted once by a caller and again at the
//      boundary reads the same.
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { appendLedgerEntry, tailLedger, verifyLedgerChain } from "./audit-ledger.js";
import { FREE_FORM_MASK, looksRandom, redactFreeFormSecrets } from "./free-form-redaction.js";
import { resetLedgerKeyCacheForTests } from "./ledger-key.js";
import { seedGroupWithAgents } from "./test-group.js";

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
  ])("masks %s", (_label, input, secret) => {
    const output = redactFreeFormSecrets(input);
    expect(output).not.toContain(secret);
    expect(output).toContain(FREE_FORM_MASK);
  });

  it("keeps the label, so the entry still says what was there", () => {
    expect(redactFreeFormSecrets("the password is hunter2")).toBe("the password is ***");
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

// ---------------------------------------------------------------------------
// The boundary, not just the function: every test above would keep passing if the
// ledger never called the pass. These drive the production writer.
// ---------------------------------------------------------------------------

let dir: string;
let groupId: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "governance-free-form-"));
  process.env.OPENCLAW_GOVERNANCE_DIR = dir;
  resetLedgerKeyCacheForTests();
  groupId = await seedGroupWithAgents(["andrew"]);
});

afterEach(async () => {
  delete process.env.OPENCLAW_GOVERNANCE_DIR;
  resetLedgerKeyCacheForTests();
  await rm(dir, { recursive: true, force: true });
});

describe("the ledger applies the pass before sealing an entry", () => {
  it("masks a free-form secret in the resource", async () => {
    await appendLedgerEntry(groupId, {
      agentId: "andrew",
      toolName: "agent.prompt",
      resourceKind: "administration",
      resource: `prompt via discord: token-like value ${LEAKED_ON_FIXTURE}`,
      ruleId: "-",
      decision: "ungoverned",
    });
    const entry = (await tailLedger(groupId, 5)).find((e) => e.toolName === "agent.prompt");
    expect(entry?.resource).not.toContain(LEAKED_ON_FIXTURE);
    expect(entry?.resource).toContain("token-like value ***");
  });

  it("masks a free-form secret in the model's narration", async () => {
    await appendLedgerEntry(groupId, {
      agentId: "andrew",
      toolName: "read",
      resourceKind: "path",
      resource: "/home/kinan/gamma/secret-notes.txt",
      ruleId: "baseline-allow",
      decision: "allow",
      intent: "The notes say the password is hunter2, so I will use it.",
    });
    const entry = (await tailLedger(groupId, 5)).find((e) => e.toolName === "read");
    expect(entry?.intent).not.toContain("hunter2");
    expect(entry?.resource, "the path itself is not a secret").toBe(
      "/home/kinan/gamma/secret-notes.txt",
    );
  });

  it("keeps the chain verifiable, because the seal covers the masked text", async () => {
    await appendLedgerEntry(groupId, {
      agentId: "andrew",
      toolName: "agent.prompt",
      resourceKind: "administration",
      resource: `paste ${RANDOM_TOKEN}`,
      ruleId: "-",
      decision: "ungoverned",
    });
    const result = await verifyLedgerChain(groupId);
    expect(result.ok).toBe(true);
  });
});
