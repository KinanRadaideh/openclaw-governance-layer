// T6 — a lockdown reaches what the locked agent started.
//
// Finding 96: stopping a parent left a **cross-agent** child running, because
// the child's session key carries only the target's identity and nothing about
// where the work came from. `qa-round14.test.ts` pinned that limitation
// deliberately, with a comment saying that closing the gap should make it fail
// and send whoever closed it to the explanation. This is that closure, and that
// test has been rewritten to assert the new behaviour.
//
// ## What changed, and what did not
//
// **Nothing in OpenClaw changed.** The backlog carried T6 as "needs the host to
// report the requester through `HookContext`", which is true of the hook and
// was read as true of the project. It is not: this is a fork, and the host
// already records `spawnedBy` on the session entry. The gate can read the
// session store instead of waiting for a field to appear in a payload.
//
// The three properties below are the ones worth pinning, in order of how easily
// each could be lost again:
//
//   1. A child of a locked agent is refused, and the refusal *names the
//      ancestor* rather than the child — an operator reading the ledger during
//      an incident needs to know which stop caused this.
//   2. An unrelated session is **not** refused. Fail-closed at an incident is
//      only defensible if it is narrow, and a rule that stopped everything
//      would be indistinguishable from a broken gate.
//   3. The walk costs nothing when nothing is locked, terminates on a cycle,
//      and stops at a bounded depth.
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { SessionEntry } from "../config/sessions.js";
import { replaceSessionEntry } from "../config/sessions/session-accessor.js";
import { closeOpenClawAgentDatabases } from "../state/openclaw-agent-db.js";
import { closeOpenClawStateDatabaseForTest } from "../state/openclaw-state-db.js";
import { findLockedAncestor, lineageUnknown } from "./session-lineage.js";

let dir: string;
let previousStateDir: string | undefined;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "governance-lineage-"));
  previousStateDir = process.env.OPENCLAW_STATE_DIR;
  process.env.OPENCLAW_STATE_DIR = dir;
});

afterEach(async () => {
  if (previousStateDir === undefined) {
    delete process.env.OPENCLAW_STATE_DIR;
  } else {
    process.env.OPENCLAW_STATE_DIR = previousStateDir;
  }
  // Close before removing, the fix T25 made in two other fixtures on the same
  // day: POSIX allows unlinking an open file and Windows refuses with EBUSY, so
  // a teardown that skips this passes on CI and fails on the machine this
  // project is developed on.
  closeOpenClawAgentDatabases();
  closeOpenClawStateDatabaseForTest();
  await rm(dir, { recursive: true, force: true });
});

describe("the walk is bounded and cheap", () => {
  it("does no work at all when nothing is locked", () => {
    // The property that keeps this off the hot path: an installation with no
    // incident in progress never reads the session store from the gate.
    expect(findLockedAncestor("agent:agent-b:child", [])).toBeUndefined();
  });

  it("answers immediately for a call with no session key", () => {
    expect(findLockedAncestor(undefined, ["agent-a"])).toBeUndefined();
  });

  it("never throws for a session key the store cannot scope (regression)", () => {
    // The defect the first version shipped: `view.get` throws for a key the
    // SQLite scope cannot resolve, and only the *open* was guarded — so the
    // exception escaped `evaluateGovernancePolicy` itself whenever a lockdown
    // was in force. **A gate that throws does not deny**: what leaves the hook
    // is an exception, not a decision. Caught by an existing round-six test
    // before this one existed.
    expect(() => findLockedAncestor("not-an-agent-key", ["agent-a"])).not.toThrow();
    expect(findLockedAncestor("not-an-agent-key", ["agent-a"])).toBeUndefined();
  });

  it("does not report a non-agent key as unreadable lineage", () => {
    // It has no lineage *by construction*, and the unattributable rule
    // (finding 81) already refuses it. Reporting it here too would refuse the
    // same call twice under two ledger ids and spoil the counts.
    expect(lineageUnknown("not-an-agent-key", ["agent-a"])).toBe(false);
  });

  it("returns nothing for a session the store has never heard of", () => {
    // Not the same as "unreadable" — the store answered, and the answer was
    // that this session has no recorded parent. `lineageUnknown` covers the
    // case where the store cannot answer at all.
    expect(findLockedAncestor("agent:agent-b:orphan", ["agent-a"])).toBeUndefined();
  });
});

/**
 * Makes the session store genuinely unreadable, the way a disk does.
 *
 * Closes the handles, removes the state directory and puts a *file* at its
 * path, so every later attempt to open a store beneath it fails at the
 * filesystem rather than being politely reported as empty. This is the exact
 * shape finding 120 was measured with, and the reason it is here rather than a
 * mock: the finding was that the real accessor does not throw where the code
 * assumed it would, so a stubbed one would have proved nothing.
 */
async function breakSessionStore(): Promise<void> {
  closeOpenClawAgentDatabases();
  closeOpenClawStateDatabaseForTest();
  await rm(dir, { recursive: true, force: true });
  await writeFile(dir, "the state directory is now a file", "utf8");
}

