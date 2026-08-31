// T40 — the rule-request queue on the command line, against the routes it mirrors.
//
// The last capability `CLI-REFERENCE.md` §2d listed as deliberately
// dashboard-only, and the one whose reason that document itself flagged as the
// weakest of the four. What these pin is not that the commands work — a domain
// test already covers `submitRuleRequest` and `decideRuleRequest` — but that
// each command asks the **same authorization question** its HTTP counterpart
// asks, and that approving through the command line produces the same joined-up
// state the route produces.
//
// The three floors differ on purpose, because they are three roles in one
// process: a Viewer reads the queue, a User adds to it, an Administrator
// decides it. A surface that collapsed any two of those would be granting a
// privilege the route does not.
//
// The last test is the one T40 exists for. An Administrator at a terminal could
// already write the rule by hand with `policy add-rule`; what they could not do
// was leave `createdRuleId` set, so the request and the permission it produced
// were two facts with nothing joining them.
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Command } from "commander";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { registerGovernanceCommands } from "../cli/program/register.governance.js";
import { tailLedger } from "./audit-ledger.js";
import { clearCliSession, storeCliSession } from "./cli-identity.js";
import { resetLedgerKeyCacheForTests } from "./ledger-key.js";
import { loadPolicy, savePolicy } from "./policy-store.js";
import { defaultPolicyDocument } from "./policy-types.js";
import type { GovernanceRole } from "./roles.js";
import { listRuleRequests, submitRuleRequest } from "./rule-requests.js";
import { issueSession } from "./session-tokens.js";
import { seedNamedGroup } from "./test-group.js";
import { createUser } from "./user-store.js";

const TEST_GROUP = "group-requests";
const MINE = "agent-mine";
const THEIRS = "agent-theirs";
const ACTOR = { name: "bootstrap-admin", role: "root" } as const;

let dir: string;
let printed: string[];

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "governance-requests-cli-"));
  process.env.OPENCLAW_GOVERNANCE_DIR = dir;
  resetLedgerKeyCacheForTests();
  await seedNamedGroup(TEST_GROUP, [MINE, THEIRS]);
  await savePolicy(TEST_GROUP, { ...defaultPolicyDocument(), mode: "enforce" });
  printed = [];
});

afterEach(async () => {
  await clearCliSession();
  delete process.env.OPENCLAW_GOVERNANCE_DIR;
  resetLedgerKeyCacheForTests();
  vi.restoreAllMocks();
  await rm(dir, { recursive: true, force: true });
});

async function signIn(
  username: string,
  role: GovernanceRole,
  assignedAgents: string[] = [],
): Promise<void> {
  let managedBy: string | undefined;
  if (role === "user" || role === "viewer") {
    const manager = await createUser(
      {
        username: `${username}-mgr`,
        password: "correct horse battery",
        role: "administrator",
        groupId: TEST_GROUP,
      },
      ACTOR,
    );
    managedBy = manager.id;
  }
  const user = await createUser(
    {
      username,
      password: "correct horse battery",
      role,
      groupId: TEST_GROUP,
      assignedAgents,
      ...(managedBy ? { managedBy } : {}),
    },
    ACTOR,
  );
  const session = await issueSession(user);
  await storeCliSession(session.token);
}

async function runGovernance(args: readonly string[]): Promise<void> {
  const runtime = await import("../runtime.js");
  vi.spyOn(runtime.defaultRuntime, "log").mockImplementation((...parts: unknown[]) => {
    printed.push(parts.map((part) => String(part)).join(" "));
  });
  vi.spyOn(runtime.defaultRuntime, "exit").mockImplementation((() => {}) as never);
  const program = new Command();
  program.exitOverride();
  registerGovernanceCommands(program);
  await program.parseAsync(["node", "openclaw", "governance", ...args]);
}

const output = () => printed.join("\n");

/**
 * The rules an approval added, which is never the whole document: an
 * installation ships with baseline allowances so an agent is usable on first
 * boot, and asserting on `rules.length` counts those too.
 */
async function grantedRules() {
  return (await loadPolicy(TEST_GROUP)).rules.filter((rule) =>
    (rule.description ?? "").startsWith("Requested by "),
  );
}

/** A request filed directly, for the cases that start from an existing queue. */
async function seedRequest(requestedBy: string, agentId?: string): Promise<string> {
  const request = await submitRuleRequest(TEST_GROUP, {
    resourceKind: "command",
    pattern: "^git status$",
    reason: `${requestedBy} needs to read the working tree`,
    requestedBy,
    ...(agentId ? { agentId } : {}),
  });
  return request.id;
}

