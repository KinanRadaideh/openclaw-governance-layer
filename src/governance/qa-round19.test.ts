// Round nineteen — the M-series audited as one system (2026-08-27).
//
// The first eighteen rounds reviewed the single-tenant layer. This one reviews
// the feature added on top of it: groups (M3), the agent registry (M4),
// per-group storage (M5) and provisioning (M6), asked as one question rather
// than four — **can one organisation reach, affect, or be confused with
// another, and does an agent that looks governed actually get governed?**
//
// Run the way rounds 13 and 14 were: requirements first, system attacked
// second, source read third. The most valuable finding came from asking what
// the *stored* agent id is and what the *gate* looks one up by, which nobody had
// asked because each half is obviously correct on its own.
//
// ## What this round found
//
//   - **128** — the registry stored `id.trim()` while the gate resolved
//     `normalizeAgentId(...)`. A capitalised or spaced id registered fine, was
//     shown as owned and governed, and was refused on every tool call with
//     nothing explaining why. It also made `DuplicateAgentError` bypassable by
//     case, so installation-wide agent-id uniqueness — kept deliberately in M5
//     because session keys are global — did not actually hold.
//
// Everything else below passed, and is pinned so it keeps passing. Several of
// these are properties the M-series argued for in prose and had never asserted.
import { mkdtemp, rm } from "node:fs/promises";
import { readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ADMIN_ACTIONS } from "./admin-audit.js";
import { resetAgentGroupCacheForTests, resolveAgentGroup } from "./agent-group.js";
import {
  AgentNotAssignableError,
  assertAssignable,
  DuplicateAgentError,
  findAgent,
  listAgents,
  registerAgent,
  renameAgent,
  setAgentOwner,
  unregisterAgent,
  UnknownAgentError,
} from "./agent-registry.js";
import { MAX_AGENT_DISPLAY_NAME_LENGTH } from "./agent-registry.js";
import { verifyLedgerChain } from "./audit-ledger.js";
import { tailLedger } from "./audit-ledger.js";
import { resetLedgerKeyCacheForTests } from "./ledger-key.js";
import { groupDir, ledgerFilePath, policyFilePath } from "./paths.js";
import { loadPolicy } from "./policy-store.js";
import { savePolicy } from "./policy-store.js";
import { defaultPolicyDocument } from "./policy-types.js";
import { seedGroupWithAgents } from "./test-group.js";
import { listUsers, setUserAssignedAgents } from "./user-store.js";
import { createUser, newGroupId } from "./user-store.js";

const PASSWORD = "correct-horse-battery";
const ACTOR = { name: "admin", role: "administrator" as const };

let dir: string;
let alpha: { groupId: string; adminId: string };
let beta: { groupId: string; adminId: string };

/** A second organisation, because every property here is about the boundary. */
async function organisation(prefix: string): Promise<{ groupId: string; adminId: string }> {
  const groupId = newGroupId();
  await createUser(
    { username: `${prefix}-root`, password: PASSWORD, role: "root", groupId },
    "bootstrap",
  );
  const admin = await createUser(
    { username: `${prefix}-admin`, password: PASSWORD, role: "administrator", groupId },
    `${prefix}-root`,
  );
  await savePolicy(groupId, { ...defaultPolicyDocument(), mode: "enforce" });
  return { groupId, adminId: admin.id };
}

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "governance-round19-"));
  process.env.OPENCLAW_GOVERNANCE_DIR = dir;
  await seedGroupWithAgents([]);
  resetLedgerKeyCacheForTests();
  resetAgentGroupCacheForTests();
  alpha = await organisation("alpha");
  beta = await organisation("beta");
});

afterEach(async () => {
  delete process.env.OPENCLAW_GOVERNANCE_DIR;
  resetLedgerKeyCacheForTests();
  resetAgentGroupCacheForTests();
  await rm(dir, { recursive: true, force: true });
});