/** Records a session and, optionally, the session that spawned it. */
async function record(sessionKey: string, spawnedBy?: string): Promise<void> {
  await replaceSessionEntry({ sessionKey }, {
    sessionId: sessionKey,
    updatedAt: Date.now(),
    ...(spawnedBy ? { spawnedBy } : {}),
  } as SessionEntry);
}

describe("a lockdown reaches what the locked agent started", () => {
  it("finds the locked parent of a cross-agent child", async () => {
    await record("agent:agent-a:main");
    await record("agent:agent-b:child", "agent:agent-a:main");
    const found = findLockedAncestor("agent:agent-b:child", ["agent-a"]);
    expect(found).toMatchObject({ agentId: "agent-a", sessionKey: "agent:agent-a:main", depth: 1 });
  });

  it("leaves an unrelated session alone", async () => {
    // The property that makes failing closed defensible: it is narrow. A gate
    // that stopped every session during an incident would be indistinguishable
    // from a broken one.
    await record("agent:agent-a:main");
    await record("agent:agent-c:solo");
    expect(findLockedAncestor("agent:agent-c:solo", ["agent-a"])).toBeUndefined();
  });

  it("walks past an unlocked parent to a locked grandparent", async () => {
    // Lineage, not parentage. Stopping an agent has to reach what its work
    // started, however many hops away that ended up.
    await record("agent:agent-a:main");
    await record("agent:agent-b:mid", "agent:agent-a:main");
    await record("agent:agent-c:leaf", "agent:agent-b:mid");
    expect(findLockedAncestor("agent:agent-c:leaf", ["agent-a"])).toMatchObject({
      agentId: "agent-a",
      depth: 2,
    });
  });

  it("names the nearest locked ancestor when two are locked", async () => {
    // The reason an operator is shown should be the nearest cause. Reporting
    // the oldest would send them to a stop they may have made hours earlier.
    await record("agent:agent-a:main");
    await record("agent:agent-b:mid", "agent:agent-a:main");
    await record("agent:agent-c:leaf", "agent:agent-b:mid");
    expect(findLockedAncestor("agent:agent-c:leaf", ["agent-a", "agent-b"])).toMatchObject({
      agentId: "agent-b",
      depth: 1,
    });
  });

  it("terminates on a cycle instead of walking forever", async () => {
    // Not a shape the host writes. The store is on disk and this is a security
    // path, so the walk refuses to trust that.
    await record("agent:agent-b:one", "agent:agent-c:two");
    await record("agent:agent-c:two", "agent:agent-b:one");
    expect(findLockedAncestor("agent:agent-b:one", ["agent-a"])).toBeUndefined();
  });
});

/**
 * **Finding 120 — the fail-closed branch could not fire. Closed 2026-08-26.**
 *
 * `lineageUnknown` exists so a call whose lineage cannot be read during an
 * incident is treated as *unproven* rather than *clear*, the same choice
 * finding 81 made for a call carrying no agent id. It never returned `true`.
 *
 * The cause was one interface below. It probed with `get`, which answers
 * `undefined` **both** for a row that is absent and for a store that is gone —
 * measured with the state directory replaced by a file, where `get` returns
 * `undefined` rather than throwing. The two cases the design depends on
 * separating gave the same answer, so the branch was dead and a lockdown whose
 * lineage records were lost degraded to fail-*open*, silently.
 *
 * **Found by mutation, not by a failing test.** Disabling the branch left all
 * 867 governance tests passing. A security property nothing depends on is a
 * property nothing is holding.
 *
 * **The fix is a better question, not a stricter policy.** A *scoped listing*
 * separates what a keyed probe cannot: an empty array for an agent with no
 * sessions, a throw for a store that will not open. That mattered, because the
 * obvious fix — treat any missing row as unknown — closes the gap and costs
 * narrowness, failing six tests that assert an unrelated agent keeps working
 * during someone else's lockdown. Narrowness is what makes failing closed
 * defensible, so a fix that spent it would have been the wrong trade.
 *
 * The tests below therefore assert **both** halves. Losing either one puts the
 * finding back: lose the first and the gap reopens, lose the second and the
 * kill switch becomes a blunt instrument during every incident.
 */
