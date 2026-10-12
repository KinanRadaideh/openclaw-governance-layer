// T86 D9: a store write that finishes while a load is reading the policy file must not
// make that load mistake the file it read for an earlier copy put back. The window is too
// narrow to hit by racing real calls, so the read is held open here while the write lands.
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

let duringNextRead: (() => Promise<void>) | undefined;

vi.mock("../infra/json-files.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../infra/json-files.js")>();
  return {
    ...actual,
    readJsonIfExists: async (...args: Parameters<typeof actual.readJsonIfExists>) => {
      const value = await actual.readJsonIfExists(...args);
      const hook = duringNextRead;
      duringNextRead = undefined;
      if (hook) {
        await hook();
      }
      return value;
    },
  };
});

const { resetLedgerCursorForTests } = await import("./audit-ledger.js");
const { resetLedgerAlertIndexForTests, unacknowledgedLedgerAlerts } =
  await import("./ledger-alerts.js");
const { resetLedgerKeyCacheForTests } = await import("./ledger-key.js");
const { resetPolicySealStateForTests } = await import("./policy-seal.js");
const { loadPolicy, setMode } = await import("./policy-store.js");
const { seedGroupWithAgents } = await import("./test-group.js");

let dir: string;
let GROUP: string;
const ADA = { name: "ada", role: "administrator" as const };

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "governance-policy-seal-race-"));
  process.env.OPENCLAW_GOVERNANCE_DIR = dir;
  GROUP = await seedGroupWithAgents(["agent-a"]);
  resetLedgerKeyCacheForTests();
  resetLedgerCursorForTests();
  resetLedgerAlertIndexForTests();
  resetPolicySealStateForTests();
});

afterEach(async () => {
  duringNextRead = undefined;
  delete process.env.OPENCLAW_GOVERNANCE_DIR;
  resetLedgerKeyCacheForTests();
  resetLedgerCursorForTests();
  resetLedgerAlertIndexForTests();
  resetPolicySealStateForTests();
  await rm(dir, { recursive: true, force: true });
});

it("raises no alarm when a store write lands while a load is reading the file", async () => {
  // Two writes: the first comes before the ledger has a key, the second is sealed.
  await setMode(GROUP, "enforce", ADA);
  await setMode(GROUP, "enforce", ADA);
  await loadPolicy(GROUP);
  duringNextRead = async () => {
    await setMode(GROUP, "monitor", ADA);
  };
  await loadPolicy(GROUP);
  expect(duringNextRead).toBeUndefined();
  expect(await unacknowledgedLedgerAlerts(GROUP)).toEqual([]);
});