describe("finding 128 — the id the registry stores is the id the gate looks up", () => {
  it("governs an agent registered under a capitalised id", async () => {
    // The reproduction. Before the fix this registered, appeared in the panel as
    // owned and registered, and resolved to no group — so the gate refused every
    // call it made, and nothing anywhere said why.
    await registerAgent({ id: "Scout", displayName: "Scout", ...alpha }, ACTOR);
    resetAgentGroupCacheForTests();

    expect(await resolveAgentGroup("scout")).toBe(alpha.groupId);
  });

  it("governs an agent whose id had spaces in it", async () => {
    await registerAgent({ id: "my agent", displayName: "My Agent", ...alpha }, ACTOR);
    resetAgentGroupCacheForTests();

    expect(await resolveAgentGroup("my-agent")).toBe(alpha.groupId);
  });

  it("governs an agent whose id is longer than the host's 64-character limit", async () => {
    // `MAX_AGENT_ID_LENGTH` is 200 and the host truncates at 64, so anything
    // between the two could be registered and could never be resolved.
    const long = "a".repeat(80);
    await registerAgent({ id: long, displayName: "Long", ...alpha }, ACTOR);
    resetAgentGroupCacheForTests();

    expect(await resolveAgentGroup("a".repeat(64))).toBe(alpha.groupId);
  });

  it("refuses a second registration that differs only in case", async () => {
    // The security half. Installation-wide uniqueness is deliberate — session
    // keys are `agent:<id>:…` and global — and case made it bypassable, so two
    // groups could hold one real agent between them.
    await registerAgent({ id: "Scout", displayName: "One", ...alpha }, ACTOR);

    await expect(
      registerAgent({ id: "scout", displayName: "Two", ...beta }, ACTOR),
    ).rejects.toBeInstanceOf(DuplicateAgentError);
  });

  it("finds, renames, re-owns and unregisters by any spelling of the id", async () => {
    // Every operator-facing verb has to agree with the stored key, or the panel
    // shows a row whose buttons report "no such agent".
    await registerAgent({ id: "scout", displayName: "Scout", ...alpha }, ACTOR);

    expect(await findAgent("SCOUT")).toBeDefined();
    await renameAgent("Scout", "Renamed", alpha.groupId, ACTOR);
    expect((await findAgent("scout"))?.displayName).toBe("Renamed");
    await unregisterAgent("SCoUT", alpha.groupId, ACTOR);
    expect(await findAgent("scout")).toBeUndefined();
  });

  it("keeps the operator's spelling as the display name", async () => {
    // Canonicalising the id must not cost the human form: that is what the
    // display name is for, and it is the same split `account-name.ts` draws.
    const agent = await registerAgent({ id: "My Agent", displayName: "My Agent", ...alpha }, ACTOR);
    expect(agent.id).toBe("my-agent");
    expect(agent.displayName).toBe("My Agent");
  });
});

describe("the boundary between two organisations", () => {
  it("does not list one group's agents to another", async () => {
    await registerAgent({ id: "alpha-one", displayName: "A1", ...alpha }, ACTOR);
    await registerAgent({ id: "beta-one", displayName: "B1", ...beta }, ACTOR);

    const seen = await listAgents(beta.groupId);
    expect(seen.map((a) => a.id)).toEqual(["beta-one"]);
  });

  it("reports another group's agent as absent, not as forbidden", async () => {
    // Distinguishing the two would make the registry an enumeration oracle:
    // "forbidden" confirms the id exists somewhere on the installation.
    await registerAgent({ id: "alpha-one", displayName: "A1", ...alpha }, ACTOR);

    await expect(renameAgent("alpha-one", "Nope", beta.groupId, ACTOR)).rejects.toBeInstanceOf(
      UnknownAgentError,
    );
    await expect(unregisterAgent("alpha-one", beta.groupId, ACTOR)).rejects.toBeInstanceOf(
      UnknownAgentError,
    );
  });

  it("refuses to assign an agent belonging to another organisation", async () => {
    await registerAgent({ id: "alpha-one", displayName: "A1", ...alpha }, ACTOR);

    await expect(
      assertAssignable(["alpha-one"], beta.adminId, beta.groupId),
    ).rejects.toBeInstanceOf(AgentNotAssignableError);
  });

  it("refuses to hand an agent to an Administrator in another organisation", async () => {
    // Ownership is scoped to the group; a transfer across the boundary would
    // move an agent out of the document that governs it.
    await registerAgent({ id: "alpha-one", displayName: "A1", ...alpha }, ACTOR);

    await expect(setAgentOwner("alpha-one", beta.adminId, alpha.groupId, ACTOR)).rejects.toThrow();
  });

  it("resolves each group's agents to that group and no other", async () => {
    await registerAgent({ id: "alpha-one", displayName: "A1", ...alpha }, ACTOR);
    await registerAgent({ id: "beta-one", displayName: "B1", ...beta }, ACTOR);
    resetAgentGroupCacheForTests();

    expect(await resolveAgentGroup("alpha-one")).toBe(alpha.groupId);
    expect(await resolveAgentGroup("beta-one")).toBe(beta.groupId);
  });
});

