// T35. Making the wrong actor impossible to record.
//
// `AuditActorInput` sits on the write path of every administrative action in
// the layer, which is the place where being wrong is least visible and matters
// most: the ledger is what an investigation has instead of memory. It produced
// two defects in two days, and **the two are different mistakes**, a fact the
// first write-up of T35 got wrong, and which decides the design:
//
//   - **Finding 149**, `lockDownAgent(group, agentId, "cli")`, written two
//     lines below a resolved operator, discarding it. A bare `string` arm
//     accepted the literal, so the emergency stop was the one administrative
//     action on the command line that could not name a person. **Forgetting an
//     authority you hold.**
//   - **Finding 161**, `{ name: "cli", role: "root" }`, recording a
//     destructive account deletion as the act of a Root that does not exist, on
//     the code path that runs precisely when nobody can sign in. **Inventing an
//     authority nobody holds.**
//
// One is caught by the type and one is caught at the choke point, and the split
// is deliberate rather than lazy: branding the object arm as well would make
// several hundred `{ name, role }` literals across this suite fail to compile,
// which is exactly the churn `AuditActorInput`'s own design note refuses.
//
// **Finding 155 is not evidence for either half**, though the first draft of
// T35 claimed it was. Reintroducing it and running `tsgo` showed it fails on
// `CliIdentity`'s missing `username`, with nothing to do with this union. The
// claim was written from reasoning rather than from the compiler; checking it
// is what turned T35 from "narrow the union", which would have caught neither
// defect, because `"cli"` is a legitimate label, into what is built here.
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  ADMIN_ACTIONS,
  CLI_ACTOR,
  FabricatedActorError,
  recordAdminAction,
  splitAuditActor,
  UNKNOWN_ACTOR,
} from "./admin-audit.js";
import { tailLedger } from "./audit-ledger.js";
import { resetLedgerKeyCacheForTests } from "./ledger-key.js";
import { seedNamedGroup } from "./test-group.js";

const TEST_GROUP = "group-actor-type";
let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "governance-actor-type-"));
  process.env.OPENCLAW_GOVERNANCE_DIR = dir;
  resetLedgerKeyCacheForTests();
  await seedNamedGroup(TEST_GROUP, []);
});

afterEach(async () => {
  delete process.env.OPENCLAW_GOVERNANCE_DIR;
  resetLedgerKeyCacheForTests();
  await rm(dir, { recursive: true, force: true });
});

describe("a labelled origin cannot be given a tier. Finding 161", () => {
  it("refuses a named actor that claims a labelled origin's name", () => {
    // The shape that shipped: a destructive account deletion recorded as Root.
    expect(() => splitAuditActor({ name: "cli", role: "root" })).toThrow(FabricatedActorError);
  });

  it("refuses it even without a tier, because the name is still a lie", () => {
    // `{ name: "cli" }` records no false authority, but it does record an
    // account that does not exist where the constant says "not an account".
    // Refusing both keeps one rule rather than two, and the caller who wants
    // the label has `CLI_ACTOR` two characters away.
    expect(() => splitAuditActor({ name: "bootstrap" })).toThrow(FabricatedActorError);
  });

  it("names the remedy in the message, so the failure explains itself", () => {
    // This project's worst bug class is a failure with no visible cause, and a
    // thrown error on an audit path is read by whoever is least expecting it.
    expect(() => splitAuditActor({ name: "unauthenticated", role: "administrator" })).toThrow(
      /pass the exported constant/,
    );
  });

  it("leaves every legitimate actor alone", () => {
    expect(splitAuditActor(CLI_ACTOR)).toEqual({ name: "cli" });
    expect(splitAuditActor(UNKNOWN_ACTOR)).toEqual({ name: "unknown" });
    expect(splitAuditActor({ name: "kinan", role: "root" })).toEqual({
      name: "kinan",
      role: "root",
    });
    expect(splitAuditActor({ name: "malek" })).toEqual({ name: "malek" });
    // `undefined` is tolerated on purpose, `lockDownAgent` takes an optional
    // actor, and that tolerance predates this guard and must survive it.
    expect(splitAuditActor(undefined)).toEqual({ name: "" });
  });

  it("throws rather than normalising, so the bug cannot ship looking correct", async () => {
    // Silently rewriting `{ name: "cli", role: "root" }` to `CLI_ACTOR` would
    // produce a plausible entry and hide the defect, which is how finding 149
    // survived six days. A caller in this position has a real actor available
    // and is discarding it; that is worth stopping, not smoothing over.
    await expect(
      recordAdminAction(TEST_GROUP, {
        actor: { name: "cli", role: "root" },
        action: ADMIN_ACTIONS.userDelete,
        target: "would have been recorded as Root",
      }),
    ).rejects.toThrow(FabricatedActorError);

    expect(await tailLedger(TEST_GROUP)).toHaveLength(0);
  });
});

describe("the labelled actors still record exactly what they always did", () => {
  it("writes the same string the ledger has always carried", async () => {
    // The brand is a compile-time device only. Historical entries read `cli`,
    // and a change to the recorded value would silently split the ledger into
    // two vocabularies either side of this commit.
    await recordAdminAction(TEST_GROUP, {
      actor: CLI_ACTOR,
      action: ADMIN_ACTIONS.userDelete,
      target: "removed an account that predated groups",
    });

    const entry = (await tailLedger(TEST_GROUP)).at(-1);
    expect(entry?.actor).toBe("cli");
    // And no tier, which is the whole point of the labelled arm.
    expect(entry?.actorRole).toBeUndefined();
  });
});
