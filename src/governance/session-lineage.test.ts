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
import { mkdtemp, rm } from "node:fs/promises";
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
