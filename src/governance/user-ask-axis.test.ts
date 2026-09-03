// A1 follow-up: the per-user escalation axis, resolved for the account that
// actually asked.
//
// §1.6 gives Root a per-*user* escalation setting. Applying it needs to know
// which person is behind a run, and before prompting existed there was no way
// to know, so the engine approximated it as "every account this agent is
// assigned to" and took the strictest of their settings. A1 made the asker
// knowable: a governance prompt carries the account in its own session key.
//
// Two things had to be true before the exact answer could be given, and the
// first was not:
//
//   1. `userAsk` had to be one key space. It was keyed by whatever spelling
//      Root typed at the HTTP route, while the engine looked it up under the
//      spelling stored in `users.json`. An override set for `alice` on an
//      account created as `Alice` was written, displayed, and never read.
//   2. The parser and the builder of the session key had to agree, which is
//      asserted here as a round trip rather than as two separate shapes.
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { canonicalAccountName, isSafeAccountKey } from "./account-name.js";
import { governanceSessionKey, parseGovernanceSessionKey } from "./agent-conversation.js";
import { resetLedgerCursorForTests } from "./audit-ledger.js";
import { evaluateGovernancePolicy } from "./policy-engine.js";
import { loadPolicy, savePolicy, setUserAskMode } from "./policy-store.js";
import { defaultPolicyDocument } from "./policy-types.js";
import { seedNamedGroup } from "./test-group.js";
import { createUser, setUserAssignedAgents } from "./user-store.js";

/**
 * Every account belongs to a group (M3); these tests all live in one.
 *
 * Accounts that were Viewers or Users before M3 are Administrators here unless
 * the tier is the subject of the test. A User or Viewer now requires an
 * Administrator answerable for it, which would mean creating a second account
 * inside tests about username folding, token storage and Root invariants, and
 * changing the counts several of them assert. The tier was incidental; the
 * ceremony would not have been.
 */
const TEST_GROUP = "group-test";

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "governance-userask-"));
  process.env.OPENCLAW_GOVERNANCE_DIR = dir;
  await seedNamedGroup(TEST_GROUP, ["agent-a", "agent-b"]);
  resetLedgerCursorForTests();
  await savePolicy(TEST_GROUP, { ...defaultPolicyDocument(), mode: "enforce", ask: "on-miss" });
});

afterEach(async () => {
  delete process.env.OPENCLAW_GOVERNANCE_DIR;
  resetLedgerCursorForTests();
  await rm(dir, { recursive: true, force: true });
});

/** An account assigned one agent, created the way the dashboard creates one. */
async function accountFor(username: string, agentId: string) {
  const user = await createUser(
    { username, password: "correct-horse-battery", role: "administrator", groupId: TEST_GROUP },
    "root",
  );
  await setUserAssignedAgents(user.id, [agentId], "root");
  return user;
}

/** An unlisted command, so every call below is a policy *miss*. */
const MISS = { toolName: "exec", params: { command: "rm -rf /" } };

describe("the session key round-trips through its own parser", () => {
  it("recovers the agent and the account it was built from", () => {
    const key = governanceSessionKey("agent-a", "Malek");
    expect(parseGovernanceSessionKey(key)).toEqual({ agentId: "agent-a", username: "malek" });
  });

  it("survives an account name containing the key's own separator", () => {
    // A username may legally contain a colon, which is why the segment is
    // percent-encoded. If encoding and decoding disagreed here, two accounts
    // could share one conversation, and one could read the other's prompts.
    const key = governanceSessionKey("agent-a", "a:b");
    expect(parseGovernanceSessionKey(key)?.username).toBe("a:b");
    expect(parseGovernanceSessionKey(governanceSessionKey("agent-a", "a"))?.username).toBe("a");
  });

  it("folds Unicode variants of one account onto one key", () => {
    // Fullwidth 'ｍ'. QA finding 40 was this exact spelling defeating the login
    // throttle; the fold is now shared, so it cannot diverge here.
    const key = governanceSessionKey("agent-a", "malｅk");
    expect(parseGovernanceSessionKey(key)?.username).toBe(canonicalAccountName("malｅk"));
  });

  it("declines every session key it did not write", () => {
    // The engine reads this to decide *whose* restriction applies, so a loose
    // parser is a way to select that. Anything but the exact shape is "not a
    // governance run", which falls back to the safe approximation.
    for (const key of [
      "agent:agent-a:main",
      "agent:agent-a:discord:123",
      "agent:agent-a:subagent:uuid",
      "agent:agent-a:governance:",
      "agent:agent-a:governance:malek:extra",
      "governance:malek",
      "agent:agent-a:governance:%zz",
      "",
      undefined,
    ]) {
      expect(parseGovernanceSessionKey(key)).toBeUndefined();
    }
  });
});

