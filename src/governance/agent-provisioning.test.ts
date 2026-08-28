// M6 — provisioning: the first time this layer writes to the host it governs.
//
// The properties worth pinning, and why each is here rather than assumed:
//
//   1. **It is one act or none.** A provision that creates the agent and then
//      fails to record it must leave nothing behind. This is the only place in
//      the project where a failure can strand a *running* thing, so the
//      rollback is tested by making the second write fail on purpose.
//   2. **A rollback that fails is reported, not swallowed.** The operator is
//      the only one who can fix a stranded agent, so the result has to say so.
//   3. **Provision refuses an id the host already has.** This is the register/
//      provision distinction, and it is what makes (1) safe: if provisioning
//      could adopt an existing agent, rolling back would delete somebody
//      else's. The test asserts the refusal *and* that nothing was deleted.
//   4. **The green tick waits for the fact it claims.** Reporting success
//      before the host has picked the agent up would make the tick mean "the
//      file was written". This project has already shipped one green tick for a
//      defence that was not there (M5's deployment check) and treats the class
//      as its worst bug.
//   5. **A failed provision is still in the ledger.** Recorded before the
//      attempt, so the trail can answer "who kept trying to create agents?"
//   6. **Removal keeps M4's meaning.** `deleteFromHost: false` must behave
//      exactly as unregistration always has, or an operator who relied on it
//      would start destroying agents with a button that used to be safe.
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const createAgentMock = vi.hoisted(() => vi.fn());
const deleteAgentConfigEntryMock = vi.hoisted(() => vi.fn());
const loadConfigMock = vi.hoisted(() => vi.fn());

// The three host seams this module composes. Mocked rather than exercised
// because the host's own suites already cover them, and because a governance
// test that really wrote `openclaw.json` would be testing the wrong repository.
vi.mock("../agents/agent-create.js", () => ({ createAgent: createAgentMock }));
vi.mock("../gateway/server-methods/agents-config-mutations.js", () => ({
  deleteAgentConfigEntry: deleteAgentConfigEntryMock,
}));
vi.mock("../config/config.js", () => ({ loadConfig: loadConfigMock }));

import { ADMIN_ACTIONS } from "./admin-audit.js";
import { resolveAgentGroup } from "./agent-group.js";
import { deprovisionAgent, provisionAgent } from "./agent-provisioning.js";
import { assignAgentsToAccount, findAgent, registerAgent } from "./agent-registry.js";
import { tailLedger } from "./audit-ledger.js";
import { resetLedgerKeyCacheForTests } from "./ledger-key.js";
import { savePolicy } from "./policy-store.js";
import { defaultPolicyDocument } from "./policy-types.js";
import { seedGroupWithAgents } from "./test-group.js";
import { newGroupId } from "./user-store.js";
import { createUser, listUsers } from "./user-store.js";

const PASSWORD = "correct-horse-battery";
const ACTOR = { name: "admin", role: "administrator" as const };

let dir: string;
let groupId: string;
let adminId: string;

/** Sets what the host's roster currently contains. */
function hostRoster(ids: readonly string[]): void {
  loadConfigMock.mockResolvedValue({
    agents: { entries: Object.fromEntries(ids.map((id) => [id, {}])) },
  });
}

/** The host accepting a creation. */
function hostCreates(agentId: string): void {
  createAgentMock.mockResolvedValue({
    status: "created",
    agentId,
    name: agentId,
    workspace: `/tmp/${agentId}`,
    agentDir: `/tmp/${agentId}/.agent`,
    bootstrapPending: false,
  });
}

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "governance-provisioning-"));
  process.env.OPENCLAW_GOVERNANCE_DIR = dir;
  groupId = await seedGroupWithAgents([]);
  resetLedgerKeyCacheForTests();
  await savePolicy(groupId, { ...defaultPolicyDocument(), mode: "enforce" });
  const admin = await createUser(
    { username: "prov-admin", password: PASSWORD, role: "administrator", groupId },
    "bootstrap",
  );
  adminId = admin.id;
  createAgentMock.mockReset();
  deleteAgentConfigEntryMock.mockReset();
  loadConfigMock.mockReset();
  deleteAgentConfigEntryMock.mockResolvedValue({ nextConfig: {}, result: undefined });
  hostRoster([]);
});

