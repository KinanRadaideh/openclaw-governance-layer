// One agent, one organisation. Even when the registry file disagrees with
// itself (finding 145).
//
// ## What this is really about, and what it is not
//
// It is **not** about making agent ids case-sensitive. They are not, and that is
// not this project's decision: OpenClaw's own `normalizeAgentId`
// (`packages/normalization-core/src/agent-id.ts`) lowercases every id as part of
// producing its "filesystem-safe canonical form", and 910 call sites across
// routing, session keys and directory layout depend on it. `Scout` and `scout`
// are one agent to the host, its session keys and its folders, and on Windows
// and macOS the filesystem would agree with that even if the code did not.
//
// Finding 128 was this project storing an id one way while the gate looked it up
// the other, so an agent looked governed and was refused on every call. The fix
// was to make both sides use the host's canonical form. Reversing that is how
// finding 128 comes back.
//
// **The real gap was narrower.** Registration compared the incoming *canonical*
// id against each stored id as written. Every row written since finding 128 is
// canonical, so those agreed, but a registry written before it can hold
// `"Scout"`, and `"Scout" === "scout"` is false. Two rows could therefore exist
// for one real agent, in two different organisations, and `resolveAgentGroup`
// kept whichever the file listed last.
//
// Which organisation governs a real agent would then depend on file order:
// silently, and differently after any rewrite.
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resetAgentGroupCacheForTests, resolveAgentGroup } from "./agent-group.js";
import { DuplicateAgentError, registerAgent } from "./agent-registry.js";
import { agentsFilePath } from "./paths.js";
import { seedNamedGroup } from "./test-group.js";

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "agent-id-collision-"));
  process.env.OPENCLAW_GOVERNANCE_DIR = dir;
  resetAgentGroupCacheForTests();
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
  delete process.env.OPENCLAW_GOVERNANCE_DIR;
  resetAgentGroupCacheForTests();
});

/**
 * Writes a registry by hand, in the pre-finding-128 shape.
 *
 * `registerAgent` cannot produce this any more, which is the point: the file is
 * the only way left to reach the state, so the file is what the test supplies.
 */
async function writeLegacyRegistry(rows: Array<{ id: string; groupId: string }>): Promise<void> {
  await seedNamedGroup("group-a", []);
  await writeFile(
    agentsFilePath(),
    JSON.stringify({
      version: 1,
      agents: rows.map((row) => ({
        ...row,
        displayName: row.id,
        adminId: "admin-1",
        createdAt: "2026-08-01T00:00:00.000Z",
      })),
    }),
    "utf8",
  );
  resetAgentGroupCacheForTests();
}

describe("an id that already exists in another spelling cannot be registered", () => {
  it("refuses a registration that collides with a legacy row", async () => {
    // The door. Before this, the check compared "scout" against the stored
    // "Scout", said "not taken", and created the second row.
    await writeLegacyRegistry([{ id: "Scout", groupId: "group-a" }]);
    await seedNamedGroup("group-b", []);
    await expect(
      registerAgent(
        { id: "scout", displayName: "Scout", groupId: "group-b", adminId: "admin-2" },
        { name: "test", role: "root" },
      ),
    ).rejects.toBeInstanceOf(DuplicateAgentError);
  });
});

describe("a registry that contradicts itself governs nobody", () => {
  it("withdraws an id claimed by two organisations rather than picking one", async () => {
    // The window. `Map.set` would keep the last row, so file order would decide
    // which organisation's rules govern a real agent. Silently, and
    // differently after any rewrite.
    await writeLegacyRegistry([
      { id: "Scout", groupId: "group-a" },
      { id: "scout", groupId: "group-b" },
    ]);
    expect(await resolveAgentGroup("scout")).toBeUndefined();
  });

  it("refuses it whichever order the rows appear in", async () => {
    // The defect was order-dependence, so asserting one order proves nothing.
    await writeLegacyRegistry([
      { id: "scout", groupId: "group-b" },
      { id: "Scout", groupId: "group-a" },
    ]);
    expect(await resolveAgentGroup("scout")).toBeUndefined();
  });

  it("leaves every other agent alone", async () => {
    // Withdrawal is targeted. One contradictory pair must not take an unrelated
    // agent's governance down with it. That would turn a stale row into an
    // outage.
    await writeLegacyRegistry([
      { id: "Scout", groupId: "group-a" },
      { id: "scout", groupId: "group-b" },
      { id: "courier", groupId: "group-a" },
    ]);
    expect(await resolveAgentGroup("scout")).toBeUndefined();
    expect(await resolveAgentGroup("courier")).toBe("group-a");
  });

  it("keeps resolving duplicate rows that agree with each other", async () => {
    // Two spellings pointing at the *same* organisation are redundant, not
    // contradictory. There is one right answer, so refusing would cost an
    // operator their agent for an untidy file rather than an ambiguous one.
    await writeLegacyRegistry([
      { id: "Scout", groupId: "group-a" },
      { id: "scout", groupId: "group-a" },
    ]);
    expect(await resolveAgentGroup("scout")).toBe("group-a");
  });

  it("still resolves a legacy row that nothing contradicts", async () => {
    // The migration path finding 128 left open on purpose: an id stored in the
    // old spelling still governs, because the lookup canonicalises both sides.
    await writeLegacyRegistry([{ id: "Scout", groupId: "group-a" }]);
    expect(await resolveAgentGroup("scout")).toBe("group-a");
  });
});
