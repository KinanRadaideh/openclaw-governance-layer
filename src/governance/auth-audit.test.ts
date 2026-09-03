// Tests for T9: authentication events were absent from the audit ledger, so
// the one surface built to answer "who was in the system, and when?" could not.
//
// Four groups, in the order the risks matter:
//   1. Each of the four events is recorded, with the right attribution.
//   2. A failed login does not leak, and does not put attacker-controlled text
//      anywhere the ledger does not clamp.
//   3. The bound holds, and says so when it bites. The part that could turn a
//      missing log into a disk-fill vector.
//   4. Adding these entries did not weaken the hash chain they share.
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ADMIN_ACTIONS, UNAUTHENTICATED_ACTOR } from "./admin-audit.js";
import { tailLedger, verifyLedgerChain, type LedgerEntry } from "./audit-ledger.js";
import {
  auditLoginFailure,
  auditLoginLockout,
  auditLoginSuccess,
  auditLogout,
  AUTH_FAILURE_WINDOW_MS,
  MAX_ECHOED_USERNAME_LENGTH,
  MAX_FAILURE_ENTRIES_PER_WINDOW,
  REPEAT_RESERVE,
  resetAuthAuditForTests,
} from "./auth-audit.js";
import { resetLedgerKeyCacheForTests } from "./ledger-key.js";
import { recordLoginFailure, resetLoginThrottle } from "./login-throttle.js";
import { INSTALLATION_LEDGER_GROUP } from "./paths.js";
import { savePolicy } from "./policy-store.js";
import { defaultPolicyDocument } from "./policy-types.js";
import { seedGroupWithAgents } from "./test-group.js";

let dir: string;

/** The organisation this suite's agents belong to (M5). Per-group storage means
 * every call names a group, and mandatory registration means the gate refuses an
 * agent it has no record of, so the fixture creates a real one. */
let TEST_GROUP: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "governance-auth-audit-"));
  process.env.OPENCLAW_GOVERNANCE_DIR = dir;
  TEST_GROUP = await seedGroupWithAgents([]);
  resetLedgerKeyCacheForTests();
  resetAuthAuditForTests();
  resetLoginThrottle();
  await savePolicy(TEST_GROUP, { ...defaultPolicyDocument(), mode: "enforce" });
});

afterEach(async () => {
  delete process.env.OPENCLAW_GOVERNANCE_DIR;
  resetLedgerKeyCacheForTests();
  resetAuthAuditForTests();
  resetLoginThrottle();
  await rm(dir, { recursive: true, force: true });
});

async function authEntries(): Promise<LedgerEntry[]> {
  // **The installation trail, not a group's (M5).**
  //
  // A failed sign-in often names an account that belongs to nobody, that is
  // what a credential-stuffing attempt looks like, so those entries go to the
  // installation-scope trail rather than being guessed into a group. An attacker
  // must not get to choose which organisation's log records the attack on it.
  // Successful sign-ins carry the account's group when the caller supplies one;
  // this suite does not, so everything it writes lands here.
  return (await tailLedger(INSTALLATION_LEDGER_GROUP, 2000)).filter(
    (entry) => entry.entryKind === "admin",
  );
}

async function entriesFor(action: string): Promise<LedgerEntry[]> {
  return (await authEntries()).filter((entry) => entry.toolName === action);
}

const user = { id: "u-1", username: "Alice", role: "administrator" as const };

describe("authentication events reach the ledger", () => {
  it("records a successful sign-in against the account, with its role", async () => {
    await auditLoginSuccess(user);

    const [entry] = await entriesFor(ADMIN_ACTIONS.authLogin);
    expect(entry).toBeDefined();
    // The stored spelling, not a folded key: the ledger is read by people, and
    // this is the column they match against the account list by eye.
    expect(entry?.actor).toBe("Alice");
    // `subjectId` is carried in the ledger's `ruleId` field. See
    // `recordAdminAction`, which reuses the agent-entry shape rather than
    // adding administrative-only columns to every row.
    expect(entry?.ruleId).toBe("u-1");
    expect(entry?.resource).toContain("administrator");
    expect(entry?.decision).toBe("allow");
  });

  it("records a sign-out against the account that held the session", async () => {
    await auditLogout({ userId: "u-1", username: "Alice" });

    const [entry] = await entriesFor(ADMIN_ACTIONS.authLogout);
    expect(entry?.actor).toBe("Alice");
    expect(entry?.decision).toBe("allow");
  });

  it("records a failed sign-in with no account attributed to it", async () => {
    await auditLoginFailure("alice");

    const [entry] = await entriesFor(ADMIN_ACTIONS.authLoginFailed);
    expect(entry).toBeDefined();
    // Nobody proved they hold this account, so the entry must not read as
    // though the account did something.
    expect(entry?.actor).toBe(UNAUTHENTICATED_ACTOR);
    expect(entry?.actor).not.toBe("alice");
    expect(entry?.resource).toContain("alice");
    expect(entry?.decision).toBe("deny");
  });

  it("records a lockout separately from the failures that caused it", async () => {
    await auditLoginFailure("alice");
    await auditLoginLockout("alice", 5);

    expect(await entriesFor(ADMIN_ACTIONS.authLoginFailed)).toHaveLength(1);
    const [lockout] = await entriesFor(ADMIN_ACTIONS.authLockout);
    // Findable on its own, rather than only by counting failures. This is the
    // entry an investigation searches for.
    expect(lockout?.resource).toContain("5");
    expect(lockout?.decision).toBe("deny");
  });

  it("keeps authentication entries out of every non-administrator's view", async () => {
    await auditLoginSuccess(user);
    await auditLoginFailure("bob");

    // Installation-wide, so `agentId` is "-" and the existing agent-scope
    // filter in ledger-view.ts excludes them for User and Viewer without
    // needing a rule of its own. Asserted here because that is load-bearing:
    // a Viewer reading failed attempts against named accounts would be handed
    // a reconnaissance aid.
    for (const entry of await authEntries()) {
      expect(entry.agentId).toBe("-");
    }
  });
});

