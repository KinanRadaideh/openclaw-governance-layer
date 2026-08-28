// Who may write policy, and for whom.
//
// The tier model has two axes and they are easy to conflate. *Role* grants
// authority; *assignment* grants reach. Writing a rule needs both, and which
// rule you may write depends on the second:
//
//   - A **global** rule (no `agentId`) binds every agent, so it is not
//     "managing your agent" — it is managing everyone's. Administrator and Root.
//   - An **agent-scoped** rule binds one workload. User and above, for the
//     agents an Administrator assigned them.
//   - A **Viewer** writes nothing at all, at either scope, however many agents
//     they were assigned. Assignment grants visibility; the role grants
//     authority; both are required.
//
// Asserted as an exact 403 rather than "some 4xx", for the reason the privilege
// matrix gives: a route that starts accepting a lower tier but still rejects
// the body keeps passing a loose assertion while the escalation is wide open.
import { mkdtemp, rm } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resetLedgerKeyCacheForTests } from "../governance/ledger-key.js";
import { loadPolicy, savePolicy } from "../governance/policy-store.js";
import { defaultPolicyDocument } from "../governance/policy-types.js";
import type { GovernanceRole } from "../governance/roles.js";
import type { GovernanceSession } from "../governance/session-tokens.js";
import { seedGroupWithAgents } from "../governance/test-group.js";
import { handleGovernanceApiRequest } from "./governance-dashboard-api.js";

let dir: string;

/** The organisation this suite's agents belong to (M5). Per-group storage means
 * every call names a group, and mandatory registration means the gate refuses an
 * agent it has no record of, so the fixture creates a real one. */
let TEST_GROUP: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "governance-authoring-"));
  process.env.OPENCLAW_GOVERNANCE_DIR = dir;
  TEST_GROUP = await seedGroupWithAgents(["any-agent", "mine", "someone-elses-agent", "theirs"]);
  resetLedgerKeyCacheForTests();
  await savePolicy(TEST_GROUP, { ...defaultPolicyDocument(), mode: "enforce", ask: "off" });
});

afterEach(async () => {
  delete process.env.OPENCLAW_GOVERNANCE_DIR;
  resetLedgerKeyCacheForTests();
  await rm(dir, { recursive: true, force: true });
});

function session(role: GovernanceRole, assignedAgents: string[] = []): GovernanceSession {
  return {
    token: `token-${role}`,
    userId: `id-${role}`,
    username: role,
    role,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
    assignedAgents,
    groupId: TEST_GROUP,
  };
}

async function send(
  method: string,
  route: string,
  actor: GovernanceSession | undefined,
  body?: unknown,
): Promise<{ status: number; body: any }> {
  const payload = body === undefined ? "" : JSON.stringify(body);
  const req = Readable.from(payload ? [Buffer.from(payload)] : []) as unknown as IncomingMessage;
  Object.assign(req, {
    method,
    url: `/control-ui/governance/${route}`,
    headers: { "content-type": "application/json" },
  });
  let status = 0;
  let text = "";
  const res = {
    statusCode: 200,
    setHeader() {},
    getHeader() {
      return undefined;
    },
    writeHead(code: number) {
      status = code;
      return this;
    },
    end(chunk?: unknown) {
      if (chunk) {
        text = String(chunk);
      }
      return this;
    },
  } as unknown as ServerResponse;
  const handled = await handleGovernanceApiRequest(
    req,
    res,
    `/control-ui/governance/${route}`,
    actor,
  );
  if (!handled) {
    return { status: 599, body: undefined };
  }
  let parsed: unknown;
  try {
    parsed = text ? JSON.parse(text) : undefined;
  } catch {
    parsed = text;
  }
  return { status: status || (res as { statusCode: number }).statusCode, body: parsed };
}

const aRule = (extra: Record<string, unknown> = {}) => ({
  resourceKind: "command",
  pattern: "^echo hi$",
  ...extra,
});

