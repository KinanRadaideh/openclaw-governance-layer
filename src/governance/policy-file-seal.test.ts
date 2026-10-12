// T86 D9, option A: an edit to policy.json made outside the governance store is
// detected, recorded in the ledger and raised as an integrity alert. It does not
// prevent: the file as found is used. Decisions E15-E23, mg/WORK-LOG-2026-10-12.md.
import { copyFile, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  POLICY_FILE_ALERT_ACTION,
  resetLedgerCursorForTests,
  verifyLedgerChain,
  type LedgerEntry,
} from "./audit-ledger.js";
import { ledgerIntegrityChecks } from "./deployment-ledger-integrity.js";
import {
  acknowledgeLedgerAlert,
  resetLedgerAlertIndexForTests,
  unacknowledgedLedgerAlerts,
} from "./ledger-alerts.js";
import { resetLedgerKeyCacheForTests } from "./ledger-key.js";
import { projectLedgerForActor } from "./ledger-view.js";
import { ledgerFilePath, ledgerKeyFilePath } from "./paths.js";
import {
  policyFileStillAsFound,
  readSealedPolicyFile,
  resetPolicySealStateForTests,
  type PolicyFileFinding,
} from "./policy-seal.js";
import {
  addRule,
  loadPolicy,
  lockAgent,
  policyFilePathForTests,
  setMode,
  updatePolicy,
} from "./policy-store.js";
import { seedGroupWithAgents } from "./test-group.js";

let dir: string;
let GROUP: string;
const ROOT = { name: "rooty", role: "root" as const };
const ADA = { name: "ada", role: "administrator" as const };

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "governance-policy-seal-"));
  process.env.OPENCLAW_GOVERNANCE_DIR = dir;
  GROUP = await seedGroupWithAgents(["agent-a"]);
  resetLedgerKeyCacheForTests();
  resetLedgerCursorForTests();
  resetLedgerAlertIndexForTests();
  resetPolicySealStateForTests();
});

afterEach(async () => {
  delete process.env.OPENCLAW_GOVERNANCE_DIR;
  resetLedgerKeyCacheForTests();
  resetLedgerCursorForTests();
  resetLedgerAlertIndexForTests();
  resetPolicySealStateForTests();
  await rm(dir, { recursive: true, force: true });
});

/** A process restart, as far as governance's memory goes. */
function restart(): void {
  resetLedgerKeyCacheForTests();
  resetLedgerCursorForTests();
  resetLedgerAlertIndexForTests();
  resetPolicySealStateForTests();
}

type StoredPolicy = Record<string, unknown> & {
  rules: Array<Record<string, unknown>>;
  seal?: { generation: number; mac: string };
};

async function readStored(): Promise<StoredPolicy> {
  return JSON.parse(await readFile(policyFilePathForTests(GROUP), "utf8")) as StoredPolicy;
}

/** What an agent with an interpreter rule can do: rewrite the file directly. */
async function editBehindTheStore(edit: (doc: StoredPolicy) => void): Promise<void> {
  const doc = await readStored();
  edit(doc);
  await writeFile(policyFilePathForTests(GROUP), JSON.stringify(doc, null, 2));
}

const SNEAKED_RULE = {
  id: "sneaked",
  effect: "allow",
  resourceKind: "command",
  pattern: "^curl .*$",
  description: "added by the agent itself",
  tier: "admin",
  createdAt: "2026-10-12T00:00:00.000Z",
};

async function policyAlerts() {
  return (await unacknowledgedLedgerAlerts(GROUP)).filter(
    (alert) => alert.action === POLICY_FILE_ALERT_ACTION,
  );
}

async function ledger(): Promise<LedgerEntry[]> {
  try {
    return (await readFile(ledgerFilePath(GROUP), "utf8"))
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line) as LedgerEntry);
  } catch {
    return [];
  }
}

/**
 * Store writes, so the file exists and is sealed. Twice: the fixture hands back an
 * installation with no key, the store never creates one (the ledger does, on the first
 * entry), so the first write is unsealed and the second is sealed.
 */
async function storeWrite(): Promise<void> {
  await setMode(GROUP, "enforce", ADA);
  await setMode(GROUP, "enforce", ADA);
}

