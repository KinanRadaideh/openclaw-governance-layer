// QA round 6: defects found by auditing this layer against the host and against
// adversarial concurrency, rather than against its own assumptions.
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { tailLedger } from "./audit-ledger.js";
import { DEFAULT_TIMEOUT_MS, STALE_LOCK_MS_FOR_TESTS } from "./file-lock.js";
import {
  checkLoginAllowed,
  loginThrottleKey,
  MAX_TRACKED_KEYS,
  recordLoginFailure,
  resetLoginThrottle,
} from "./login-throttle.js";
import { usersFilePath } from "./paths.js";
import { INSTALLATION_LEDGER_GROUP } from "./paths.js";
import { evaluateGovernancePolicy } from "./policy-engine.js";
import { addRule, loadPolicy, lockAgent, savePolicy } from "./policy-store.js";
import { defaultPolicyDocument } from "./policy-types.js";
import { checkRegexSafety } from "./regex-safety.js";
import { listRuleRequests, submitRuleRequest } from "./rule-requests.js";
import { seedNamedGroup } from "./test-group.js";
import { createUser, deleteUser, LastRootError, listUsers, setUserRole } from "./user-store.js";

/**
 * Every account belongs to a group (M3); these tests all live in one.
 *
 * Accounts that were Viewers or Users before M3 are Administrators here unless
 * the tier is the subject of the test. A User or Viewer now requires an
 * Administrator answerable for it, which would mean creating a second account
 * inside tests about username folding, token storage and Root invariants — and
 * changing the counts several of them assert. The tier was incidental; the
 * ceremony would not have been.
 */
const TEST_GROUP = "group-test";

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "governance-qa6-"));
  process.env.OPENCLAW_GOVERNANCE_DIR = dir;
  await seedNamedGroup(TEST_GROUP, ["agent-a", "agent-b"]);
  resetLoginThrottle();
});

afterEach(async () => {
  delete process.env.OPENCLAW_GOVERNANCE_DIR;
  resetLoginThrottle();
  await rm(dir, { recursive: true, force: true });
});

/** Time a real match so the checker is judged against behaviour, not opinion. */
function backtrackMillis(pattern: string, input: string): number {
  const regex = new RegExp(pattern);
  const start = process.hrtime.bigint();
  regex.test(input);
  return Number(process.hrtime.bigint() - start) / 1e6;
}

describe("catastrophic backtracking: ambiguous alternation", () => {
  it.each(["^(a|a)+$", "^(a|a?)+$", "(x|x)*", "^(\\s|\\s)+$", "([a-z]|[a-z])+", "(a|)+"])(
    "rejects %s",
    (pattern) => {
      expect(checkRegexSafety(pattern).safe).toBe(false);
    },
  );

  it("still accepts ordinary patterns an operator would actually write", () => {
    for (const pattern of [
      "^ls( .*)?$",
      "^git (status|log|diff)$",
      "^(api|cdn)[.]example[.]com$",
      "^workspace/.*$",
      "^.*[.]ts$",
      "^([a-z0-9.-]+[.])?example[.]com$",
      "^sleep [0-9]+$",
      "^workspace/[^/]+$",
    ]) {
      expect(checkRegexSafety(pattern), pattern).toEqual({ safe: true });
    }
  });

  it("nothing the checker accepts blows up on a hostile input", () => {
    // The empirical backstop. A checker is only as good as the behaviour it
    // predicts, so accepted patterns are actually run against the input shape
    // that triggers exponential backtracking.
    const hostile = `${"a".repeat(26)}!`;
    for (const pattern of ["^ls( .*)?$", "^a+$", "^(ab)+$", "^[a-z]+$", "^(a|b)+$"]) {
      expect(checkRegexSafety(pattern).safe, pattern).toBe(true);
      expect(backtrackMillis(pattern, hostile), pattern).toBeLessThan(50);
    }
  });
});