afterEach(async () => {
  delete process.env.OPENCLAW_GOVERNANCE_DIR;
  resetLedgerKeyCacheForTests();
  await rm(dir, { recursive: true, force: true });
});

describe("provisionAgent", () => {
  it("creates the agent on the host and records it here, as one act", async () => {
    hostCreates("scout");
    const result = await provisionAgent({ displayName: "Scout", groupId, adminId }, ACTOR, {
      hostSeesAgent: () => true,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.agentId).toBe("scout");
    expect(result.confirmed).toBe(true);
    expect(result.warning).toBeUndefined();
    expect(createAgentMock).toHaveBeenCalledTimes(1);
    // The governance record exists and carries the group and owner the caller
    // was allowed to name, not any the request could have supplied.
    const recorded = await findAgent("scout");
    expect(recorded?.groupId).toBe(groupId);
    expect(recorded?.adminId).toBe(adminId);
  });

  it("refuses an id the host already has, and deletes nothing", async () => {
    // The register/provision distinction, and the invariant that makes rollback
    // safe. If this refusal ever became an adoption, a later failure would
    // delete an agent this call did not create.
    hostRoster(["existing"]);
    const result = await provisionAgent(
      { displayName: "Existing", agentId: "existing", groupId, adminId },
      ACTOR,
    );

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.stage).toBe("preflight");
    expect(result.code).toBe("host-has-id");
    expect(result.remedy).toContain("register");
    expect(createAgentMock).not.toHaveBeenCalled();
    expect(deleteAgentConfigEntryMock).not.toHaveBeenCalled();
  });

  it("refuses an id this installation has already registered", async () => {
    await registerAgent({ id: "taken", displayName: "Taken", groupId, adminId }, ACTOR);
    const result = await provisionAgent(
      { displayName: "Taken", agentId: "taken", groupId, adminId },
      ACTOR,
    );

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.stage).toBe("preflight");
    expect(result.code).toBe("already-registered");
    expect(createAgentMock).not.toHaveBeenCalled();
  });

  it("reports the host's own refusal with a remedy rather than a stack trace", async () => {
    // `deletion-pending` rather than `reserved-id`: since finding 129, a name
    // that canonicalises to `main` is refused in the preflight, so the reserved
    // id no longer reaches the host at all. Reaching the host stage now needs a
    // refusal only the host can know about, which is the honest way to test it.
    createAgentMock.mockResolvedValue({
      status: "error",
      reason: "deletion-pending",
      agentId: "recycled",
      message: 'agent "recycled" deletion cleanup is still pending',
    });
    const result = await provisionAgent(
      { displayName: "Recycled", agentId: "recycled", groupId, adminId },
      ACTOR,
    );

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.stage).toBe("host");
    expect(result.code).toBe("deletion-pending");
    expect(result.remedy).toBe(
      "An earlier deletion of this agent is still being cleaned up. Wait a moment and try again.",
    );
    expect(result.rolledBack).toBe("not-needed");
    // Nothing was created, so nothing may be deleted.
    expect(deleteAgentConfigEntryMock).not.toHaveBeenCalled();
  });

  it("refuses the host's reserved default id before asking the host", async () => {
    // The other half of the change above, asserted rather than left implied.
    const result = await provisionAgent(
      { displayName: "main", agentId: "main", groupId, adminId },
      ACTOR,
    );

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.stage).toBe("preflight");
    expect(result.code).toBe("name-unusable");
    expect(createAgentMock).not.toHaveBeenCalled();
  });

  it("undoes the host write when the governance write fails", async () => {
    hostCreates("doomed");
    // Register the id *behind* the provision's preflight, so the registry write
    // is the thing that fails. This is the transaction's whole reason to exist:
    // the host said yes and this layer said no.
    createAgentMock.mockImplementation(async () => {
      await registerAgent({ id: "doomed", displayName: "Race", groupId, adminId }, ACTOR);
      return {
        status: "created",
        agentId: "doomed",
        name: "doomed",
        workspace: "/tmp/doomed",
        agentDir: "/tmp/doomed/.agent",
        bootstrapPending: false,
      };
    });

    const result = await provisionAgent(
      { displayName: "Doomed", agentId: "doomed", groupId, adminId },
      ACTOR,
    );

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.stage).toBe("governance");
    expect(result.rolledBack).toBe("reverted");
    expect(deleteAgentConfigEntryMock).toHaveBeenCalledWith(
      expect.objectContaining({ agentId: "doomed" }),
    );
    expect(result.remedy).toContain("Nothing was left behind");
  });

  it("says so loudly when the rollback itself fails", async () => {
    // The one outcome only a human can resolve: a host agent that governance
    // does not know about. After M5 it is refused on every tool call, so it is
    // inert rather than dangerous — but it is present, and the message has to
    // name it and say how to remove it.
    createAgentMock.mockImplementation(async () => {
      await registerAgent({ id: "stranded", displayName: "Race", groupId, adminId }, ACTOR);
      return {
        status: "created",
        agentId: "stranded",
        name: "stranded",
        workspace: "/tmp/stranded",
        agentDir: "/tmp/stranded/.agent",
        bootstrapPending: false,
      };
    });
    deleteAgentConfigEntryMock.mockRejectedValue(new Error("config is read-only"));

    const result = await provisionAgent(
      { displayName: "Stranded", agentId: "stranded", groupId, adminId },
      ACTOR,
    );

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.rolledBack).toBe("failed");
    expect(result.rollbackMessage).toContain("read-only");
    expect(result.remedy).toContain("stranded");
    expect(result.remedy).toContain("refused on every tool call");
  });

  it("warns rather than lying when the host does not pick the agent up", async () => {
    hostCreates("slow");
    const result = await provisionAgent({ displayName: "Slow", groupId, adminId }, ACTOR, {
      hostSeesAgent: () => false,
      sleep: async () => {},
      now: (() => {
        // Two calls per loop (the check and the timeout comparison); stepping a
        // full second each time reaches the 5s budget without real waiting.
        let t = 0;
        return () => {
          t += 1000;
          return t;
        };
      })(),
    });

    // Still a success: both writes landed. What did not happen is the
    // confirmation, and conflating "unconfirmed" with "failed" would tell an
    // operator to re-create an agent that already exists.
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.confirmed).toBe(false);
    expect(result.warning).toContain("had not picked it up");
  });

  it("does not claim a confirmation nobody made", async () => {
    // The command line is not the running gateway, so it passes no observer.
    // Reporting `confirmed: false` with `confirmChecked: false` is the honest
    // shape; reporting `confirmed: true` would be the green tick this project
    // is most careful about.
    hostCreates("cli-made");
    const result = await provisionAgent({ displayName: "CLI Made", groupId, adminId }, ACTOR);

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.confirmChecked).toBe(false);
    expect(result.confirmed).toBe(false);
    expect(result.warning).toBeUndefined();
  });

  it("records the attempt before making it, so a failure still leaves a trail", async () => {
    createAgentMock.mockResolvedValue({
      status: "error",
      reason: "invalid-name",
      message: "no valid id characters",
    });
    await provisionAgent({ displayName: "Ghost", agentId: "ghost", groupId, adminId }, ACTOR);

    const entries = await tailLedger(groupId, 20);
    // The administrative action is carried in `toolName` and its subject in
    // `resource`: administrative entries share one chain with agent activity so
    // that "the rule was widened, then the agent used it" stays readable in a
    // single ordered sequence (see `recordAdminAction`).
    const provisionEntries = entries.filter(
      (entry) => entry.toolName === ADMIN_ACTIONS.agentProvision,
    );
    // The provision was refused, and the ledger still says somebody asked.
    expect(provisionEntries).toHaveLength(1);
    expect(provisionEntries[0]?.resource).toContain("ghost");
  });
});