describe("the store seals what it writes", () => {
  it("writes a seal into policy.json and never hands it to a caller", async () => {
    await storeWrite();
    const stored = await readStored();
    expect(stored.seal?.generation).toBeGreaterThan(0);
    expect(stored.seal?.mac).toMatch(/^[0-9a-f]{64}$/);
    expect(await loadPolicy(GROUP)).not.toHaveProperty("seal");
  });

  it("raises nothing for the store's own writes, however many loads follow", async () => {
    await storeWrite();
    await addRule(
      GROUP,
      { effect: "allow", resourceKind: "command", pattern: "^date$", description: "the date" },
      ADA,
    );
    for (let i = 0; i < 5; i += 1) {
      await loadPolicy(GROUP);
    }
    restart();
    await loadPolicy(GROUP);
    expect(await policyAlerts()).toEqual([]);
  });

  it("raises nothing on a fresh installation that has no policy file yet", async () => {
    await rm(policyFilePathForTests(GROUP), { force: true });
    await loadPolicy(GROUP);
    await storeWrite();
    await loadPolicy(GROUP);
    expect(await policyAlerts()).toEqual([]);
  });
});

describe("an edit made outside the store (T86 D9)", () => {
  it("is recorded in the ledger and raised as an integrity alert", async () => {
    await storeWrite();
    await editBehindTheStore((doc) => {
      doc.rules.push(SNEAKED_RULE);
    });
    await loadPolicy(GROUP);
    const alerts = await policyAlerts();
    expect(alerts).toHaveLength(1);
    expect(alerts[0]?.summary).toMatch(/changed outside the governance store/);
    expect(alerts[0]?.subject).toMatch(/^policy-file:edited:[0-9a-f]{16}$/);
    const entry = (await ledger()).find((item) => item.toolName === POLICY_FILE_ALERT_ACTION);
    expect(entry).toMatchObject({ entryKind: "admin", actor: "ledger-integrity", keyed: true });
    expect(entry?.agentId).toBe("-");
  });

  it("does not prevent: the file as found is in use", async () => {
    await storeWrite();
    await editBehindTheStore((doc) => {
      doc.rules.push(SNEAKED_RULE);
    });
    const loaded = await loadPolicy(GROUP);
    expect(loaded.rules.some((rule) => rule.id === "sneaked")).toBe(true);
  });

  it("raises one alert per change, not one per load, and not again after a restart", async () => {
    await storeWrite();
    await editBehindTheStore((doc) => {
      doc.rules.push(SNEAKED_RULE);
    });
    await Promise.all(Array.from({ length: 8 }, () => loadPolicy(GROUP)));
    for (let i = 0; i < 3; i += 1) {
      await loadPolicy(GROUP);
    }
    restart();
    await loadPolicy(GROUP);
    expect(await policyAlerts()).toHaveLength(1);
    // Sealed as found, so the next load is clean.
    expect((await readStored()).rules.some((rule) => rule.id === "sneaked")).toBe(true);
  });

  it("raises a second alert for a second, different edit", async () => {
    await storeWrite();
    await editBehindTheStore((doc) => {
      doc.rules.push(SNEAKED_RULE);
    });
    await loadPolicy(GROUP);
    await editBehindTheStore((doc) => {
      doc.mode = "monitor";
    });
    await loadPolicy(GROUP);
    expect(await policyAlerts()).toHaveLength(2);
  });

  it("is caught when the edit reaches the store's own read-modify-write first", async () => {
    await storeWrite();
    await editBehindTheStore((doc) => {
      doc.rules.push(SNEAKED_RULE);
    });
    await updatePolicy(GROUP, (doc) => {
      doc.hitlTimeoutSeconds = 120;
    });
    expect(await policyAlerts()).toHaveLength(1);
    await loadPolicy(GROUP);
    expect(await policyAlerts()).toHaveLength(1);
  });

  it("catches a seal that was deleted", async () => {
    await storeWrite();
    await editBehindTheStore((doc) => {
      delete doc.seal;
      doc.rules.push(SNEAKED_RULE);
    });
    await loadPolicy(GROUP);
    const alerts = await policyAlerts();
    expect(alerts).toHaveLength(1);
    expect(alerts[0]?.subject).toMatch(/^policy-file:unsealed:/);
  });

  it("catches an older document version with the seal deleted (no downgrade bypass)", async () => {
    await storeWrite();
    await editBehindTheStore((doc) => {
      delete doc.seal;
      doc.version = 1;
      doc.rules.push(SNEAKED_RULE);
    });
    restart();
    await loadPolicy(GROUP);
    expect(await policyAlerts()).toHaveLength(1);
  });

  it("raises one alert, worded for it, the first time a file written before seals is loaded", async () => {
    await storeWrite();
    await editBehindTheStore((doc) => {
      delete doc.seal;
    });
    restart();
    await loadPolicy(GROUP);
    await loadPolicy(GROUP);
    restart();
    await loadPolicy(GROUP);
    const alerts = await policyAlerts();
    expect(alerts).toHaveLength(1);
    expect(alerts[0]?.summary).toMatch(/once, after upgrading/);
    expect((await readStored()).seal).toBeDefined();
  });

  it("catches an earlier copy of the file put back", async () => {
    await storeWrite();
    const copy = join(dir, "policy-copy.json");
    await copyFile(policyFilePathForTests(GROUP), copy);
    await addRule(
      GROUP,
      { effect: "deny", resourceKind: "command", pattern: "^curl .*$", description: "no curl" },
      ADA,
    );
    await loadPolicy(GROUP);
    await copyFile(copy, policyFilePathForTests(GROUP));
    const loaded = await loadPolicy(GROUP);
    expect(loaded.rules.some((rule) => rule.description === "no curl")).toBe(false);
    const alerts = await policyAlerts();
    expect(alerts).toHaveLength(1);
    expect(alerts[0]?.subject).toMatch(/^policy-file:earlier-copy:/);
  });

  it("catches the file being deleted while the Gateway runs", async () => {
    await storeWrite();
    await loadPolicy(GROUP);
    await rm(policyFilePathForTests(GROUP));
    await loadPolicy(GROUP);
    await loadPolicy(GROUP);
    const alerts = await policyAlerts();
    expect(alerts).toHaveLength(1);
    expect(alerts[0]?.subject).toMatch(/^policy-file:removed/);
    expect(alerts[0]?.summary).toMatch(/deleted/);
  });

  it("checks nothing, and creates no key, when the installation has no ledger key", async () => {
    await storeWrite();
    await rm(ledgerKeyFilePath());
    await rm(ledgerFilePath(GROUP), { force: true });
    restart();
    await editBehindTheStore((doc) => {
      doc.rules.push(SNEAKED_RULE);
    });
    await loadPolicy(GROUP);
    await expect(stat(ledgerKeyFilePath())).rejects.toMatchObject({ code: "ENOENT" });
    expect(await ledger()).toEqual([]);
  });

  it("is Root's to acknowledge, and is not a break in the chain", async () => {
    await storeWrite();
    await editBehindTheStore((doc) => {
      doc.rules.push(SNEAKED_RULE);
    });
    await loadPolicy(GROUP);
    const [alert] = await policyAlerts();
    const verified = await verifyLedgerChain(GROUP);
    expect(verified.ok).toBe(true);
    expect(verified.alerts ?? []).toEqual([]);
    await acknowledgeLedgerAlert(GROUP, {
      seq: alert?.seq ?? -1,
      reason: "Kinan edited the file by hand to test the alert",
      actor: ROOT,
    });
    expect(await policyAlerts()).toEqual([]);
  });

  it("fails the deployment report's alert row, saying what the alert is about", async () => {
    await storeWrite();
    await editBehindTheStore((doc) => {
      doc.rules.push(SNEAKED_RULE);
    });
    await loadPolicy(GROUP);
    const rows = await ledgerIntegrityChecks(GROUP, process.platform, true);
    const alertRow = rows.find((row) => row.id === "deployment.ledger_alerts");
    expect(alertRow?.status).toBe("fail");
    expect(alertRow?.detail).toMatch(/policy file was changed outside the governance store/);
    expect(alertRow?.detail).not.toMatch(/rewritten in, the audit ledger/);
  });

  it("is hidden from Users and Viewers, like the ledger's own alerts", async () => {
    await storeWrite();
    await editBehindTheStore((doc) => {
      doc.rules.push(SNEAKED_RULE);
    });
    await loadPolicy(GROUP);
    const entries = await ledger();
    const forUser = projectLedgerForActor(entries, {
      username: "u",
      role: "user",
      assignedAgents: ["agent-a"],
    });
    const forAdmin = projectLedgerForActor(entries, {
      username: "a",
      role: "administrator",
      assignedAgents: [],
    });
    expect(forUser.some((entry) => entry.toolName === POLICY_FILE_ALERT_ACTION)).toBe(false);
    expect(forAdmin.some((entry) => entry.toolName === POLICY_FILE_ALERT_ACTION)).toBe(true);
  });

  it("catches an earlier copy put back straight after a write, before any load", async () => {
    await storeWrite();
    const copy = join(dir, "policy-copy.json");
    await copyFile(policyFilePathForTests(GROUP), copy);
    await setMode(GROUP, "monitor", ADA);
    await copyFile(copy, policyFilePathForTests(GROUP));
    await loadPolicy(GROUP);
    expect((await policyAlerts())[0]?.subject).toMatch(/^policy-file:earlier-copy:/);
  });

  it("catches an earlier copy whose counter was raised by hand, as an edit", async () => {
    await storeWrite();
    const copy = join(dir, "policy-copy.json");
    await copyFile(policyFilePathForTests(GROUP), copy);
    await setMode(GROUP, "monitor", ADA);
    const old = JSON.parse(await readFile(copy, "utf8")) as StoredPolicy;
    if (old.seal) {
      old.seal.generation += 100;
    }
    await writeFile(policyFilePathForTests(GROUP), JSON.stringify(old, null, 2));
    await loadPolicy(GROUP);
    expect((await policyAlerts())[0]?.subject).toMatch(/^policy-file:edited:/);
  });

  it("catches another organisation's sealed policy file copied in", async () => {
    await storeWrite();
    const other = await seedGroupWithAgents(["agent-b"]);
    resetPolicySealStateForTests();
    await storeWrite();
    for (let i = 0; i < 5; i += 1) {
      await setMode(other, i % 2 === 0 ? "monitor" : "enforce", ADA);
    }
    await copyFile(policyFilePathForTests(other), policyFilePathForTests(GROUP));
    await loadPolicy(GROUP);
    expect((await policyAlerts())[0]?.subject).toMatch(/^policy-file:edited:/);
  });

  it("does not seal a finding over a store write that came after it", async () => {
    await storeWrite();
    await editBehindTheStore((doc) => {
      doc.rules.push(SNEAKED_RULE);
    });
    const { finding } = await readSealedPolicyFile(GROUP);
    expect(finding?.kind).toBe("edited");
    await setMode(GROUP, "monitor", ADA);
    expect(await policyFileStillAsFound(GROUP, finding as PolicyFileFinding)).toBe(false);
  });

  it("raises nothing for a file the store wrote before the installation had a key", async () => {
    await rm(policyFilePathForTests(GROUP), { force: true });
    await updatePolicy(GROUP, (doc) => {
      doc.hitlTimeoutSeconds = 90;
    });
    expect((await readStored()).seal).toBeUndefined();
    await setMode(GROUP, "monitor", ADA); // the ledger's first entry creates the key
    await loadPolicy(GROUP);
    expect(await policyAlerts()).toEqual([]);
  });

  it("still lets the kill switch write when the ledger key is unusable", async () => {
    await storeWrite();
    process.env.OPENCLAW_GOVERNANCE_LEDGER_KEY = "x";
    restart();
    try {
      await lockAgent(GROUP, "agent-a");
      expect((await loadPolicy(GROUP)).lockedAgents).toContain("agent-a");
    } finally {
      delete process.env.OPENCLAW_GOVERNANCE_LEDGER_KEY;
      restart();
    }
  });

  it("raises no false alarm while loads race the store's own writes", async () => {
    await storeWrite();
    const writes = Array.from({ length: 12 }, (_, i) =>
      updatePolicy(GROUP, (doc) => {
        doc.hitlTimeoutSeconds = 60 + i;
      }),
    );
    const loads = Array.from({ length: 40 }, () => loadPolicy(GROUP));
    await Promise.all([...writes, ...loads]);
    expect(await policyAlerts()).toEqual([]);
  });
});
