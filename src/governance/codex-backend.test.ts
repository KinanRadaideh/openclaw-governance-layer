// "Enable use of Codex?" — the stance, and the record of who set it.
//
// The control exists because T7's prevention half cannot run on that backend
// (§3.5.61). Turning it on is an operator accepting a stated enforcement gap,
// so the two things worth testing are that the stance is **off until somebody
// decides**, and that deciding is **attributed and recorded**. A toggle that
// silently defaulted to permissive, or that changed the installation without
// naming who did it, would be worse than no toggle: it would look like consent
// while being none.
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ADMIN_ACTIONS } from "./admin-audit.js";
import { tailLedger } from "./audit-ledger.js";
import { CODEX_PLUGIN_ID, readCodexBackendState, setCodexBackendEnabled } from "./codex-backend.js";
import { resetLedgerKeyCacheForTests } from "./ledger-key.js";
import { seedGroupWithAgents } from "./test-group.js";

let dir: string;
let TEST_GROUP: string;

/** The host config the module reads and writes through. */
let fakeConfig: Record<string, unknown>;
let written: Array<Record<string, unknown>>;
let refreshed: string[][];
/** Set to make the next config write fail, for the record-before-write test. */
let failNextWrite: Error | undefined;

vi.mock("../config/config.js", () => ({
  // Synchronous, matching the real `loadConfig` — see finding 221.
  loadConfig: () => fakeConfig,
  readConfigFileSnapshot: async () => ({ config: fakeConfig, sourceConfig: fakeConfig }),
  replaceConfigFile: async (params: { nextConfig: Record<string, unknown> }) => {
    if (failNextWrite) {
      const error = failNextWrite;
      failNextWrite = undefined;
      throw error;
    }
    written.push(params.nextConfig);
    fakeConfig = params.nextConfig;
  },
}));

vi.mock("../plugins/registry-refresh.js", () => ({
  refreshPluginRegistryAfterConfigMutation: async (params: { policyPluginIds: string[] }) => {
    refreshed.push(params.policyPluginIds);
  },
}));

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "governance-codex-backend-"));
  process.env.OPENCLAW_GOVERNANCE_DIR = dir;
  resetLedgerKeyCacheForTests();
  TEST_GROUP = await seedGroupWithAgents([]);
  fakeConfig = {};
  written = [];
  refreshed = [];
  failNextWrite = undefined;
});

afterEach(async () => {
  delete process.env.OPENCLAW_GOVERNANCE_DIR;
  resetLedgerKeyCacheForTests();
  await rm(dir, { recursive: true, force: true });
});

describe("the stance", () => {
  it("is off, and marked as nobody's decision, when no entry exists", async () => {
    const state = await readCodexBackendState();
    // `explicit: false` is the part that matters. It lets the dashboard say
    // "off by default, nobody has decided" rather than implying somebody
    // weighed this and chose the safe answer.
    expect(state).toEqual({ enabled: false, explicit: false });
  });

  it("reports an explicit off differently from a default off", async () => {
    fakeConfig = { plugins: { entries: { [CODEX_PLUGIN_ID]: { enabled: false } } } };
    expect(await readCodexBackendState()).toEqual({ enabled: false, explicit: true });
  });

  it("reports on when an operator turned it on", async () => {
    fakeConfig = { plugins: { entries: { [CODEX_PLUGIN_ID]: { enabled: true } } } };
    expect(await readCodexBackendState()).toEqual({ enabled: true, explicit: true });
  });

  it("ignores a non-boolean entry rather than guessing what it meant", async () => {
    fakeConfig = { plugins: { entries: { [CODEX_PLUGIN_ID]: { enabled: "yes" } } } };
    // A malformed value is not consent. Falling back to the safe default is the
    // only reading that cannot turn a typo into an accepted enforcement gap.
    expect(await readCodexBackendState()).toEqual({ enabled: false, explicit: false });
  });
});

