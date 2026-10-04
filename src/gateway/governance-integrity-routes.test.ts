// T73 over HTTP: the witness round trip a dashboard makes, the alerts an
// Administrator is shown, and Root's acknowledgement, through the real router.
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { appendLedgerEntry, resetLedgerCursorForTests } from "../governance/audit-ledger.js";
import { resetLedgerAlertIndexForTests } from "../governance/ledger-alerts.js";
import { resetLedgerKeyCacheForTests } from "../governance/ledger-key.js";
import { ledgerCheckpointFilePath, ledgerFilePath } from "../governance/paths.js";
import type { GovernanceRole } from "../governance/roles.js";
import type { GovernanceSession } from "../governance/session-tokens.js";
import { seedGroupWithAgents } from "../governance/test-group.js";
import { handleGovernanceApiRequest } from "./governance-dashboard-api.js";

let dir: string;
let GROUP: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "governance-integrity-routes-"));
  process.env.OPENCLAW_GOVERNANCE_DIR = dir;
  GROUP = await seedGroupWithAgents(["agent-a"]);
  resetLedgerKeyCacheForTests();
  resetLedgerCursorForTests();
  resetLedgerAlertIndexForTests();
});

afterEach(async () => {
  delete process.env.OPENCLAW_GOVERNANCE_DIR;
  resetLedgerKeyCacheForTests();
  resetLedgerCursorForTests();
  resetLedgerAlertIndexForTests();
  await rm(dir, { recursive: true, force: true });
});

function session(role: GovernanceRole): GovernanceSession {
  return {
    token: `token-${role}`,
    userId: `id-${role}`,
    username: `${role}1`,
    role,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
    assignedAgents: ["agent-a"],
    groupId: GROUP,
  };
}

async function call(
  method: "GET" | "POST",
  route: string,
  actor: GovernanceSession,
  body?: unknown,
): Promise<{ status: number; body: any }> {
  const path = `/control-ui/governance/${route}`;
  const req = Readable.from(
    body === undefined ? [] : [JSON.stringify(body)],
  ) as unknown as IncomingMessage;
  Object.assign(req, {
    method,
    url: path,
    headers: body === undefined ? {} : { "content-type": "application/json" },
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
      if (typeof chunk === "string") {
        text += chunk;
      } else if (chunk instanceof Uint8Array) {
        text += Buffer.from(chunk).toString("utf8");
      }
      return this;
    },
  } as unknown as ServerResponse;
  expect(await handleGovernanceApiRequest(req, res, path, actor)).toBe(true);
  return {
    status: status || (res as { statusCode: number }).statusCode,
    body: text ? JSON.parse(text) : undefined,
  };
}

async function append(resource: string): Promise<void> {
  await appendLedgerEntry(GROUP, {
    agentId: "agent-a",
    toolName: "exec",
    resourceKind: "command",
    resource,
    ruleId: "default-deny",
    decision: "deny",
  });
}

async function lines(): Promise<string[]> {
  return (await readFile(ledgerFilePath(GROUP), "utf8")).split("\n").filter(Boolean);
}

describe("the witness round trip", () => {
  it("hands a Viewer the head and its receipt, and accepts it back as consistent", async () => {
    await append("one");
    const first = await call("POST", "integrity/witness", session("viewer"), {});
    expect(first.status).toBe(200);
    expect(first.body.status).toBe("none");
    expect(first.body.head).toMatchObject({ groupId: GROUP, seq: 1 });
    expect(first.body.head.receipt).toMatch(/^[0-9a-f]{64}$/);
    await append("two");
    const second = await call("POST", "integrity/witness", session("viewer"), {
      receipt: first.body.head,
    });
    expect(second.body).toMatchObject({ status: "consistent", head: { seq: 2 } });
  });

  it("answers null while the ledger is empty, and ignores a receipt that is not one", async () => {
    const answer = await call("POST", "integrity/witness", session("viewer"), {
      receipt: { groupId: GROUP, seq: "1" },
    });
    expect(answer.body).toEqual({ status: "none", head: null });
  });

  it("records a contradiction a Viewer's browser proves, and raises it for Administrators", async () => {
    await append("one");
    await append("two");
    const held = (await call("POST", "integrity/witness", session("viewer"), {})).body.head;
    // Cut and rewind the checkpoint, so only the witness can tell.
    const [first] = await lines();
    await writeFile(ledgerFilePath(GROUP), `${first}\n`);
    const checkpoints = JSON.parse(await readFile(ledgerCheckpointFilePath(), "utf8"));
    const kept = JSON.parse(first as string);
    checkpoints[GROUP] = { seq: kept.seq, hash: kept.hash, updatedAt: new Date().toISOString() };
    await writeFile(ledgerCheckpointFilePath(), JSON.stringify(checkpoints));
    resetLedgerCursorForTests();

    const answer = await call("POST", "integrity/witness", session("viewer"), { receipt: held });
    expect(answer.body.status).toBe("contradicted");
    expect(answer.body.alertSeq).toBe(2);

    const alerts = await call("GET", "integrity/alerts", session("administrator"));
    expect(alerts.body.alerts).toEqual([
      expect.objectContaining({ seq: 2, summary: expect.stringContaining("viewer1 (viewer)") }),
    ]);
  });
});

describe("acknowledging an alert", () => {
  async function raise(): Promise<number> {
    await append("one");
    await append("two");
    const [first] = await lines();
    await writeFile(ledgerFilePath(GROUP), `${first}\n`);
    resetLedgerCursorForTests();
    await append("three");
    return (await call("GET", "integrity/alerts", session("root"))).body.alerts[0].seq;
  }

  it("takes Root's reason, records it, and stops raising the alert", async () => {
    const seq = await raise();
    const answer = await call("POST", "integrity/acknowledge", session("root"), {
      seq,
      reason: "restored from Tuesday's backup",
    });
    expect(answer).toEqual({ status: 200, body: { ok: true, alerts: [] } });
    expect((await lines()).at(-1)).toContain("restored from Tuesday's backup");
  });

  it("says what to do when the reason is missing or the alert is not open", async () => {
    const seq = await raise();
    const blank = await call("POST", "integrity/acknowledge", session("root"), {
      seq,
      reason: " ",
    });
    expect(blank.status).toBe(400);
    expect(blank.body.error.message).toContain("Say why it is safe to carry on");
    const wrong = await call("POST", "integrity/acknowledge", session("root"), {
      seq: seq + 50,
      reason: "x",
    });
    expect(wrong.status).toBe(404);
    expect(wrong.body.error.message).toContain("Reload the page");
    const malformed = await call("POST", "integrity/acknowledge", session("root"), { seq: "2" });
    expect(malformed.status).toBe(400);
  });

  it("refuses an Administrator", async () => {
    const seq = await raise();
    const answer = await call("POST", "integrity/acknowledge", session("administrator"), {
      seq,
      reason: "not mine",
    });
    expect(answer.status).toBe(403);
  });
});