describe("the login throttle cannot be flushed by an attacker", () => {
  it("keeps a locked account locked when the table overflows", async () => {
    // Insertion order pinned the account under attack at the front of the
    // eviction queue, so filling the table deleted the attacker's own lockout
    // first: five guesses, a thousand junk usernames, then five more guesses.
    const victim = loginThrottleKey("root");
    for (let index = 0; index < 5; index += 1) {
      recordLoginFailure(victim);
    }
    expect(checkLoginAllowed(victim).allowed).toBe(false);

    for (let index = 0; index < MAX_TRACKED_KEYS + 1; index += 1) {
      recordLoginFailure(`throwaway-${index}`);
    }
    expect(checkLoginAllowed(victim).allowed).toBe(false);
  });

  it("folds Unicode variants of a username into one bucket", () => {
    // The throttle keyed on trim+lowercase while account lookup used NFKC, so
    // `adｍin` (fullwidth m) authenticated against the real `admin` account on a
    // fresh five-attempt quota. Every compatibility variant was a new quota.
    expect(loginThrottleKey("adｍin")).toBe("admin");
    expect(loginThrottleKey("  ADMIN ")).toBe("admin");
    expect(loginThrottleKey("Åelvin")).toBe(loginThrottleKey("Åelvin"));
  });
});

describe("the last Root cannot be removed by two requests at once", () => {
  /**
   * Puts the store into a two-Root state by writing the file directly.
   *
   * `createUser` refuses a second Root since B11, so the state cannot be built
   * through the normal path any more — but it can still *exist*: an
   * installation created before that rule, or a hand-edited `users.json`, will
   * have it. The concurrency guard has to hold for those, so the test now
   * constructs the state it is about rather than asking the API to create
   * something the API is right to refuse.
   */
  async function twoRoots() {
    await createUser({
      username: "root-a",
      password: "correct-horse",
      role: "root",
      groupId: TEST_GROUP,
    });
    const raw = JSON.parse(await readFile(usersFilePath(), "utf8")) as {
      users: Array<Record<string, unknown>>;
    };
    const first = raw.users[0] as Record<string, unknown>;
    raw.users.push({
      ...first,
      id: "user-root-b",
      username: "root-b",
    });
    await writeFile(usersFilePath(), JSON.stringify(raw), { mode: 0o600 });
    const users = await listUsers();
    return users.map((user) => user.id);
  }

  it("survives two concurrent demotions", async () => {
    // Both requests read "2 roots", both passed the snapshot guard, both wrote.
    // There is no password reset and bootstrap refuses once any account exists,
    // so zero Roots is unrecoverable.
    const [a, b] = await twoRoots();
    await Promise.allSettled([
      setUserRole(a as string, "viewer"),
      setUserRole(b as string, "viewer"),
    ]);
    const roots = (await listUsers()).filter((user) => user.role === "root");
    expect(roots.length).toBeGreaterThanOrEqual(1);
  });

  it("survives a concurrent demotion and deletion", async () => {
    const [a, b] = await twoRoots();
    await Promise.allSettled([setUserRole(a as string, "user"), deleteUser(b as string)]);
    const roots = (await listUsers()).filter((user) => user.role === "root");
    expect(roots.length).toBeGreaterThanOrEqual(1);
  });

  it("refuses the demotion of a sole Root with a typed error", async () => {
    await createUser({
      username: "only-root",
      password: "correct-horse",
      role: "root",
      groupId: TEST_GROUP,
    });
    const [only] = await listUsers();
    await expect(setUserRole(only?.id as string, "viewer")).rejects.toBeInstanceOf(LastRootError);
  });

  it("refuses deleting the sole Root while other accounts survive", async () => {
    await createUser({
      username: "only-root",
      password: "correct-horse",
      role: "root",
      groupId: TEST_GROUP,
    });
    await createUser({
      username: "analyst",
      password: "correct-horse",
      role: "administrator",
      groupId: TEST_GROUP,
    });
    const root = (await listUsers()).find((user) => user.role === "root");
    await expect(deleteUser(root?.id as string)).rejects.toBeInstanceOf(LastRootError);
  });

  it("allows removing the very last account, which is a teardown not a lockout", async () => {
    // With no accounts left, bootstrap becomes available again, so this is
    // recoverable — unlike leaving Root-less accounts behind.
    await createUser({
      username: "only-root",
      password: "correct-horse",
      role: "root",
      groupId: TEST_GROUP,
    });
    const [only] = await listUsers();
    await expect(deleteUser(only?.id as string)).resolves.toBe(true);
    expect(await listUsers()).toHaveLength(0);
  });

  it("still allows demoting one of two Roots", async () => {
    const [a] = await twoRoots();
    await expect(setUserRole(a as string, "administrator")).resolves.toBe(true);
  });
});

