// A core rule Root switched off can be switched back on from the dashboard (finding 367).
//
// The loader drops a switched-off core rule from the rules it returns, and the only thing
// the policy read carried about it was its id, so the page had nothing to show it by and no
// control called `policy/core-rules` with `enabled: true`. Since the command line was
// removed, a shipped denial switched off from the dashboard could be restored only by
// hand-written HTTP, while the deployment report told Root to switch it back on in the
// Policy section. The read now carries each switched-off rule whole.
import { mkdtemp, rm } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { coreRules, seedRuleId } from "../governance/baseline-policy.js";
import { resetLedgerKeyCacheForTests } from "../governance/ledger-key.js";
import { savePolicy } from "../governance/policy-store.js";
import { defaultPolicyDocument } from "../governance/policy-types.js";
import type { GovernanceRole } from "../governance/roles.js";
import type { GovernanceSession } from "../governance/session-tokens.js";
import { seedGroupWithAgents } from "../governance/test-group.js";
import { handleGovernanceApiRequest } from "./governance-dashboard-api.js";

let dir: string;
let groupId: string;

const switchable = coreRules().find((rule) => !rule.selfProtecting)!;
const switchableId = seedRuleId(switchable);

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "governance-core-switch-on-"));
  process.env.OPENCLAW_GOVERNANCE_DIR = dir;
  groupId = await seedGroupWithAgents(["agent-a"]);
  resetLedgerKeyCacheForTests();
  await savePolicy(groupId, { ...defaultPolicyDocument(), mode: "enforce" });
});

afterEach(async () => {
  delete process.env.OPENCLAW_GOVERNANCE_DIR;
  resetLedgerKeyCacheForTests();
  await rm(dir, { recursive: true, force: true });
});

function session(role: GovernanceRole): GovernanceSession {
  return {
    token: `t-${role}`,
    userId: `id-${role}`,
    username: role,
    role,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
    assignedAgents: ["agent-a"],
    groupId,
  };
}

async function call(
  route: string,
  who: GovernanceSession,
  body?: Record<string, unknown>,
): Promise<{ status: number; body: any }> {
  const url = `/control-ui/governance/${route}`;
  const raw = body ? JSON.stringify(body) : "";
  const req = Readable.from(raw ? [Buffer.from(raw)] : []) as unknown as IncomingMessage;
  Object.assign(req, {
    method: body ? "POST" : "GET",
    url,
    headers: raw
      ? {
          "content-type": "application/json",
          "content-length": String(Buffer.byteLength(raw)),
        }
      : {},
  });
  const captured = { status: 0, body: undefined as any };
  const res = {
    statusCode: 200,
    headersSent: false,
    setHeader() {},
    getHeader() {
      return undefined;
    },
    end(chunk?: string) {
      captured.status = (this as { statusCode: number }).statusCode;
      captured.body = chunk ? JSON.parse(chunk) : undefined;
    },
  } as unknown as ServerResponse;
  await handleGovernanceApiRequest(req, res, url, who);
  return captured;
}

describe("a switched-off core rule on the policy read (finding 367)", () => {
  it("is carried whole, so the page can name it and offer to switch it back on", async () => {
    const off = await call("policy/core-rules", session("root"), {
      ruleId: switchableId,
      enabled: false,
    });
    expect(off.status).toBe(200);

    const policy = await call("policy", session("viewer"));

    expect(policy.status).toBe(200);
    expect(policy.body.rules.some((rule: { id: string }) => rule.id === switchableId)).toBe(false);
    expect(policy.body.switchedOffCoreRules).toEqual([
      expect.objectContaining({
        id: switchableId,
        description: switchable.description,
        resourceKind: switchable.resourceKind,
        pattern: switchable.pattern,
      }),
    ]);
  });

  it("is empty when nothing is switched off, and switching back on empties it", async () => {
    expect((await call("policy", session("root"))).body.switchedOffCoreRules).toEqual([]);
    await call("policy/core-rules", session("root"), { ruleId: switchableId, enabled: false });

    const on = await call("policy/core-rules", session("root"), {
      ruleId: switchableId,
      enabled: true,
    });

    expect(on.status).toBe(200);
    const policy = (await call("policy", session("root"))).body;
    expect(policy.switchedOffCoreRules).toEqual([]);
    expect(policy.rules.some((rule: { id: string }) => rule.id === switchableId)).toBe(true);
  });
});
