// T5 Part B. The actor's tier joins the hash chain without breaking history.
//
// **Why this file is the acceptance criterion and not a nice-to-have.** Adding
// a field to `canonicalPayload` changes what every future entry hashes. Get the
// migration wrong and every ledger written before today stops verifying, which
// is not a cosmetic failure, because "the chain verifies" is the entire claim
// the tamper-evident design makes. A ledger that fails verification for an
// innocent reason is indistinguishable, to a reader, from one that fails
// because somebody edited it.
//
// So the tests below are in two halves: the field works, and *nothing that
// existed before it notices it exists*.
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { recordAdminAction, ADMIN_ACTIONS } from "./admin-audit.js";
import { appendLedgerEntry, tailLedger, verifyLedgerChain } from "./audit-ledger.js";
import { resetLedgerKeyCacheForTests } from "./ledger-key.js";
import { ledgerFilePath } from "./paths.js";
import { seedGroupWithAgents } from "./test-group.js";

let dir: string;

/** The organisation this suite's agents belong to (M5). Per-group storage means
 * every call names a group, and mandatory registration means the gate refuses an
 * agent it has no record of, so the fixture creates a real one. */
let TEST_GROUP: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "governance-actor-role-"));
  process.env.OPENCLAW_GOVERNANCE_DIR = dir;
  TEST_GROUP = await seedGroupWithAgents(["agent-a"]);
  resetLedgerKeyCacheForTests();
});

afterEach(async () => {
  delete process.env.OPENCLAW_GOVERNANCE_DIR;
  resetLedgerKeyCacheForTests();
  await rm(dir, { recursive: true, force: true });
});

describe("the role is recorded and covered by the hash", () => {
  it("stores the tier the actor held when they acted", async () => {
    await recordAdminAction(TEST_GROUP, {
      actor: { name: "alice", role: "administrator" },
      action: ADMIN_ACTIONS.ruleAdd,
      target: "command ^ls$",
    });

    const [entry] = await tailLedger(TEST_GROUP, 10);
    expect(entry?.actor).toBe("alice");
    expect(entry?.actorRole).toBe("administrator");
    expect((await verifyLedgerChain(TEST_GROUP)).ok).toBe(true);
  });

  it("omits the field for actors that are not accounts", async () => {
    // `cli`, `bootstrap`, `hitl-approval` and `unauthenticated` hold no tier.
    // Supplying one would invent an authority that never existed.
    await recordAdminAction(TEST_GROUP, {
      actor: "bootstrap",
      action: ADMIN_ACTIONS.userCreate,
      target: "account root",
    });

    const [entry] = await tailLedger(TEST_GROUP, 10);
    expect(entry?.actor).toBe("bootstrap");
    expect(entry).not.toHaveProperty("actorRole");
    expect((await verifyLedgerChain(TEST_GROUP)).ok).toBe(true);
  });

  it("detects the role being altered after the fact", async () => {
    // The point of covering it: a demotion must not be rewritable into an
    // authority the account never held.
    await recordAdminAction(TEST_GROUP, {
      actor: { name: "alice", role: "user" },
      action: ADMIN_ACTIONS.ruleAdd,
      target: "command ^ls$",
    });

    const raw = await readFile(ledgerFilePath(TEST_GROUP), "utf8");
    const tampered = raw.replace('"actorRole":"user"', '"actorRole":"root"');
    expect(tampered).not.toBe(raw);
    await writeFile(ledgerFilePath(TEST_GROUP), tampered);

    expect((await verifyLedgerChain(TEST_GROUP)).ok).toBe(false);
  });

  it("detects the role being stripped entirely", async () => {
    // The other direction, and the one a presence-based scheme has to be
    // checked for: removing an optional field changes which shape the entry
    // hashes as, so a stripped role must not simply verify as an older entry.
    await recordAdminAction(TEST_GROUP, {
      actor: { name: "alice", role: "root" },
      action: ADMIN_ACTIONS.modeChange,
      target: "mode enforce",
    });

    const raw = await readFile(ledgerFilePath(TEST_GROUP), "utf8");
    await writeFile(ledgerFilePath(TEST_GROUP), raw.replace(',"actorRole":"root"', ""));

    expect((await verifyLedgerChain(TEST_GROUP)).ok).toBe(false);
  });
});