describe("finding 120 — lineage that cannot be read is refused, not waved through", () => {
  it("reports unreadable when the store cannot be opened", async () => {
    await record("agent:agent-a:main");
    await record("agent:agent-b:child", "agent:agent-a:main");
    expect(lineageUnknown("agent:agent-b:child", ["agent-a"])).toBe(false);
    await breakSessionStore();
    // The probe that used to answer "readable, nothing to see here".
    expect(lineageUnknown("agent:agent-b:child", ["agent-a"])).toBe(true);
  });

  it("stops reporting a locked ancestor once the store is unreadable", async () => {
    // The half that makes the one above necessary. The walk cannot find the
    // parent any more either, so without `lineageUnknown` the call would look
    // exactly like an unrelated session and be allowed.
    await record("agent:agent-a:main");
    await record("agent:agent-b:child", "agent:agent-a:main");
    expect(findLockedAncestor("agent:agent-b:child", ["agent-a"])).toMatchObject({
      agentId: "agent-a",
    });
    await breakSessionStore();
    expect(findLockedAncestor("agent:agent-b:child", ["agent-a"])).toBeUndefined();
  });

  it("still calls a genuinely unrecorded session clear, not unknown", async () => {
    // **The narrowness half.** A row absent from a store that answers is a
    // session with no recorded parent, which proves nothing sinister. Reporting
    // it as unknown would refuse unrelated agents throughout every incident and
    // make the kill switch indistinguishable from a broken gate.
    await record("agent:agent-a:main");
    expect(lineageUnknown("agent:agent-b:orphan", ["agent-a"])).toBe(false);
    expect(findLockedAncestor("agent:agent-b:orphan", ["agent-a"])).toBeUndefined();
  });

  it("does no work and reports nothing when no agent is locked", async () => {
    // The walk is only consulted during an incident, so a store that cannot be
    // read is only ever a problem during one.
    await record("agent:agent-b:child", "agent:agent-a:main");
    await breakSessionStore();
    expect(lineageUnknown("agent:agent-b:child", [])).toBe(false);
  });

  it("reports unreadable rather than clear when a mid-chain store is gone", async () => {
    // Sessions are stored per agent, so a chain across three agents crosses
    // three stores. Checking only the first would let one unreadable store in
    // the middle truncate the walk into a confident "clear" — the same defect,
    // moved two hops up.
    await record("agent:agent-a:main");
    await record("agent:agent-b:mid", "agent:agent-a:main");
    await record("agent:agent-c:leaf", "agent:agent-b:mid");
    expect(findLockedAncestor("agent:agent-c:leaf", ["agent-a"])).toMatchObject({
      agentId: "agent-a",
      depth: 2,
    });
    await breakSessionStore();
    expect(lineageUnknown("agent:agent-c:leaf", ["agent-a"])).toBe(true);
  });
});

describe("a lineage chain that loops", () => {
  // **Found by the second 20% segment draw, 2026-09-01, and the comment is the
  // finding.** `resolveLineage` handled "no parent recorded" and "a cycle" in
  // one branch and returned `clear` for both, under a comment reading: *"a
  // cycle, which is not a shape the host writes; the store is on disk and this
  // is a security path, so stopping is the only safe response to a shape that
  // should not exist."*
  //
  // Stopping the **walk** is right. Returning **clear** is the fail-*open*
  // answer, and it is the opposite of what that sentence argues for. The two
  // cases are not alike: a chain that ends because a row we read has no parent
  // is proof the lineage is complete, and a chain that ends because it bit its
  // own tail is proof of nothing at all — the locked ancestor may sit beyond
  // the loop and never be visited.
  //
  // The module already answers this correctly one branch away. Reaching the
  // depth cap returns `unreadable`, on the reasoning that *"what lies above it
  // is unread rather than absent — and during an incident that is exactly the
  // shape this verdict exists to name."* A cycle is the same situation arriving
  // sooner, and finding 120 settled the principle: a lockdown whose lineage
  // cannot be established must fail closed.

  it("reports unreadable rather than clear when the chain bites its own tail", async () => {
    await record("agent:agent-a:one", "agent:agent-b:two");
    await record("agent:agent-b:two", "agent:agent-a:one");

    expect(lineageUnknown("agent:agent-a:one", ["agent-z"])).toBe(true);
  });

  it("refuses a call whose lineage loops while an incident is in force", async () => {
    // The behaviour that matters. `findLockedAncestor` returns nothing — there
    // is no *proven* locked ancestor — and the gate refuses anyway, because
    // `lineageUnknown` says the walk could not establish one.
    await record("agent:agent-a:one", "agent:agent-b:two");
    await record("agent:agent-b:two", "agent:agent-a:one");

    expect(findLockedAncestor("agent:agent-a:one", ["agent-z"])).toBeUndefined();
    expect(lineageUnknown("agent:agent-a:one", ["agent-z"])).toBe(true);
  });

  it("still finds a locked ancestor reached before the loop closes", async () => {
    // The cap must not swallow an answer the walk actually had. The locked
    // parent is one hop away and is returned as `locked`, not as unreadable.
    await record("agent:agent-a:main", "agent:agent-b:child");
    await record("agent:agent-b:child", "agent:agent-a:main");

    expect(findLockedAncestor("agent:agent-b:child", ["agent-a"])).toMatchObject({
      agentId: "agent-a",
      depth: 1,
    });
  });

  it("leaves an ordinary terminating chain clear", async () => {
    // The half that was already right, and the reason the two cases had to be
    // separated rather than both made strict: a chain that ends in a row we
    // read is complete, and calling that unreadable would refuse every governed
    // call during an incident.
    await record("agent:agent-a:main");
    await record("agent:agent-b:child", "agent:agent-a:main");

    expect(lineageUnknown("agent:agent-b:child", ["agent-z"])).toBe(false);
  });
});