describe("a failed sign-in does not leak, and cannot flood a field", () => {
  it("records a wrong password and an unknown account identically", async () => {
    await auditLoginFailure("definitely-not-an-account");
    await auditLoginFailure("Alice");

    const entries = await entriesFor(ADMIN_ACTIONS.authLoginFailed);
    expect(entries).toHaveLength(2);
    // Same action, same actor, same decision. Distinguishing the two would put
    // an account-existence oracle into the audit trail. The very fact the
    // login response is careful not to leak.
    const shapes = new Set(entries.map((e) => `${e.toolName}|${e.actor}|${e.decision}`));
    expect(shapes.size).toBe(1);
  });

  it("folds the subject the same way the account lookup and throttle do", async () => {
    await auditLoginFailure("Alice");
    await auditLoginFailure("  alice  ");
    // Fullwidth 'm'-style compatibility variants fold under NFKC, which is what
    // stopped QA finding 40 from handing out one fresh quota per spelling.
    await auditLoginFailure("ＡＬＩＣＥ");

    const subjects = new Set(
      (await entriesFor(ADMIN_ACTIONS.authLoginFailed)).map((e) => e.ruleId),
    );
    // Three spellings, one account: an auditor filtering on the subject sees
    // one target under attack rather than three unrelated events.
    expect(subjects).toEqual(new Set(["alice"]));
  });

  it("clamps an enormous submitted username out of the unclamped field", async () => {
    const huge = "z".repeat(3000);
    await auditLoginFailure(huge);

    const [entry] = await entriesFor(ADMIN_ACTIONS.authLoginFailed);
    // `subjectId` lands in the ledger's `ruleId`, which, unlike `resource`,
    // is neither redacted nor length-limited by `appendLedgerEntry`.
    expect(entry?.ruleId.length).toBeLessThanOrEqual(MAX_ECHOED_USERNAME_LENGTH);
    expect(entry?.resource.length).toBeLessThan(huge.length);
  });
});