describe("changing the stance", () => {
  it("writes the plugin entry the host's own toggle writes", async () => {
    await setCodexBackendEnabled(TEST_GROUP, true, { name: "malek", role: "administrator" });
    expect(written).toHaveLength(1);
    const entries = (
      written[0] as { plugins?: { entries?: Record<string, { enabled?: boolean }> } }
    ).plugins?.entries;
    // Deliberately the same key `openclaw plugins enable` uses, so the dashboard
    // and the command line change one thing rather than two that can disagree.
    expect(entries?.[CODEX_PLUGIN_ID]?.enabled).toBe(true);
    expect(await readCodexBackendState()).toEqual({ enabled: true, explicit: true });
  });

  it("refreshes the plugin registry so the change takes effect without a restart", async () => {
    await setCodexBackendEnabled(TEST_GROUP, true, { name: "malek", role: "administrator" });
    expect(refreshed).toEqual([[CODEX_PLUGIN_ID]]);
  });

  it("turns it back off again", async () => {
    await setCodexBackendEnabled(TEST_GROUP, true, { name: "malek", role: "administrator" });
    await setCodexBackendEnabled(TEST_GROUP, false, { name: "malek", role: "administrator" });
    expect(await readCodexBackendState()).toEqual({ enabled: false, explicit: true });
  });
});

describe("what the ledger says about it", () => {
  it("records the change against the account and the tier held at the time", async () => {
    await setCodexBackendEnabled(TEST_GROUP, true, { name: "malek", role: "administrator" });
    const entry = (await tailLedger(TEST_GROUP)).find(
      (e) => e.toolName === ADMIN_ACTIONS.codexBackendToggle,
    );
    expect(entry).toBeDefined();
    expect(entry?.actor).toBe("malek");
    expect(entry?.actorRole).toBe("administrator");
    expect(entry?.entryKind).toBe("admin");
  });

  it("names both ends of the change, so the trail reads as a transition", async () => {
    await setCodexBackendEnabled(TEST_GROUP, true, { name: "malek", role: "administrator" });
    const entry = (await tailLedger(TEST_GROUP)).find(
      (e) => e.toolName === ADMIN_ACTIONS.codexBackendToggle,
    );
    // `setMode` records "posture X -> Y" for the same reason: an entry saying
    // only the new value cannot answer "was this a change or a restatement?"
    expect(entry?.resource).toContain("disabled -> enabled");
  });

  it("records before it writes, so a failed change still leaves a trail", async () => {
    // The rule `registerAgent` established and M6 generalised. A change that
    // fails part-way through is exactly the event an investigation wants, and
    // recording only success hides it.
    failNextWrite = new Error("config is read-only");

    await expect(
      setCodexBackendEnabled(TEST_GROUP, true, { name: "malek", role: "administrator" }),
    ).rejects.toThrow("config is read-only");

    const entry = (await tailLedger(TEST_GROUP)).find(
      (e) => e.toolName === ADMIN_ACTIONS.codexBackendToggleRequest,
    );
    expect(entry).toBeDefined();
    expect(entry?.actor).toBe("malek");
  });

  it("does not claim the change happened when the write failed (finding 217)", async () => {
    // **This test is the one the assertion above was missing.** It proved an
    // entry existed and never asked what it said — and what it said was
    // `codex backend disabled -> enabled`, in the tamper-evident trail, for an
    // installation whose backend was still disabled. `replaceConfigFile` takes
    // a base hash and throws when the config moved underneath, so this is a
    // reachable state rather than a hypothetical one.
    failNextWrite = new Error("config is read-only");
    await expect(
      setCodexBackendEnabled(TEST_GROUP, true, { name: "malek", role: "administrator" }),
    ).rejects.toThrow("config is read-only");

    const entries = await tailLedger(TEST_GROUP);
    // The request is recorded, and reads as a request.
    const requested = entries.filter((e) => e.toolName === ADMIN_ACTIONS.codexBackendToggleRequest);
    expect(requested).toHaveLength(1);
    expect(requested[0]?.resource).toContain("requested");
    // And nothing asserts the stance changed, because it did not.
    expect(entries.filter((e) => e.toolName === ADMIN_ACTIONS.codexBackendToggle)).toHaveLength(0);
    expect(await readCodexBackendState()).toEqual({ enabled: false, explicit: false });
  });

  it("records the completion separately once the config holds the new stance", async () => {
    await setCodexBackendEnabled(TEST_GROUP, true, { name: "malek", role: "administrator" });
    const entries = await tailLedger(TEST_GROUP);
    // Both halves, so an investigation can tell "who asked" from "and it took"
    // — the pair `organisationDeleteRequest` / `organisationDelete` already
    // uses for the same reason.
    expect(
      entries.filter((e) => e.toolName === ADMIN_ACTIONS.codexBackendToggleRequest),
    ).toHaveLength(1);
    const done = entries.filter((e) => e.toolName === ADMIN_ACTIONS.codexBackendToggle);
    expect(done).toHaveLength(1);
    expect(done[0]?.resource).toContain("disabled -> enabled");
    expect(done[0]?.resource).not.toContain("requested");
  });
});