describe("the rule-request cap holds when the queue is full of pending items", () => {
  it("does not return the whole decided history once pending fills the budget", async () => {
    // `decided.slice(-0)` is `slice(0)` — the entire array. The cap silently
    // stopped existing the moment `keepDecided` reached zero, and the existing
    // test decided every request immediately so it never reached that branch.
    const { MAX_STORED_RULE_REQUESTS } = await import("./rule-requests.js");
    for (let index = 0; index < 40; index += 1) {
      await submitRuleRequest(TEST_GROUP, {
        resourceKind: "command",
        pattern: `^cmd-${index}$`,
        reason: "load",
        requestedBy: `user-${index % 5}`,
      });
    }
    expect((await listRuleRequests(TEST_GROUP)).length).toBeLessThanOrEqual(
      MAX_STORED_RULE_REQUESTS,
    );
  });
});

describe("the kill switch is not suspended by monitor mode", () => {
  it("blocks a locked agent even when the posture is monitor", async () => {
    // Monitor means policy *decisions* are recorded rather than acted on. The
    // kill switch is not a policy decision — it is a person deciding, during an
    // incident, that this agent stops now. Once monitor became the shipped
    // default, treating the stop as advisory meant a fresh install had an
    // emergency stop that did not stop anything.
    await savePolicy(TEST_GROUP, { ...defaultPolicyDocument(), mode: "monitor" });
    await lockAgent(TEST_GROUP, "agent-a");
    const decision = await evaluateGovernancePolicy(
      { toolName: "exec", params: { command: "ls" } },
      { agentId: "agent-a" },
    );
    expect(decision).toEqual({
      block: true,
      blockReason: expect.stringContaining("locked down"),
    });
  });

  it("records the stop even when the posture is off, and does not block", async () => {
    // `off` is the one posture that exempts it, because `off` means the gate is
    // not running at all rather than running quietly.
    await savePolicy(TEST_GROUP, { ...defaultPolicyDocument(), mode: "off" });
    await lockAgent(TEST_GROUP, "agent-a");
    expect(
      await evaluateGovernancePolicy(
        { toolName: "exec", params: { command: "ls" } },
        { agentId: "agent-a" },
      ),
    ).toBeUndefined();
  });
});