describe("Administrator and Root may add and change policy", () => {
  for (const role of ["administrator", "root"] as const) {
    it(`${role} may create a global rule`, async () => {
      const res = await send("POST", "policy/rules", session(role), aRule());
      expect(res.status).toBe(200);
      const policy = await loadPolicy(TEST_GROUP);
      const created = policy.rules.find((r) => r.pattern === "^echo hi$");
      expect(created).toBeDefined();
      // No agent id means it binds every agent, which is what makes it a
      // global rule and why the tier floor is Administrator.
      expect(created?.agentId).toBeUndefined();
    });

    it(`${role} may create a rule for any agent, assigned or not`, async () => {
      // Administrator and above have unlimited agent scope, so an empty
      // assignment list must not narrow them.
      const res = await send(
        "POST",
        "policy/rules",
        session(role, []),
        aRule({ agentId: "someone-elses-agent", pattern: "^echo scoped$" }),
      );
      expect(res.status).toBe(200);
      expect(
        (await loadPolicy(TEST_GROUP)).rules.some((r) => r.agentId === "someone-elses-agent"),
      ).toBe(true);
    });

    it(`${role} may forbid as well as allow`, async () => {
      const res = await send(
        "POST",
        "policy/rules",
        session(role),
        aRule({ effect: "deny", pattern: "^rm -rf /$" }),
      );
      expect(res.status).toBe(200);
      expect((await loadPolicy(TEST_GROUP)).rules.some((r) => r.effect === "deny")).toBe(true);
    });

    it(`${role} may remove a rule`, async () => {
      await send("POST", "policy/rules", session(role), aRule());
      const created = (await loadPolicy(TEST_GROUP)).rules.find((r) => r.pattern === "^echo hi$");
      const res = await send("POST", "policy/rules/remove", session(role), { id: created!.id });
      expect(res.status).toBe(200);
      expect((await loadPolicy(TEST_GROUP)).rules.some((r) => r.id === created!.id)).toBe(false);
    });

    it(`${role} may set a per-agent escalation and posture directly (T4)`, async () => {
      // Root reaches these by **inheritance** — `roleAtLeast` treats the tiers
      // as a ladder and nothing in the route names Root. Asserted rather than
      // assumed, because "the ladder covers it" is exactly the kind of claim
      // this project has been wrong about before.
      expect(
        (
          await send("POST", "policy/agent-ask", session(role), {
            agentId: "any-agent",
            ask: "on-miss",
          })
        ).status,
      ).toBe(200);
      expect(
        (
          await send("POST", "policy/agent-mode", session(role), {
            agentId: "any-agent",
            mode: "monitor",
          })
        ).status,
      ).toBe(200);
    });

    it(`${role} may change the installation posture and escalation mode`, async () => {
      expect((await send("POST", "policy/mode", session(role), { mode: "monitor" })).status).toBe(
        200,
      );
      expect((await send("POST", "policy/ask", session(role), { ask: "on-miss" })).status).toBe(
        200,
      );
      const policy = await loadPolicy(TEST_GROUP);
      expect(policy.mode).toBe("monitor");
      expect(policy.ask).toBe("on-miss");
    });
  }
});

