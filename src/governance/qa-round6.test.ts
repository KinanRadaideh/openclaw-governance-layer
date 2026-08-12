// QA round 6: defects found by auditing this layer against the host and against
// adversarial concurrency, rather than against its own assumptions.
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  checkLoginAllowed,
  loginThrottleKey,
  MAX_TRACKED_KEYS,
  recordLoginFailure,
  resetLoginThrottle,
} from "./login-throttle.js";
import { evaluateGovernancePolicy } from "./policy-engine.js";
import { lockAgent, savePolicy } from "./policy-store.js";
import { defaultPolicyDocument } from "./policy-types.js";
import { checkRegexSafety } from "./regex-safety.js";
import { listRuleRequests, submitRuleRequest } from "./rule-requests.js";
import { createUser, deleteUser, LastRootError, listUsers, setUserRole } from "./user-store.js";

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "governance-qa6-"));
  process.env.OPENCLAW_GOVERNANCE_DIR = dir;
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
  async function twoRoots() {
    await createUser({ username: "root-a", password: "correct-horse", role: "root" });
    await createUser({ username: "root-b", password: "correct-horse", role: "root" });
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
    await createUser({ username: "only-root", password: "correct-horse", role: "root" });
    const [only] = await listUsers();
    await expect(setUserRole(only?.id as string, "viewer")).rejects.toBeInstanceOf(LastRootError);
  });

  it("refuses deleting the sole Root while other accounts survive", async () => {
    await createUser({ username: "only-root", password: "correct-horse", role: "root" });
    await createUser({ username: "analyst", password: "correct-horse", role: "viewer" });
    const root = (await listUsers()).find((user) => user.role === "root");
    await expect(deleteUser(root?.id as string)).rejects.toBeInstanceOf(LastRootError);
  });

  it("allows removing the very last account, which is a teardown not a lockout", async () => {
    // With no accounts left, bootstrap becomes available again, so this is
    // recoverable — unlike leaving Root-less accounts behind.
    await createUser({ username: "only-root", password: "correct-horse", role: "root" });
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
      await submitRuleRequest({
        resourceKind: "command",
        pattern: `^cmd-${index}$`,
        reason: "load",
        requestedBy: `user-${index % 5}`,
      });
    }
    expect((await listRuleRequests()).length).toBeLessThanOrEqual(MAX_STORED_RULE_REQUESTS);
  });
});

describe("the kill switch is not suspended by monitor mode", () => {
  it("blocks a locked agent even when the posture is monitor", async () => {
    // Monitor means policy *decisions* are recorded rather than acted on. The
    // kill switch is not a policy decision — it is a person deciding, during an
    // incident, that this agent stops now. Once monitor became the shipped
    // default, treating the stop as advisory meant a fresh install had an
    // emergency stop that did not stop anything.
    await savePolicy({ ...defaultPolicyDocument(), mode: "monitor" });
    await lockAgent("agent-a");
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
    await savePolicy({ ...defaultPolicyDocument(), mode: "off" });
    await lockAgent("agent-a");
    expect(
      await evaluateGovernancePolicy(
        { toolName: "exec", params: { command: "ls" } },
        { agentId: "agent-a" },
      ),
    ).toBeUndefined();
  });
});