describe("mandatory registration, as the gate depends on it", () => {
  it("resolves no group for an agent nobody registered", async () => {
    // The property the whole of M5's isolation rests on: there is no document to
    // fall back to, so the gate has nothing to be permissive with.
    expect(await resolveAgentGroup("never-registered")).toBeUndefined();
  });

  it("resolves no group for an agent that was unregistered", async () => {
    await registerAgent({ id: "temporary", displayName: "T", ...alpha }, ACTOR);
    await unregisterAgent("temporary", alpha.groupId, ACTOR);

    expect(await resolveAgentGroup("temporary")).toBeUndefined();
  });

  it("stops resolving the moment the record is written, without a manual cache drop", async () => {
    // The cache is dropped by the write itself (`invalidateAgentGroupCache`),
    // deliberately placed next to the write so a future mutation cannot forget
    // it. Asserted here because the alternative — a stale group on the hot path
    // — is a security answer served from memory after the fact changed.
    await registerAgent({ id: "cached", displayName: "C", ...alpha }, ACTOR);
    expect(await resolveAgentGroup("cached")).toBe(alpha.groupId);

    await unregisterAgent("cached", alpha.groupId, ACTOR);
    expect(await resolveAgentGroup("cached")).toBeUndefined();
  });
});

describe("finding 129 — a name with no usable characters becomes the default agent", () => {
  it("refuses to register an id that canonicalises to the host default", async () => {
    // `normalizeAgentId` is a coercion, not a validator: nothing survives the
    // filter, so it returns `main`. Once 128 made the registry store the
    // canonical form, this quietly claimed **the installation's default agent**
    // — ownership, assignment and this group's rulebook governing it — for an
    // operator who typed punctuation.
    for (const junk of ["###", "!!!", "--", "✓✓"]) {
      await expect(
        registerAgent({ id: junk, displayName: "Junk", ...alpha }, ACTOR),
      ).rejects.toThrow(/no characters usable/);
    }
    expect(await findAgent("main")).toBeUndefined();
  });

  it("still allows an operator to claim the default agent deliberately", async () => {
    // The migration path: `main` is the first agent an existing installation
    // has, and claiming it is exactly what registration is for. Only the
    // accidental route is closed.
    const agent = await registerAgent({ id: "main", displayName: "Main", ...alpha }, ACTOR);
    expect(agent.id).toBe("main");
  });

  it("was introduced by the fix for 128, which is the point", async () => {
    // Before 128 the registry stored `"###"` verbatim: ungoverned, but nobody
    // else's. The repair is what turned it into a claim on `main`. Findings 116
    // and 117 have the same shape — *a fix is not audited as hard as the thing
    // it fixes* — and this test exists so the guard is not removed as redundant.
    await expect(
      registerAgent({ id: "   ", displayName: "Blank", ...alpha }, ACTOR),
    ).rejects.toThrow();
  });
});

describe("ownership cannot cross the boundary", () => {
  it("refuses to register an agent to an Administrator in another organisation", async () => {
    // The one write that would defeat the model: an agent owned outside the
    // group whose rulebook governs it.
    await expect(
      registerAgent(
        { id: "cross", displayName: "X", groupId: alpha.groupId, adminId: beta.adminId },
        ACTOR,
      ),
    ).rejects.toThrow(/not found in this group/);
    expect(await findAgent("cross")).toBeUndefined();
  });

  it("says the same thing for an account that does not exist at all", async () => {
    // One message for both, so the reply is not an oracle for which account ids
    // exist elsewhere on the installation.
    await expect(
      registerAgent(
        { id: "cross", displayName: "X", groupId: alpha.groupId, adminId: "no-such-account" },
        ACTOR,
      ),
    ).rejects.toThrow(/not found in this group/);
  });

  it("refuses to own an agent as a non-Administrator", async () => {
    const viewer = await createUser(
      {
        username: "alpha-viewer",
        password: PASSWORD,
        role: "viewer",
        groupId: alpha.groupId,
        managedBy: alpha.adminId,
      },
      "alpha-admin",
    );
    await expect(
      registerAgent(
        { id: "byviewer", displayName: "V", groupId: alpha.groupId, adminId: viewer.id },
        ACTOR,
      ),
    ).rejects.toThrow(/owned by an Administrator/);
  });
});

describe("the trail lands in the right organisation's ledger", () => {
  it("records a registration only in the agent's own group", async () => {
    // Per-group ledgers (M5) mean an entry in the wrong file is both a leak and
    // a gap: the other organisation learns of an agent it cannot see, and this
    // one loses the record of who claimed it.
    await registerAgent({ id: "alpha-one", displayName: "A1", ...alpha }, ACTOR);

    const mine = await tailLedger(alpha.groupId, 20);
    const theirs = await tailLedger(beta.groupId, 20);
    expect(mine.some((e) => e.toolName === ADMIN_ACTIONS.agentRegister)).toBe(true);
    expect(theirs.some((e) => e.toolName === ADMIN_ACTIONS.agentRegister)).toBe(false);
  });

  it("records the owner, because unregistration destroys the only other copy", async () => {
    await registerAgent({ id: "alpha-one", displayName: "A1", ...alpha }, ACTOR);
    const entry = (await tailLedger(alpha.groupId, 20)).find(
      (e) => e.toolName === ADMIN_ACTIONS.agentRegister,
    );
    expect(entry?.resource).toContain(alpha.adminId);
  });
});

