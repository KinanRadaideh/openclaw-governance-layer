// Can one organisation reach another organisation's agent? (findings 139, 144)
//
// ## The gap these tests close
//
// Two different questions were being confused. `canManageAgent` asks *"is this
// person senior enough, or assigned?"*, and for an Administrator the answer is
// **yes for any agent id in the world**, because unlimited agent scope is a
// statement about rank, not about which organisation you belong to. It was
// written before organisations existed and was never wrong; it was simply being
// asked a question it does not answer.
//
// For most routes that cost nothing, because storage is per-organisation: a
// request naming somebody else's agent still reads and writes *your own* files,
// so you get an empty answer rather than their data. **Per-organisation storage
// protected everything that was filed away.**
//
// It protects nothing that acts on the **running system**, which has no idea
// organisations exist. That is where both findings live: the live-session view
// read the whole machine's activity (139), and the emergency stop *terminates*
// from that same whole-machine list (144), so an administrator of one
// organisation could stop another organisation's work by naming its agent.
import { mkdtemp, rm } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resetLedgerKeyCacheForTests } from "../governance/ledger-key.js";
import { savePolicy } from "../governance/policy-store.js";
import { defaultPolicyDocument } from "../governance/policy-types.js";
import type { GovernanceSession } from "../governance/session-tokens.js";
import { seedNamedGroup } from "../governance/test-group.js";
import { handleGovernanceApiRequest } from "./governance-dashboard-api.js";

const OURS = "group-ours";
const THEIRS = "group-theirs";

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "governance-cross-group-"));
  process.env.OPENCLAW_GOVERNANCE_DIR = dir;
  resetLedgerKeyCacheForTests();
  await seedNamedGroup(OURS, ["our-agent"]);
  await seedNamedGroup(THEIRS, ["their-agent"]);
  await savePolicy(OURS, { ...defaultPolicyDocument(), mode: "enforce" });
  await savePolicy(THEIRS, { ...defaultPolicyDocument(), mode: "enforce" });
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
  delete process.env.OPENCLAW_GOVERNANCE_DIR;
});

/** An Administrator of `OURS`. The most privileged tier below Root. */
function ourAdministrator(): GovernanceSession {
  return {
    token: "t",
    userId: "u-ours",
    username: "amina",
    role: "administrator",
    assignedAgents: [],
    groupId: OURS,
    issuedAt: Date.now(),
    expiresAt: Date.now() + 60_000,
  } as unknown as GovernanceSession;
}

async function post(
  actor: GovernanceSession,
  route: string,
  body: unknown,
): Promise<{ status: number; body: any }> {
  const path = `/control-ui/governance/${route}`;
  const req = Readable.from([JSON.stringify(body)]) as unknown as IncomingMessage;
  Object.assign(req, {
    method: "POST",
    url: path,
    headers: { "content-type": "application/json" },
  });
  let status = 0;
  let text = "";
  // `sendJson` sets `statusCode` directly rather than calling `writeHead`, so a
  // harness watching only `writeHead` reads every refusal as a 200 and the test
  // fails against a fix that works. That cost a detour here; both are captured.
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
      if (typeof chunk === "string") {
        text += chunk;
      } else if (chunk instanceof Uint8Array) {
        text += Buffer.from(chunk).toString("utf8");
      } else if (chunk !== undefined && chunk !== null) {
        text += JSON.stringify(chunk);
      }
      return this;
    },
  } as unknown as ServerResponse;
  const handled = await handleGovernanceApiRequest(req, res, path, actor);
  if (!handled) {
    return { status: 599, body: undefined };
  }
  let parsed: unknown;
  try {
    parsed = text ? JSON.parse(text) : undefined;
  } catch {
    parsed = undefined;
  }
  return { status: status || (res as { statusCode: number }).statusCode || 200, body: parsed };
}

describe("an administrator cannot reach another organisation's agent", () => {
  it("refuses to stop it (finding 144)", async () => {
    // The severe one. The emergency stop does not merely write a flag. It
    // terminates whatever that agent is currently running, from a list kept by
    // the machine rather than by any organisation. Left open, this is one
    // organisation switching off another organisation's work.
    const reply = await post(ourAdministrator(), "kill", {
      agentId: "their-agent",
      locked: true,
    });
    expect(reply.status).toBe(403);
  });

  it("still lets it stop its own", async () => {
    // The other half of the pair. A refusal is only evidence if the permitted
    // case succeeds beside it. Otherwise the control could simply be broken.
    const reply = await post(ourAdministrator(), "kill", {
      agentId: "our-agent",
      locked: true,
    });
    expect(reply.status).toBe(200);
  });

  it("refuses to send it a prompt", async () => {
    // Prompting somebody else's agent would make it *do things*, and return
    // what it said back to the caller. Both halves are wrong.
    const reply = await post(ourAdministrator(), "agent/prompt", {
      agentId: "their-agent",
      message: "what are you working on?",
    });
    expect(reply.status).toBe(403);
  });

  it("says the same thing about an agent that does not exist", async () => {
    // The refusal must not become a lookup service. If "not in your
    // organisation" read differently from "no such agent", an administrator
    // could discover which agent names other organisations use by trying them
    //. The same reason the sign-in page refuses to say whether an account
    // exists.
    const theirs = await post(ourAdministrator(), "kill", {
      agentId: "their-agent",
      locked: true,
    });
    const nobodys = await post(ourAdministrator(), "kill", {
      agentId: "no-such-agent-anywhere",
      locked: true,
    });
    expect(theirs.status).toBe(nobodys.status);
    expect(JSON.stringify(theirs.body)).toBe(
      JSON.stringify(nobodys.body).replaceAll("no-such-agent-anywhere", "their-agent"),
    );
  });
});
