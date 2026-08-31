// The Root backend switch, driven through the real command tree.
//
// **Why these run at the CLI level.** `codex-backend.test.ts` already asserts
// that `setCodexBackendEnabled` records its actor and writes the plugin entry,
// and it would pass against a command that never checked a tier at all — it
// calls the function directly, with an actor it supplies. The thing worth
// pinning here is the seam above it: that the command **refuses an
// Administrator**, and that the account it authenticated is the account it
// records. That is finding 149's shape, one command over.
//
// **The tier is the decision this control cost the most argument**, and until
// this file nothing on the command line asserted it. The HTTP route's five tier
// tests pin the same rule on the other surface.
//
// Filed under `src/governance/` deliberately, for the reason
// `kill-switch-cli-attribution.test.ts` states: `HANDOFF.md` §4's verification
// set runs `src/governance/` and `src/gateway/governance-*.test.ts`, so a test
// under `src/cli/` would sit outside every command this project uses to check
// itself — finding 148 exactly.
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Command } from "commander";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { registerGovernanceCommands } from "../cli/program/register.governance.js";
import { ADMIN_ACTIONS } from "./admin-audit.js";
import { tailLedger } from "./audit-ledger.js";
import { clearCliSession, storeCliSession } from "./cli-identity.js";
import { CODEX_PLUGIN_ID } from "./codex-backend.js";
import { resetLedgerKeyCacheForTests } from "./ledger-key.js";
import type { GovernanceRole } from "./roles.js";
import { issueSession } from "./session-tokens.js";
import { seedNamedGroup } from "./test-group.js";
import { createUser } from "./user-store.js";

const TEST_GROUP = "group-codex-cli";

let dir: string;
/** The host config the module reads and writes through. */
let fakeConfig: Record<string, unknown>;
let written: Array<Record<string, unknown>>;
/** Everything the command printed, joined, for the warning assertions. */
let printed: string[];

vi.mock("../config/config.js", () => ({
  loadConfig: async () => fakeConfig,
  readConfigFileSnapshot: async () => ({ config: fakeConfig, sourceConfig: fakeConfig }),
  replaceConfigFile: async (params: { nextConfig: Record<string, unknown> }) => {
    written.push(params.nextConfig);
    fakeConfig = params.nextConfig;
  },
}));

vi.mock("../plugins/registry-refresh.js", () => ({
  refreshPluginRegistryAfterConfigMutation: async () => {},
}));

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "governance-codex-cli-"));
  process.env.OPENCLAW_GOVERNANCE_DIR = dir;
  resetLedgerKeyCacheForTests();
  await seedNamedGroup(TEST_GROUP, []);
  fakeConfig = {};
  written = [];
  printed = [];
});

afterEach(async () => {
  await clearCliSession();
  delete process.env.OPENCLAW_GOVERNANCE_DIR;
  resetLedgerKeyCacheForTests();
  vi.restoreAllMocks();
  await rm(dir, { recursive: true, force: true });
});

/**
 * Signs an account of the given tier in, the way `governance login` does.
 *
 * A `user` or a `viewer` must name an Administrator answerable for it, so those
 * two tiers get one created first. Root and Administrator answer to the group.
 */
async function signIn(username: string, role: GovernanceRole): Promise<void> {
  let managedBy: string | undefined;
  if (role === "user" || role === "viewer") {
    const manager = await createUser(
      {
        username: `${username}-manager`,
        password: "correct horse battery",
        role: "administrator",
        groupId: TEST_GROUP,
      },
      "bootstrap",
    );
    managedBy = manager.id;
  }
  const user = await createUser(
    {
      username,
      password: "correct horse battery",
      role,
      groupId: TEST_GROUP,
      ...(managedBy ? { managedBy } : {}),
    },
    "bootstrap",
  );
  const session = await issueSession(user);
  await storeCliSession(session.token);
}

/** Builds the real command tree and runs one `governance …` invocation through it. */
async function runGovernance(args: readonly string[]): Promise<void> {
  const runtime = await import("../runtime.js");
  vi.spyOn(runtime.defaultRuntime, "log").mockImplementation((...parts: unknown[]) => {
    printed.push(parts.map((part) => String(part)).join(" "));
  });
  const program = new Command();
  program.exitOverride();
  registerGovernanceCommands(program);
  await program.parseAsync(["node", "openclaw", "governance", ...args]);
}