describe("a User may author policy for their own assigned agents", () => {
  it("may create a rule scoped to an agent assigned to them", async () => {
    const res = await send(
      "POST",
      "policy/rules",
      session("user", ["mine"]),
      aRule({ agentId: "mine" }),
    );

    expect(res.status).toBe(200);
    const created = (await loadPolicy(TEST_GROUP)).rules.find((r) => r.pattern === "^echo hi$");
    expect(created?.agentId).toBe("mine");
    // Recorded against the person, not the tier — the trail has to answer who
    // widened the rules, and "a user did" is not an answer.
    expect(created?.createdBy).toBe("user");
  });

  it("may forbid something for their own agent, not only allow", async () => {
    const res = await send(
      "POST",
      "policy/rules",
      session("user", ["mine"]),
      aRule({ agentId: "mine", effect: "deny", pattern: "^curl .*$" }),
    );
    expect(res.status).toBe(200);
    expect(
      (await loadPolicy(TEST_GROUP)).rules.some((r) => r.effect === "deny" && r.agentId === "mine"),
    ).toBe(true);
  });

  it("may remove a rule they wrote for their own agent", async () => {
    await send("POST", "policy/rules", session("user", ["mine"]), aRule({ agentId: "mine" }));
    const created = (await loadPolicy(TEST_GROUP)).rules.find((r) => r.agentId === "mine");
    const res = await send("POST", "policy/rules/remove", session("user", ["mine"]), {
      id: created!.id,
    });
    expect(res.status).toBe(200);
    expect((await loadPolicy(TEST_GROUP)).rules.some((r) => r.id === created!.id)).toBe(false);
  });

  it("may NOT set their own agent's escalation or posture directly (T4)", async () => {
    // **This assertion was inverted on 2026-08-24 and the change is deliberate.**
    // It previously asserted 200 on both, encoding the old tier placement. The
    // paper assigns per-agent management to the Administrator, and the gap was
    // substantive rather than paper-fidelity: `ask: "off"` refuses an unlisted
    // action while `ask: "on-miss"` escalates it to a human who may approve, so
    // a User flipping their own agent converted a hard refusal into a request
    // somebody might grant.
    expect(
      (
        await send("POST", "policy/agent-ask", session("user", ["mine"]), {
          agentId: "mine",
          ask: "on-miss",
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await send("POST", "policy/agent-mode", session("user", ["mine"]), {
          agentId: "mine",
          mode: "monitor",
        })
      ).status,
    ).toBe(403);
  });

  it("may instead REQUEST an escalation or posture change for their own agent", async () => {
    // The capability is relocated, not removed. This is the half that makes the
    // tier move acceptable rather than merely correct.
    const res = await send("POST", "rule-requests", session("user", ["mine"]), {
      agentId: "mine",
      setting: "ask",
      value: "on-miss",
      reason: "the build needs a human in the loop",
    });
    expect(res.status).toBe(200);
    expect(res.body.kind).toBe("agent-setting");
    expect(res.body.status).toBe("pending");
  });

  it("may not request a setting change for another team's agent", async () => {
    const res = await send("POST", "rule-requests", session("user", ["mine"]), {
      agentId: "theirs",
      setting: "mode",
      value: "monitor",
      reason: "curious",
    });
    expect(res.status).toBe(403);
  });

  it("may NOT create a global rule, however many agents they manage", async () => {
    const res = await send("POST", "policy/rules", session("user", ["mine", "also-mine"]), aRule());

    // A global rule is managing everyone's agents, which is above this tier no
    // matter how much of the installation this account happens to hold.
    expect(res.status).toBe(403);
    expect((await loadPolicy(TEST_GROUP)).rules.some((r) => r.pattern === "^echo hi$")).toBe(false);
    // The refusal says what to do instead, rather than only that it was refused.
    expect(String(res.body?.error?.message)).toContain("agentId");
  });

  it("may NOT author for another team's agent", async () => {
    const res = await send(
      "POST",
      "policy/rules",
      session("user", ["mine"]),
      aRule({ agentId: "theirs" }),
    );
    expect(res.status).toBe(403);
    expect((await loadPolicy(TEST_GROUP)).rules.some((r) => r.agentId === "theirs")).toBe(false);
  });

  it("may NOT change the installation posture", async () => {
    expect(
      (await send("POST", "policy/mode", session("user", ["mine"]), { mode: "off" })).status,
    ).toBe(403);
    expect((await loadPolicy(TEST_GROUP)).mode).toBe("enforce");
  });
});

describe("a Viewer writes nothing, at either scope", () => {
  it("may not create a global rule", async () => {
    expect((await send("POST", "policy/rules", session("viewer", ["mine"]), aRule())).status).toBe(
      403,
    );
  });

  it("may not create a rule even for an agent assigned to them", async () => {
    // The distinction this pins: assignment grants *visibility*, the role
    // grants *authority*. A Viewer assigned an agent can read its policy and
    // change nothing about it.
    const res = await send(
      "POST",
      "policy/rules",
      session("viewer", ["mine"]),
      aRule({ agentId: "mine" }),
    );
    expect(res.status).toBe(403);
    // Not "no rules at all" — an installation ships with a tiered baseline
    // (§G), so the assertion is that *this* rule was not written.
    expect((await loadPolicy(TEST_GROUP)).rules.some((r) => r.pattern === "^echo hi$")).toBe(false);
  });

  it("may not remove a rule", async () => {
    await send("POST", "policy/rules", session("administrator"), aRule());
    const created = (await loadPolicy(TEST_GROUP)).rules.find((r) => r.pattern === "^echo hi$");
    const res = await send("POST", "policy/rules/remove", session("viewer", ["mine"]), {
      id: created!.id,
    });
    expect(res.status).toBe(403);
    expect((await loadPolicy(TEST_GROUP)).rules.some((r) => r.id === created!.id)).toBe(true);
  });
});

describe("core rules are immutable at every tier, Root included", () => {
  it("refuses to remove a shipped core denial", async () => {
    const core = (await loadPolicy(TEST_GROUP)).rules.find((r) => r.tier === "core");
    expect(core).toBeDefined();

    const res = await send("POST", "policy/rules/remove", session("root"), { id: core!.id });

    // The tier exists precisely so that the most privileged account cannot
    // quietly remove the floor. A Root who could delete core rules would make
    // the immutable tier a naming convention.
    expect(res.status).not.toBe(200);
    expect((await loadPolicy(TEST_GROUP)).rules.some((r) => r.id === core!.id)).toBe(true);
  });
});

describe("Root decides whether a User may write policy at all", () => {
  function withheld(assignedAgents: string[]): GovernanceSession {
    return { ...session("user", assignedAgents), canAuthorPolicy: false };
  }

  it("a withheld User cannot create a rule even for their own agent", async () => {
    const res = await send("POST", "policy/rules", withheld(["mine"]), aRule({ agentId: "mine" }));

    expect(res.status).toBe(403);
    expect((await loadPolicy(TEST_GROUP)).rules.some((r) => r.pattern === "^echo hi$")).toBe(false);
  });

  it("a withheld User cannot remove a rule, or set their agent's posture", async () => {
    await send("POST", "policy/rules", session("administrator"), aRule({ agentId: "mine" }));
    const created = (await loadPolicy(TEST_GROUP)).rules.find((r) => r.agentId === "mine");

    expect(
      (await send("POST", "policy/rules/remove", withheld(["mine"]), { id: created!.id })).status,
    ).toBe(403);
    expect(
      (
        await send("POST", "policy/agent-mode", withheld(["mine"]), {
          agentId: "mine",
          mode: "monitor",
        })
      ).status,
    ).toBe(403);
    expect((await loadPolicy(TEST_GROUP)).rules.some((r) => r.id === created!.id)).toBe(true);
  });

  it("a withheld User keeps every read the tier has", async () => {
    await send("POST", "policy/rules", session("administrator"), aRule({ agentId: "mine" }));

    // The point of withholding is to remove *writing*, not to demote the
    // account to a Viewer. They still see their agent's policy in full.
    expect((await send("GET", "policy/by-agent?agentId=mine", withheld(["mine"]))).status).toBe(
      200,
    );
    expect((await send("GET", "policy", withheld(["mine"]))).status).toBe(200);
  });

  it("a withheld User can still stop their agent", async () => {
    // The emergency stop is not policy authoring. An operator who may not
    // rewrite the rules must still be able to pull the handle on a runaway
    // agent they are responsible for — withholding the first and removing the
    // second would be a safety regression dressed as a permission.
    const stop = await send("POST", "kill", withheld(["mine"]), { agentId: "mine" });
    expect(stop.status).toBe(200);
    expect((await loadPolicy(TEST_GROUP)).lockedAgents).toContain("mine");
  });

  it("a withheld User can still submit a rule request for an Administrator to grant", async () => {
    // This is what they fall back to, and it is the paper's original User tier:
    // propose, do not decide. Withholding returns one account to that shape
    // without changing anybody else's.
    const res = await send("POST", "rule-requests", withheld(["mine"]), {
      resourceKind: "command",
      pattern: "^echo hi$",
      agentId: "mine",
      reason: "needed for the build",
    });
    expect(res.status).toBe(200);
  });

  it("the flag does not restrain an Administrator or Root", async () => {
    // Consulted for the User tier only. An Administrator manages every agent by
    // role, and a Root who could revoke their own authority is a lockout
    // waiting to happen.
    for (const role of ["administrator", "root"] as const) {
      const res = await send(
        "POST",
        "policy/rules",
        { ...session(role), canAuthorPolicy: false },
        aRule({ pattern: `^echo ${role}$` }),
      );
      expect(res.status).toBe(200);
    }
  });

  it("an account with the flag absent may author, so nothing existing changes", async () => {
    // Absent means allowed. Every account and session issued before this
    // existed keeps working exactly as it did.
    const legacy = session("user", ["mine"]);
    expect(legacy.canAuthorPolicy).toBeUndefined();
    const res = await send("POST", "policy/rules", legacy, aRule({ agentId: "mine" }));
    expect(res.status).toBe(200);
  });

  it("only Root may set the flag", async () => {
    for (const role of ["viewer", "user", "administrator"] as const) {
      const res = await send("POST", "users/policy-authoring", session(role), {
        userId: "someone",
        allowed: false,
      });
      expect(res.status).toBe(403);
    }
  });

  it("rejects a malformed request rather than guessing", async () => {
    expect(
      (await send("POST", "users/policy-authoring", session("root"), { userId: "x" })).status,
    ).toBe(400);
    expect(
      (await send("POST", "users/policy-authoring", session("root"), { allowed: true })).status,
    ).toBe(400);
  });
});

describe("the request path actually closes the loop (T4)", () => {
  it("a User asks, an Administrator approves, and the setting changes", async () => {
    // The acceptance criterion for relocating the capability. A request queue
    // that accepts submissions and never applies them would be worse than
    // simply removing the capability, because it would look like it worked.
    const submitted = await send("POST", "rule-requests", session("user", ["mine"]), {
      agentId: "mine",
      setting: "ask",
      value: "on-miss",
      reason: "this agent touches production",
    });
    expect(submitted.status).toBe(200);
    expect((await loadPolicy(TEST_GROUP)).agentAsk.mine).toBeUndefined();

    const decided = await send("POST", "rule-requests/decide", session("administrator"), {
      id: submitted.body.id,
      approve: true,
    });
    expect(decided.status).toBe(200);

    // The setting is now in force, applied from the *stored* request rather
    // than from the approving client's payload.
    expect((await loadPolicy(TEST_GROUP)).agentAsk.mine).toBe("on-miss");
  });

  it("a rejected request changes nothing", async () => {
    const submitted = await send("POST", "rule-requests", session("user", ["mine"]), {
      agentId: "mine",
      setting: "mode",
      value: "monitor",
      reason: "watching a new workload",
    });
    await send("POST", "rule-requests/decide", session("administrator"), {
      id: submitted.body.id,
      approve: false,
    });

    expect((await loadPolicy(TEST_GROUP)).agentMode.mine).toBeUndefined();
  });

  it("records the approver as the actor, not the requester", async () => {
    // The change is made under the Administrator's authority. The requester is
    // already named on the submit entry; conflating the two would let the
    // trail suggest a User changed something they cannot change.
    const submitted = await send("POST", "rule-requests", session("user", ["mine"]), {
      agentId: "mine",
      setting: "ask",
      value: "off",
      reason: "noisy",
    });
    await send("POST", "rule-requests/decide", session("administrator"), {
      id: submitted.body.id,
      approve: true,
    });

    const { tailLedger } = await import("../governance/audit-ledger.js");
    const applied = (await tailLedger(TEST_GROUP, 50)).find(
      (entry) => entry.toolName === "governance.policy.agent-ask",
    );
    expect(applied?.actor).toBe("administrator");
    // And the tier it was made under (T5).
    expect(applied?.actorRole).toBe("administrator");
  });

  it("a User whose authoring Root withheld may still request", async () => {
    // Requesting is not authoring. Asking is precisely the fallback that
    // withholding leaves them, so removing it too would make the flag a
    // demotion in disguise.
    const res = await send(
      "POST",
      "rule-requests",
      { ...session("user", ["mine"]), canAuthorPolicy: false },
      { agentId: "mine", setting: "ask", value: "on-miss", reason: "needed" },
    );
    expect(res.status).toBe(200);
  });

  it("rejects a value the setting does not accept", async () => {
    const res = await send("POST", "rule-requests", session("user", ["mine"]), {
      agentId: "mine",
      setting: "ask",
      value: "monitor",
      reason: "wrong axis",
    });
    expect(res.status).toBe(400);
  });
});
