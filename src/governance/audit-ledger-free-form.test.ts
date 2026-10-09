// T75, decision D, at the ledger's boundary: the second scrubbing pass
// (`src/logging/redact-free-form.ts`, moved there by finding 421 so that OpenClaw's own logs
// use it too) is applied before an entry is sealed.
//
// The pass's own behaviour is tested in `src/logging/redact-free-form.test.ts`. Every test
// there would keep passing if the ledger never called the pass; these drive the production
// writer.
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { appendLedgerEntry, tailLedger, verifyLedgerChain } from "./audit-ledger.js";
import { resetLedgerKeyCacheForTests } from "./ledger-key.js";
import { seedGroupWithAgents } from "./test-group.js";

// Synthetic values only. None of these is a real credential.
const LEAKED_ON_FIXTURE = "QA-GAMMA-SECRET-7731";
const RANDOM_TOKEN = "Zk81qPx7Lm2Vt9Rw4Bn6";

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