describe("deprovisionAgent", () => {
  it("leaves the host alone when only the record was asked for", async () => {
    // M4's meaning, preserved exactly. An operator who has always used
    // "unregister" to stop governing an agent must not discover that it now
    // deletes it.
    await registerAgent({ id: "keeper", displayName: "Keeper", groupId, adminId }, ACTOR);
    const result = await deprovisionAgent(
      { agentId: "keeper", groupId, deleteFromHost: false },
      ACTOR,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.deletedFromHost).toBe(false);
    expect(deleteAgentConfigEntryMock).not.toHaveBeenCalled();
    expect(await findAgent("keeper")).toBeUndefined();
  });

  it("deletes from the host when that was explicitly asked for", async () => {
    await registerAgent({ id: "goner", displayName: "Goner", groupId, adminId }, ACTOR);
    const result = await deprovisionAgent(
      { agentId: "goner", groupId, deleteFromHost: true },
      ACTOR,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.deletedFromHost).toBe(true);
    expect(deleteAgentConfigEntryMock).toHaveBeenCalledWith(
      expect.objectContaining({ agentId: "goner" }),
    );
    const entries = await tailLedger(groupId, 20);
    expect(entries.some((entry) => entry.toolName === ADMIN_ACTIONS.agentDeprovision)).toBe(true);
  });

  it("changes nothing at all when the host refuses to delete", async () => {
    // **This test is why the host is deleted first.** The obvious order — drop
    // the record, then delete the agent — looks safer because a host refusal can
    // be "undone" by writing the record back. It cannot: `unregisterAgent` also
    // revokes the agent from every account holding it, and re-registering
    // restores the row and not the assignments. A failed deletion would have
    // left every User who had this agent quietly without it.
    //
    // So the assignment is what this asserts, not merely the record.
    await registerAgent({ id: "sticky", displayName: "Sticky", groupId, adminId }, ACTOR);
    const holder = await createUser(
      { username: "holder", password: PASSWORD, role: "user", groupId, managedBy: adminId },
      "prov-admin",
    );
    await assignAgentsToAccount(holder, ["sticky"], ACTOR);
    deleteAgentConfigEntryMock.mockRejectedValue(new Error("agent is running"));

    const result = await deprovisionAgent(
      { agentId: "sticky", groupId, deleteFromHost: true },
      ACTOR,
    );

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.stage).toBe("host");
    // Nothing was undone because nothing was done — the stronger claim, and the
    // whole point of doing the fallible write first. The result type carries no
    // `rolledBack` at all for this operation, which is how that property is
    // stated rather than merely asserted here.
    expect(result).not.toHaveProperty("rolledBack");
    expect(result.remedy).toContain("Nothing was changed");

    const untouched = await findAgent("sticky");
    expect(untouched?.adminId).toBe(adminId);
    expect(untouched?.displayName).toBe("Sticky");
    const holders = await listUsers();
    expect(holders.find((u) => u.id === holder.id)?.assignedAgents).toContain("sticky");
  });

  it("refuses an agent that is not registered to the caller's organisation", async () => {
    const result = await deprovisionAgent(
      { agentId: "not-ours", groupId, deleteFromHost: true },
      ACTOR,
    );

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.stage).toBe("preflight");
    // The host must not be touched on behalf of an agent this organisation does
    // not own — the check happens before the destructive call, not inside it.
    expect(deleteAgentConfigEntryMock).not.toHaveBeenCalled();
  });
});