describe("governance requests submit — the tier that may ask", () => {
  it("lets a User file a request against an agent they hold", async () => {
    await signIn("malek", "user", [MINE]);

    await runGovernance([
      "requests",
      "submit",
      "--kind",
      "command",
      "--pattern",
      "^npm test$",
      "--reason",
      "run the suite",
      "--agent",
      MINE,
    ]);

    const [request] = await listRuleRequests(TEST_GROUP);
    expect(request?.requestedBy).toBe("malek");
    expect(request?.agentId).toBe(MINE);
    expect(request?.status).toBe("pending");
  });

  it("refuses a Viewer, which is the whole difference between the two tiers", async () => {
    // §1.6 gives the User tier "limited, scoped permissions"; a Viewer is
    // strictly read-only. Being able to ask is the capability that separates
    // them, so a Viewer filing a request would erase the distinction.
    await signIn("watcher", "viewer", [MINE]);

    await runGovernance([
      "requests",
      "submit",
      "--kind",
      "command",
      "--pattern",
      "^npm test$",
      "--reason",
      "run the suite",
    ]);

    expect(await listRuleRequests(TEST_GROUP)).toHaveLength(0);
    expect(output()).toContain("not permitted");
  });

  it("refuses a request scoped to an agent the requester does not hold", async () => {
    await signIn("malek", "user", [MINE]);

    await runGovernance([
      "requests",
      "submit",
      "--kind",
      "command",
      "--pattern",
      "^npm test$",
      "--reason",
      "run the suite",
      "--agent",
      THEIRS,
    ]);

    expect(await listRuleRequests(TEST_GROUP)).toHaveLength(0);
    expect(output()).toContain(THEIRS);
  });

  it("refuses a pattern the dashboard would refuse, rather than at approval time", async () => {
    // The same validator both other surfaces use. A request that cannot become
    // a rule wastes an Administrator's review and tells the requester nothing.
    await signIn("malek", "user", [MINE]);

    await runGovernance([
      "requests",
      "submit",
      "--kind",
      "command",
      "--pattern",
      "([a-z]+)+$",
      "--reason",
      "run the suite",
    ]);

    expect(await listRuleRequests(TEST_GROUP)).toHaveLength(0);
  });
});

describe("governance requests list — scoped to what the caller can see", () => {
  it("hides requests for agents the caller cannot view", async () => {
    // The unscoped queue was a real defect: it let an account limited to one
    // agent enumerate every other agent's id and the free-text reasons, which
    // routinely name internal hosts and paths.
    await seedRequest("someone", THEIRS);
    await seedRequest("malek", MINE);
    await signIn("malek", "user", [MINE]);

    await runGovernance(["requests", "list"]);

    expect(output()).toContain(MINE);
    expect(output()).not.toContain(THEIRS);
  });

  it("shows an installation-wide request to anyone who can read the queue", async () => {
    await seedRequest("malek");
    await signIn("watcher", "viewer", []);

    await runGovernance(["requests", "list"]);

    expect(output()).toContain("all agents");
  });

  it("says so in words when the queue is empty", async () => {
    // An empty list is indistinguishable from a failed read (finding 102).
    await signIn("amina", "administrator");

    await runGovernance(["requests", "list"]);

    expect(output()).toContain("No rule requests");
  });
});

describe("governance requests decide — the floor, and the link it exists for", () => {
  it("refuses a User: no privilege is created by a non-Administrator", async () => {
    const id = await seedRequest("malek", MINE);
    await signIn("malek", "user", [MINE]);

    await runGovernance(["requests", "decide", id, "--approve"]);

    const [request] = await listRuleRequests(TEST_GROUP);
    expect(request?.status).toBe("pending");
    expect(request?.id).toBe(id);
    expect(output()).toContain("not permitted");
  });

  it("approving writes the rule and joins it to the request", async () => {
    // The whole reason T40 is worth building. Granting by hand with
    // `policy add-rule` produces the permission and leaves the request pending
    // for ever, with nothing tying the two together.
    const id = await seedRequest("malek", MINE);
    await signIn("amina", "administrator");

    await runGovernance(["requests", "decide", id, "--approve"]);

    const [request] = await listRuleRequests(TEST_GROUP);
    const policy = await loadPolicy(TEST_GROUP);
    const granted = policy.rules.find((rule) => rule.id === request?.createdRuleId);
    expect(request?.status).toBe("approved");
    expect(request?.createdRuleId).toBeTruthy();
    expect(granted?.pattern).toBe("^git status$");
    // Exactly the scope that was reviewed. Dropping this turned every approval
    // into an installation-wide grant.
    expect(granted?.agentId).toBe(MINE);
  });

  it("records the approver and the tier they held", async () => {
    const id = await seedRequest("malek", MINE);
    await signIn("amina", "administrator");

    await runGovernance(["requests", "decide", id, "--approve"]);

    const entry = (await tailLedger(TEST_GROUP, 500)).find(
      (candidate) => candidate.toolName === "governance.rule-request.decide",
    );
    expect(entry?.actor).toBe("amina");
    expect(entry?.actorRole).toBe("administrator");
  });

  it("rejecting decides the request and creates nothing", async () => {
    const id = await seedRequest("malek", MINE);
    await signIn("amina", "administrator");

    await runGovernance(["requests", "decide", id, "--reject"]);

    const [request] = await listRuleRequests(TEST_GROUP);
    expect(request?.status).toBe("rejected");
    expect(await grantedRules()).toHaveLength(0);
  });

  it("refuses a second decision on an already-decided request", async () => {
    // Single-shot, so a stale queue in another terminal cannot double-apply.
    const id = await seedRequest("malek", MINE);
    await signIn("amina", "administrator");
    await runGovernance(["requests", "decide", id, "--approve"]);
    printed = [];

    await runGovernance(["requests", "decide", id, "--approve"]);

    expect(await grantedRules()).toHaveLength(1);
    expect(output()).toContain("no pending request");
  });

  it("applies a setting request rather than writing a rule", async () => {
    // The other arm of the one queue (T4). Applied from the **stored** request,
    // never from anything typed at the approving terminal.
    await submitRuleRequest(TEST_GROUP, {
      kind: "agent-setting",
      agentId: MINE,
      setting: "mode",
      value: "monitor",
      reason: "the agent is being re-trained",
      requestedBy: "malek",
    });
    const [seeded] = await listRuleRequests(TEST_GROUP);
    await signIn("amina", "administrator");

    await runGovernance(["requests", "decide", seeded!.id, "--approve"]);

    const policy = await loadPolicy(TEST_GROUP);
    expect(policy.agentMode?.[MINE]).toBe("monitor");
    expect(await grantedRules()).toHaveLength(0);
  });
});