/** The plugin entry `setPluginEnabledInConfig` writes, or undefined if untouched. */
function entryEnabled(): boolean | undefined {
  const entries = (fakeConfig as { plugins?: { entries?: Record<string, unknown> } }).plugins
    ?.entries;
  const entry = entries?.[CODEX_PLUGIN_ID];
  return entry && typeof entry === "object"
    ? ((entry as { enabled?: boolean }).enabled ?? undefined)
    : undefined;
}

describe("governance backend set-codex — the Root half, on the command line", () => {
  it("lets Root offer the backend, and records who decided", async () => {
    await signIn("kinan", "root");

    await runGovernance(["backend", "set-codex", "on"]);

    expect(entryEnabled()).toBe(true);
    const entry = (await tailLedger(TEST_GROUP)).find(
      (e) => e.toolName === ADMIN_ACTIONS.codexBackendToggle,
    );
    // The two that matter: an investigation asking "on whose authority did this
    // installation start accepting that gap?" must not have to infer it from a
    // config file's modification time.
    expect(entry?.actor).toBe("kinan");
    expect(entry?.actorRole).toBe("root");
  });

  it("refuses an Administrator, and changes nothing", async () => {
    // The tier is the decision this control cost the most argument. A first pass
    // put it at Administrator to match `policy/mode`; the blast radius settled
    // it, because disabling this backend withdraws the Codex model catalogue and
    // media understanding, not only what the gate can enforce.
    await signIn("malek", "administrator");

    await runGovernance(["backend", "set-codex", "on"]);

    expect(entryEnabled()).toBeUndefined();
    expect(written).toHaveLength(0);
    expect(
      (await tailLedger(TEST_GROUP)).some((e) => e.toolName === ADMIN_ACTIONS.codexBackendToggle),
    ).toBe(false);
  });

  it("refuses a User and a Viewer as well", async () => {
    await signIn("worker", "user");
    await runGovernance(["backend", "set-codex", "on"]);
    expect(written).toHaveLength(0);

    await clearCliSession();
    await signIn("watcher", "viewer");
    await runGovernance(["backend", "set-codex", "on"]);
    expect(written).toHaveLength(0);
  });

  it("warns on the permissive direction and names the second switch", async () => {
    // Enabling here is not sufficient on its own, and an operator who thinks it
    // is will file the per-agent refusal as a bug. The dashboard says the same.
    await signIn("kinan", "root");

    await runGovernance(["backend", "set-codex", "on"]);

    const output = printed.join("\n");
    expect(output).toContain("NOT prevented");
    expect(output).toContain("governance agents set-codex");
    expect(output).toContain("recorded in the ledger");
  });

  it("does not warn on the safe direction", async () => {
    await signIn("kinan", "root");
    await runGovernance(["backend", "set-codex", "on"]);
    printed = [];

    await runGovernance(["backend", "set-codex", "off"]);

    expect(entryEnabled()).toBe(false);
    expect(printed.join("\n")).not.toContain("NOT prevented");
  });

  it("records both ends of the change, including a restatement", async () => {
    // Restatements are recorded on purpose, so the trail can answer "who last
    // confirmed this?" — the same rule `setAgentCodexAllowed` follows.
    await signIn("kinan", "root");

    await runGovernance(["backend", "set-codex", "on"]);
    await runGovernance(["backend", "set-codex", "on"]);

    const entries = (await tailLedger(TEST_GROUP)).filter(
      (e) => e.toolName === ADMIN_ACTIONS.codexBackendToggle,
    );
    expect(entries).toHaveLength(2);
    // `recordAdminAction`'s `target` lands on the ledger entry as `resource`.
    expect(entries[0]?.resource).toContain("disabled -> enabled");
    expect(entries[1]?.resource).toContain("enabled -> enabled");
  });
});

describe("governance backend status", () => {
  it("distinguishes the standing default from a decision", async () => {
    // `explicit` is the whole point of the state shape: "nobody has decided, so
    // the safe answer stands" is a different fact from "an operator turned it
    // off", and an operator auditing an installation needs to tell them apart.
    await signIn("kinan", "root");

    await runGovernance(["backend", "status"]);
    expect(printed.join("\n")).toContain("nobody has decided");

    printed = [];
    await runGovernance(["backend", "set-codex", "off"]);
    printed = [];
    await runGovernance(["backend", "status"]);
    expect(printed.join("\n")).toContain("an operator turned it off");
  });

  it("is Root-only, matching the GET route rather than widening it", async () => {
    // `governance deployment` reads with any signed-in tier while the dashboard
    // shows the same report only to Root. That asymmetry is real and recorded;
    // this command declines to add a second instance of it.
    await signIn("malek", "administrator");

    await runGovernance(["backend", "status"]);

    expect(printed.join("\n")).not.toContain("codex:");
  });
});