describe("the agent id is resolved from the session when it is not passed explicitly", () => {
  // B6 and B7 shared one root cause: the blocking path read `ctx.agentId` only,
  // while the termination path already fell back to the session key. The two
  // disagreed about which agent a call belonged to.
  beforeEach(async () => {
    await savePolicy(TEST_GROUP, { ...defaultPolicyDocument(), mode: "enforce", ask: "off" });
  });

  it("blocks a locked agent identified only by its session key (B6)", async () => {
    await lockAgent(TEST_GROUP, "agent-a");
    const decision = await evaluateGovernancePolicy(
      { toolName: "exec", params: { command: "ls" } },
      // No agentId — exactly the shape that slipped past the kill switch.
      { sessionKey: "agent:agent-a:main" },
    );
    expect(decision && "block" in decision).toBe(true);
  });

  it("records the lockdown against the agent, not against 'unknown'", async () => {
    await lockAgent(TEST_GROUP, "agent-a");
    await evaluateGovernancePolicy(
      { toolName: "exec", params: { command: "ls" } },
      { sessionKey: "agent:agent-a:main" },
    );
    const entry = (await tailLedger(TEST_GROUP)).at(-1);
    expect(entry?.agentId).toBe("agent-a");
  });

  it("keeps an agent-scoped rule from authorizing a different agent by session key", async () => {
    await addRule(
      TEST_GROUP,
      { resourceKind: "command", pattern: "^ls$", agentId: "agent-a" },
      "tester",
    );
    const allowed = await evaluateGovernancePolicy(
      { toolName: "exec", params: { command: "ls" } },
      { sessionKey: "agent:agent-a:main" },
    );
    expect(allowed).toBeUndefined();
    const blocked = await evaluateGovernancePolicy(
      { toolName: "exec", params: { command: "ls" } },
      { sessionKey: "agent:agent-b:main" },
    );
    expect(blocked && "block" in blocked).toBe(true);
  });

  it("leaves the agent genuinely unknown when the session key is not an agent key", async () => {
    // The fallback must not invent an identity. A non-agent session key yields
    // no agent, and the call is governed as unattributed rather than being
    // wrongly bound to someone.
    //
    // **The entry moved installation-wide at M5, and that follows from the
    // model rather than being a workaround.** A call the gate cannot attribute
    // belongs to no organisation, so there is no organisation's ledger to write
    // it to — see `INSTALLATION_LEDGER_GROUP`. Writing it to some group would
    // mean choosing one, and an unattributable call is exactly the shape where
    // choosing is guessing.
    await lockAgent(TEST_GROUP, "agent-a");
    const decision = await evaluateGovernancePolicy(
      { toolName: "exec", params: { command: "ls" } },
      { sessionKey: "channel:whatsapp:12345" },
    );
    expect(decision && "block" in decision && decision.block).toBeTruthy();
    const entry = (await tailLedger(INSTALLATION_LEDGER_GROUP)).at(-1);
    expect(entry?.agentId).toBe("unknown");
  });
});

describe("QA pass: corrupted settings must not resolve to the more permissive branch", () => {
  it("treats an unparseable per-agent ask override as absent", async () => {
    // A hand-edited or truncated policy.json. The old code cast the value
    // straight to AskMode; the engine tests `=== "off"`, so anything
    // unrecognised fell through to "ask a human" — which can end in allow,
    // while `off` denies outright.
    await savePolicy(TEST_GROUP, {
      ...defaultPolicyDocument(),
      mode: "enforce",
      ask: "off",
      agentAsk: { "agent-a": "yes-please" as never },
    });
    const decision = await evaluateGovernancePolicy(
      { toolName: "exec", params: { command: "rm -rf /" } },
      { agentId: "agent-a" },
    );
    // Falls back to the installation default, which is `off` -> deny.
    expect(decision && "block" in decision).toBe(true);
  });

  it("drops the bad entry on load rather than carrying it in memory", async () => {
    await savePolicy(TEST_GROUP, {
      ...defaultPolicyDocument(),
      agentAsk: { good: "off", bad: 42 as never },
    });
    const doc = await loadPolicy(TEST_GROUP);
    expect(doc.agentAsk).toEqual({ good: "off" });
  });

  it("still honours a valid per-agent override", async () => {
    await savePolicy(TEST_GROUP, {
      ...defaultPolicyDocument(),
      mode: "enforce",
      ask: "off",
      agentAsk: { "agent-a": "on-miss" },
    });
    const decision = await evaluateGovernancePolicy(
      { toolName: "exec", params: { command: "whatever" } },
      { agentId: "agent-a" },
    );
    expect(decision && "requireApproval" in decision).toBe(true);
  });
});

describe("QA pass: a crashed process must not wedge the lock past the wait", () => {
  it("declares a lock abandoned well before a waiter gives up", async () => {
    // The reaper only runs inside a waiting caller, so a staleness threshold at
    // or above the wait timeout makes it dead code: every waiter times out
    // before the lock becomes reclaimable, and a crash wedges governance writes
    // until somebody deletes the file by hand.
    expect(STALE_LOCK_MS_FOR_TESTS).toBeLessThan(DEFAULT_TIMEOUT_MS);
  });
});