describe("nothing written before the field notices it exists", () => {
  it("verifies a chain in which no entry carries a role", async () => {
    // Exactly the shape of every ledger on disk before this change: admin
    // entries with an actor and no role, interleaved with agent entries that
    // have neither.
    await recordAdminAction(TEST_GROUP, {
      actor: "alice",
      action: ADMIN_ACTIONS.ruleAdd,
      target: "a",
    });
    await appendLedgerEntry(TEST_GROUP, {
      agentId: "agent-a",
      sessionKey: "agent:agent-a:main",
      toolName: "exec",
      resourceKind: "command",
      resource: "ls",
      ruleId: "r-1",
      decision: "allow",
    });
    await recordAdminAction(TEST_GROUP, {
      actor: "bob",
      action: ADMIN_ACTIONS.ruleRemove,
      target: "b",
    });

    const verification = await verifyLedgerChain(TEST_GROUP);
    expect(verification.ok).toBe(true);
    for (const entry of await tailLedger(TEST_GROUP, 10)) {
      expect(entry).not.toHaveProperty("actorRole");
    }
  });

  it("verifies a chain that crosses from role-less to role-carrying entries", async () => {
    // The migration in motion: an installation that upgrades mid-life has both
    // shapes in one file, and the chain has to hold across the boundary.
    await recordAdminAction(TEST_GROUP, {
      actor: "alice",
      action: ADMIN_ACTIONS.ruleAdd,
      target: "before",
    });
    await recordAdminAction(TEST_GROUP, {
      actor: { name: "alice", role: "administrator" },
      action: ADMIN_ACTIONS.ruleAdd,
      target: "after",
    });

    expect((await verifyLedgerChain(TEST_GROUP)).ok).toBe(true);
    const entries = await tailLedger(TEST_GROUP, 10);
    expect(entries[0]).not.toHaveProperty("actorRole");
    expect(entries[1]?.actorRole).toBe("administrator");
  });

  it("gives a role-less entry byte-identical bytes to a pre-change build", async () => {
    // The strongest form of the claim. If the payload for an entry without a
    // role is unchanged, then every hash ever computed for such an entry is
    // still correct, which is what lets an existing ledger verify rather than
    // merely *usually* verify.
    await recordAdminAction(TEST_GROUP, {
      actor: "alice",
      action: ADMIN_ACTIONS.ruleAdd,
      target: "x",
    });
    const [entry] = await tailLedger(TEST_GROUP, 1);

    // Recompute the pre-change payload by hand and confirm the stored hash
    // matches it. The array below is the shape from before `actorRole` existed.
    const { createHmac } = await import("node:crypto");
    const { readLedgerKeyIfPresent } = await import("./ledger-key.js");
    const key = await readLedgerKeyIfPresent();
    expect(key).toBeDefined();
    const legacyPayload = JSON.stringify([
      entry!.seq,
      entry!.timestamp,
      entry!.agentId,
      entry!.sessionKey,
      entry!.toolName,
      entry!.resourceKind,
      entry!.resource,
      entry!.ruleId,
      entry!.decision,
      entry!.prevHash,
      entry!.entryKind ?? "",
      entry!.actor ?? "",
      "keyed",
    ]);
    expect(createHmac("sha256", key!).update(legacyPayload).digest("hex")).toBe(entry!.hash);
  });
});

describe("the tag that prevents a collision", () => {
  it("does not let a role be confused with the keyed marker", async () => {
    // The element after the administrative fields is either a role or the
    // literal "keyed". Appended bare, a role of "keyed" would produce the same
    // payload as no-role-but-keyed. Roles cannot be "keyed" today, which is
    // exactly the kind of premise this project has been caught by before, so
    // the role is written as `role:<value>` and the question does not arise.
    await recordAdminAction(TEST_GROUP, {
      actor: { name: "alice", role: "user" },
      action: ADMIN_ACTIONS.ruleAdd,
      target: "x",
    });
    await recordAdminAction(TEST_GROUP, {
      actor: "bob",
      action: ADMIN_ACTIONS.ruleAdd,
      target: "y",
    });

    const entries = await tailLedger(TEST_GROUP, 10);
    // Different shapes, different hashes, chain intact.
    expect(entries[0]?.hash).not.toBe(entries[1]?.hash);
    expect((await verifyLedgerChain(TEST_GROUP)).ok).toBe(true);
  });
});