describe("userAsk is one key space", () => {
  it("applies an override set under a different spelling of the same account", async () => {
    // The defect this fixes: written under one spelling, read under another,
    // so the control silently did nothing. Root types `MALEK`; the account is
    // stored as `Malek`.
    await accountFor("Malek", "agent-a");
    await setUserAskMode(TEST_GROUP, "MALEK", "off", "root");
    const decision = await evaluateGovernancePolicy(MISS, { agentId: "agent-a" });
    expect(decision && "block" in decision).toBe(true);
  });

  it("stores the canonical key, so clearing it under any spelling works", async () => {
    await accountFor("Malek", "agent-a");
    await setUserAskMode(TEST_GROUP, "Malek", "off", "root");
    expect(Object.keys((await loadPolicy(TEST_GROUP)).userAsk)).toEqual(["malek"]);
    await setUserAskMode(TEST_GROUP, "  malek  ", undefined, "root");
    expect((await loadPolicy(TEST_GROUP)).userAsk).toEqual({});
  });

  it("rejects a name that folds onto a prototype key", () => {
    // Folding lowercases, so the guard has to run *after* it. `__PROTO__`
    // passes a check on the raw input and arrives as `__proto__`; making the
    // key space canonical without moving the guard would have introduced a
    // prototype-pollution route that did not previously exist.
    expect(isSafeAccountKey(canonicalAccountName("__PROTO__"))).toBe(false);
    expect(isSafeAccountKey(canonicalAccountName("Constructor"))).toBe(false);
    expect(isSafeAccountKey(canonicalAccountName("malek"))).toBe(true);
  });
});

describe("a governance prompt resolves the axis for the account that asked", () => {
  it("applies the asking account's own setting", async () => {
    await accountFor("malek", "agent-a");
    await setUserAskMode(TEST_GROUP, "malek", "off", "root");
    const decision = await evaluateGovernancePolicy(MISS, {
      sessionKey: governanceSessionKey("agent-a", "malek"),
    });
    expect(decision && "block" in decision).toBe(true);
  });

  it("does not apply a co-assigned account's setting to somebody else's prompt", async () => {
    // The correction, and the one case where the exact answer is *less* strict
    // than the approximation. Kinan and Malek both hold agent-a; Root has
    // restricted Malek. A prompt from Kinan is Kinan's run, and Malek's
    // restriction has nothing to say about it.
    await accountFor("kinan", "agent-a");
    await accountFor("malek", "agent-a");
    await setUserAskMode(TEST_GROUP, "malek", "off", "root");

    const malek = await evaluateGovernancePolicy(MISS, {
      sessionKey: governanceSessionKey("agent-a", "malek"),
    });
    expect(malek && "block" in malek).toBe(true);

    const kinan = await evaluateGovernancePolicy(MISS, {
      sessionKey: governanceSessionKey("agent-a", "kinan"),
    });
    expect(kinan && "requireApproval" in kinan).toBe(true);
  });

  it("still takes the strictest for a run nobody started by name", async () => {
    // Unchanged, and deliberately: on a Discord message or a cron run there is
    // no named asker, so the agent acts on behalf of everyone who holds it and
    // the approximation is the right answer.
    await accountFor("kinan", "agent-a");
    await accountFor("malek", "agent-a");
    await setUserAskMode(TEST_GROUP, "malek", "off", "root");
    const decision = await evaluateGovernancePolicy(MISS, {
      sessionKey: "agent:agent-a:discord:channel-1",
    });
    expect(decision && "block" in decision).toBe(true);
  });

  it("cannot be used to select a laxer identity across agents", async () => {
    // The key names the agent as well as the account. If the two disagree,
    // which round 14 showed is reachable, since a spawned child runs under one
    // identity while carrying a key minted for another, the exact path is
    // abandoned rather than trusted, or the axis becomes a way to choose whose
    // restriction applies.
    await accountFor("malek", "agent-b");
    await setUserAskMode(TEST_GROUP, "malek", "off", "root");
    const decision = await evaluateGovernancePolicy(MISS, {
      agentId: "agent-b",
      sessionKey: governanceSessionKey("agent-a", "kinan"),
    });
    expect(decision && "block" in decision).toBe(true);
  });

  it("leaves the agent axis able to override a permissive account", async () => {
    // The per-agent axis is how you constrain an *agent*, and it is untouched:
    // the two axes still combine as the stricter of the pair, so making the
    // user axis exact cannot loosen a restriction placed on the agent.
    await accountFor("kinan", "agent-a");
    await setUserAskMode(TEST_GROUP, "kinan", "on-miss", "root");
    await savePolicy(TEST_GROUP, {
      ...(await loadPolicy(TEST_GROUP)),
      agentAsk: { "agent-a": "off" },
    });
    const decision = await evaluateGovernancePolicy(MISS, {
      sessionKey: governanceSessionKey("agent-a", "kinan"),
    });
    expect(decision && "block" in decision).toBe(true);
  });

  it("costs nothing when nobody has set a per-user override", async () => {
    // The axis reads the user store, which is a second file read on the gate's
    // hot path. It stays skipped entirely when the feature is unused, and the
    // exact path skips it even when it is used, because the key already names
    // the account.
    await accountFor("kinan", "agent-a");
    const decision = await evaluateGovernancePolicy(MISS, {
      sessionKey: governanceSessionKey("agent-a", "kinan"),
    });
    expect(decision && "requireApproval" in decision).toBe(true);
  });
});