describe("round 19 — the M6 edges", () => {
  it("makes the new agent governable immediately, without a cache drop", async () => {
    // The whole of M5's isolation depends on the gate resolving a group, and the
    // gate reads a cache. A provisioned agent the gate cannot resolve yet is one
    // that is refused on every call for as long as the cache is warm — an agent
    // created successfully and unable to do anything, with no error to read.
    hostCreates("fresh");
    const result = await provisionAgent({ displayName: "Fresh", groupId, adminId }, ACTOR, {
      hostSeesAgent: () => true,
    });

    expect(result.ok).toBe(true);
    expect(await resolveAgentGroup("fresh")).toBe(groupId);
  });

  it("refuses a name with no usable characters instead of claiming the default agent", async () => {
    // Finding 129. `normalizeAgentId` returns `main` when nothing survives its
    // filter, so this used to be a request to create the host's default agent on
    // behalf of somebody who typed punctuation — and the ledger recorded it that
    // way.
    for (const junk of ["###", "✓✓", "--"]) {
      const result = await provisionAgent({ displayName: junk, groupId, adminId }, ACTOR);
      expect(result.ok).toBe(false);
      if (result.ok) {
        return;
      }
      expect(result.code).toBe("name-unusable");
    }
    expect(createAgentMock).not.toHaveBeenCalled();
  });

  it("refuses an ineligible owner before touching the host", async () => {
    // Finding 130. The owner is knowable from the account file, so discovering
    // it after `createAgent` meant building a real agent — workspace, identity
    // file, roster entry — and deleting it again.
    const otherGroup = newGroupId();
    const outsider = await createUser(
      { username: "outsider", password: PASSWORD, role: "administrator", groupId: otherGroup },
      "bootstrap",
    );

    const result = await provisionAgent(
      { displayName: "Cross", groupId, adminId: outsider.id },
      ACTOR,
    );

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.stage).toBe("preflight");
    expect(result.code).toBe("owner-ineligible");
    // The point of the finding: nothing was built and nothing was torn down.
    expect(createAgentMock).not.toHaveBeenCalled();
    expect(deleteAgentConfigEntryMock).not.toHaveBeenCalled();
  });

  it("refuses an id already registered to another organisation, by any spelling", async () => {
    // Finding 128's consequence for provisioning: ids are unique across the
    // installation because session keys are global, and case must not be a way
    // round that.
    const otherGroup = await seedGroupWithAgents([]);
    const otherAdmin = await createUser(
      { username: "other-admin", password: PASSWORD, role: "administrator", groupId: otherGroup },
      "bootstrap",
    );
    await registerAgent(
      { id: "shared", displayName: "Theirs", groupId: otherGroup, adminId: otherAdmin.id },
      ACTOR,
    );

    const result = await provisionAgent(
      { displayName: "Shared", agentId: "SHARED", groupId, adminId },
      ACTOR,
    );

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.code).toBe("already-registered");
    expect(result.message).toContain("another organisation");
    expect(createAgentMock).not.toHaveBeenCalled();
  });

  it("stops governing a deleted agent the moment it is gone", async () => {
    await registerAgent({ id: "doomed2", displayName: "D", groupId, adminId }, ACTOR);
    expect(await resolveAgentGroup("doomed2")).toBe(groupId);

    await deprovisionAgent({ agentId: "doomed2", groupId, deleteFromHost: true }, ACTOR);

    // Not merely absent from the panel: absent from the gate, which is the half
    // that matters. A deleted agent still resolving would be governed by a
    // rulebook nobody can now see or edit.
    expect(await resolveAgentGroup("doomed2")).toBeUndefined();
  });

  it("deletes by any spelling of the id", async () => {
    await registerAgent({ id: "mixedcase", displayName: "M", groupId, adminId }, ACTOR);
    const result = await deprovisionAgent(
      { agentId: "MixedCase", groupId, deleteFromHost: true },
      ACTOR,
    );

    expect(result.ok).toBe(true);
    expect(deleteAgentConfigEntryMock).toHaveBeenCalledWith(
      // The host is asked to delete the canonical id, never the operator's
      // spelling — the host keys its roster canonically too.
      expect.objectContaining({ agentId: "mixedcase" }),
    );
  });
});