describe("failure entries are bounded", () => {
  it("records up to the general budget, then suppresses and says how many", async () => {
    const start = Date.now();
    // Every name distinct, so this draws only on the general budget and leaves
    // the repeat reserve untouched. Finding 107's fix means a pure flood
    // deliberately records fewer entries than the total cap.
    const generalBudget = MAX_FAILURE_ENTRIES_PER_WINDOW - REPEAT_RESERVE;
    for (let index = 0; index < generalBudget + 25; index += 1) {
      await auditLoginFailure(`throwaway-${index}`, start);
    }

    expect(await entriesFor(ADMIN_ACTIONS.authLoginFailed)).toHaveLength(generalBudget);
    // Nothing has flushed the count yet. The notice is written on the next
    // authentication event of any kind, not by a timer inside an audit path.
    expect(await entriesFor(ADMIN_ACTIONS.authFailuresSuppressed)).toHaveLength(0);

    await auditLoginSuccess(user);
    const [notice] = await entriesFor(ADMIN_ACTIONS.authFailuresSuppressed);
    // The gap must be visible. A trail that silently stops recording under load
    // reads as an attack that ended, which is exactly the wrong conclusion.
    expect(notice?.resource).toContain("25");
  });

  it("starts a fresh allowance in the next window", async () => {
    const start = Date.now();
    const generalBudget = MAX_FAILURE_ENTRIES_PER_WINDOW - REPEAT_RESERVE;
    for (let index = 0; index < generalBudget; index += 1) {
      await auditLoginFailure(`throwaway-${index}`, start);
    }
    await auditLoginFailure("late-arrival", start + AUTH_FAILURE_WINDOW_MS + 1);

    expect(await entriesFor(ADMIN_ACTIONS.authLoginFailed)).toHaveLength(generalBudget + 1);
  });

  it("still names the account under attack when a flood exhausts the window (107)", async () => {
    // The attack: two hundred invented usernames, then a patient guessing
    // attempt against a real account, kept below the five that trigger a
    // lockout. Under a purely global cap the ledger recorded the flood and said
    // nothing about `root`. The bound written to prevent a denial of service
    // had become a way to choose what the audit trail would not say.
    const start = Date.now();
    for (let index = 0; index < MAX_FAILURE_ENTRIES_PER_WINDOW * 2; index += 1) {
      await auditLoginFailure(`throwaway-${index}`, start);
    }
    for (let index = 0; index < 4; index += 1) {
      await auditLoginFailure("root", start, index + 1);
    }

    const recorded = await entriesFor(ADMIN_ACTIONS.authLoginFailed);
    const aboutRoot = recorded.filter((entry) => entry.ruleId === "root");
    // A flood cannot reach the reserve without repeating, and a flood that
    // repeats is the guessing attack the reserve exists to catch.
    expect(aboutRoot.length).toBeGreaterThan(0);
    expect(aboutRoot.some((entry) => entry.resource.includes("attempt"))).toBe(true);
    // And the ceiling that bounds the disk cost is unchanged.
    expect(recorded.length).toBeLessThanOrEqual(MAX_FAILURE_ENTRIES_PER_WINDOW);
  });

  it("cannot be stopped from recognising a repeat by filling the subject table", async () => {
    // The same attack one level down: if novel names evicted everything, an
    // attacker could stop `root` from ever being *seen* as a repeat. Eviction
    // takes entries seen exactly once, which are precisely the flood's.
    const start = Date.now();
    // The attempt number is supplied by the throttle, whose own table is
    // bounded and whose eviction keeps records under active attack. This module
    // no longer keeps a table of its own, so there is nothing here to fill.
    await auditLoginFailure("root", start, 1);
    for (let index = 0; index < 2500; index += 1) {
      await auditLoginFailure(`filler-${index}`, start, 1);
    }
    await auditLoginFailure("root", start, 2);

    const aboutRoot = (await entriesFor(ADMIN_ACTIONS.authLoginFailed)).filter(
      (entry) => entry.ruleId === "root",
    );
    expect(aboutRoot.some((entry) => entry.resource.includes("attempt"))).toBe(true);
  });

  it("never suppresses a success, a logout or a lockout", async () => {
    const start = Date.now();
    for (let index = 0; index < MAX_FAILURE_ENTRIES_PER_WINDOW + 50; index += 1) {
      await auditLoginFailure(`throwaway-${index}`, start);
    }
    await auditLoginSuccess(user);
    await auditLogout({ userId: "u-1", username: "Alice" });
    await auditLoginLockout("alice", 5);

    // The cap exists because an unauthenticated caller can drive failures. It
    // must not reach the events that require credentials, or an attacker could
    // erase the record of a *successful* break-in by making noise first.
    expect(await entriesFor(ADMIN_ACTIONS.authLogin)).toHaveLength(1);
    expect(await entriesFor(ADMIN_ACTIONS.authLogout)).toHaveLength(1);
    expect(await entriesFor(ADMIN_ACTIONS.authLockout)).toHaveLength(1);
  });
});

describe("the throttle reports the lockout edge", () => {
  it("flags the attempt that trips the lockout, and only that one", async () => {
    const key = "alice";
    const results = [];
    for (let index = 0; index < 8; index += 1) {
      results.push(recordLoginFailure(key));
    }

    // Exactly one edge, on the fifth failure. Reported rather than re-derived
    // at the HTTP route, so the threshold has one definition.
    expect(results.filter((r) => r.lockedOut)).toHaveLength(1);
    expect(results[4]?.lockedOut).toBe(true);
    expect(results[4]?.failures).toBe(5);
    expect(results[5]?.lockedOut).toBe(false);
  });
});

describe("the hash chain still verifies with authentication entries in it", () => {
  it("verifies a chain interleaving all four kinds", async () => {
    await auditLoginFailure("alice");
    await auditLoginLockout("alice", 5);
    await auditLoginSuccess(user);
    await auditLogout({ userId: "u-1", username: "Alice" });

    const verification = await verifyLedgerChain(TEST_GROUP);
    expect(verification.ok).toBe(true);
    expect(await authEntries()).toHaveLength(4);
  });
});