describe("unregistration repairs what it invalidates", () => {
  it("releases the agent from the accounts holding it", async () => {
    // The property finding 127 turned on: unregistering is not a row deletion,
    // it revokes assignments too — which is why deletion had to be reordered.
    const holder = await createUser(
      {
        username: "alpha-user",
        password: PASSWORD,
        role: "user",
        groupId: alpha.groupId,
        managedBy: alpha.adminId,
      },
      "alpha-admin",
    );
    await registerAgent({ id: "held", displayName: "H", ...alpha }, ACTOR);
    await setUserAssignedAgents(holder.id, ["held"], ACTOR);
    expect((await listUsers()).find((u) => u.id === holder.id)?.assignedAgents).toContain("held");

    await unregisterAgent("held", alpha.groupId, ACTOR);

    expect((await listUsers()).find((u) => u.id === holder.id)?.assignedAgents).not.toContain(
      "held",
    );
  });
});

describe("input boundaries", () => {
  it("accepts a display name at the limit and refuses one past it", async () => {
    await registerAgent(
      { id: "atlimit", displayName: "n".repeat(MAX_AGENT_DISPLAY_NAME_LENGTH), ...alpha },
      ACTOR,
    );
    await expect(
      registerAgent(
        { id: "overlimit", displayName: "n".repeat(MAX_AGENT_DISPLAY_NAME_LENGTH + 1), ...alpha },
        ACTOR,
      ),
    ).rejects.toThrow(/at most/);
  });

  it("refuses an empty display name, which no surface should send", async () => {
    await expect(
      registerAgent({ id: "noname", displayName: "   ", ...alpha }, ACTOR),
    ).rejects.toThrow(/display name is required/);
  });
});

describe("M5 — per-group storage, checked on disk rather than in prose", () => {
  it("gives each organisation its own policy document and ledger file", async () => {
    // The claim M5 is named for. Asserted against the filesystem because
    // "isolation enforced by the layer" was the *previous* arrangement, and the
    // difference between the two is exactly where a file path lands.
    await registerAgent({ id: "alpha-one", displayName: "A1", ...alpha }, ACTOR);
    await registerAgent({ id: "beta-one", displayName: "B1", ...beta }, ACTOR);

    expect(groupDir(alpha.groupId)).not.toBe(groupDir(beta.groupId));
    expect(policyFilePath(alpha.groupId)).not.toBe(policyFilePath(beta.groupId));
    expect(ledgerFilePath(alpha.groupId)).not.toBe(ledgerFilePath(beta.groupId));
    // Both really exist, so the separation is a fact rather than a naming scheme.
    expect((await readdir(groupDir(alpha.groupId))).length).toBeGreaterThan(0);
    expect((await readdir(groupDir(beta.groupId))).length).toBeGreaterThan(0);
  });

  it("does not let one organisation's policy edit reach another's", async () => {
    const before = await loadPolicy(beta.groupId);
    await savePolicy(alpha.groupId, { ...defaultPolicyDocument(), mode: "monitor" });

    expect((await loadPolicy(alpha.groupId)).mode).toBe("monitor");
    expect((await loadPolicy(beta.groupId)).mode).toBe(before.mode);
  });

  it("verifies each chain independently, on one installation-wide key", async () => {
    // The constraint that shaped M5: per-group ledger *files*, one key, one
    // checkpoint keyed by group — so requirement #6's claim stayed literally
    // true rather than being restated per group.
    await registerAgent({ id: "alpha-one", displayName: "A1", ...alpha }, ACTOR);
    await registerAgent({ id: "beta-one", displayName: "B1", ...beta }, ACTOR);

    expect((await verifyLedgerChain(alpha.groupId)).ok).toBe(true);
    expect((await verifyLedgerChain(beta.groupId)).ok).toBe(true);
  });

  it("keeps one group's chain verifiable when another group is busy", async () => {
    // Interleaving matters: one shared key and two files means a write to one
    // chain must not advance or invalidate the other's head.
    await registerAgent({ id: "alpha-one", displayName: "A1", ...alpha }, ACTOR);
    await registerAgent({ id: "beta-one", displayName: "B1", ...beta }, ACTOR);
    await registerAgent({ id: "alpha-two", displayName: "A2", ...alpha }, ACTOR);
    await registerAgent({ id: "beta-two", displayName: "B2", ...beta }, ACTOR);

    expect((await verifyLedgerChain(alpha.groupId)).ok).toBe(true);
    expect((await verifyLedgerChain(beta.groupId)).ok).toBe(true);
  });
});
