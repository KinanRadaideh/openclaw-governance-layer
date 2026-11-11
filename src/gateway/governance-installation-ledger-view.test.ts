// T97 over HTTP: the installation chain's events in Root's ledger view, through
// the real router, with the refusal written by the real gate. Design
// `mg/T97-INSTALLATION-LEDGER-VIEW-DESIGN.md`, D1–D8.
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  appendLedgerEntry,
  clearCheckpointForTests,
  resetLedgerCursorForTests,
  tailLedger,
} from "../governance/audit-ledger.js";
import { resetLedgerAlertIndexForTests } from "../governance/ledger-alerts.js";
import { resetLedgerKeyCacheForTests } from "../governance/ledger-key.js";
import { INSTALLATION_LEDGER_GROUP, ledgerFilePath } from "../governance/paths.js";
import { evaluateGovernancePolicy } from "../governance/policy-engine.js";
import type { GovernanceRole } from "../governance/roles.js";
import type { GovernanceSession } from "../governance/session-tokens.js";
import { seedGroupWithAgents } from "../governance/test-group.js";
import { createUser, newGroupId } from "../governance/user-store.js";
import { handleGovernanceApiRequest } from "./governance-dashboard-api.js";

let dir: string;
let GROUP: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "governance-installation-ledger-"));
  process.env.OPENCLAW_GOVERNANCE_DIR = dir;
  GROUP = await seedGroupWithAgents(["agent-a"]);
  // The organisation's Root, so `users.json` names exactly one organisation (D2).
  await createUser(
    { username: "root1", password: "test-password-123", role: "root", groupId: GROUP },
    { name: "test", role: "root" },
  );
  resetLedgerKeyCacheForTests();
  resetLedgerCursorForTests();
  resetLedgerAlertIndexForTests();
  // Account creation is recorded; start the organisation's chain empty, as the seed does.
  // The checkpoint with it, or the next append records the removal as a gap (T73), rightly.
  await rm(ledgerFilePath(GROUP), { force: true });
  await clearCheckpointForTests(GROUP);
  resetLedgerCursorForTests();
});

afterEach(async () => {
  vi.useRealTimers();
  delete process.env.OPENCLAW_GOVERNANCE_DIR;
  resetLedgerKeyCacheForTests();
  resetLedgerCursorForTests();
  resetLedgerAlertIndexForTests();
  await rm(dir, { recursive: true, force: true });
});

function session(role: GovernanceRole, groupId = GROUP): GovernanceSession {
  return {
    token: `token-${role}`,
    userId: `id-${role}`,
    username: `${role}1`,
    role,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
    assignedAgents: ["agent-a"],
    groupId,
  };
}

async function call(
  method: "GET" | "POST",
  route: string,
  actor: GovernanceSession,
): Promise<{ status: number; body: any; text: string }> {
  const path = `/control-ui/governance/${route}`;
  const req = Readable.from([]) as unknown as IncomingMessage;
  Object.assign(req, { method, url: path, headers: {} });
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
    text,
  };
}

async function organisationEntry(resource: string): Promise<void> {
  await appendLedgerEntry(GROUP, {
    agentId: "agent-a",
    toolName: "exec",
    resourceKind: "command",
    resource,
    ruleId: "default-deny",
    decision: "deny",
  });
}

async function installationEntry(resource: string): Promise<void> {
  await appendLedgerEntry(INSTALLATION_LEDGER_GROUP, {
    agentId: "ghost",
    toolName: "exec",
    resourceKind: "command",
    resource,
    ruleId: "agent-not-registered",
    decision: "deny",
  });
}

/** An unregistered agent tries to act, and the real gate refuses and records it. */
async function unregisteredAgentActs(): Promise<void> {
  const decision = await evaluateGovernancePolicy(
    { toolName: "exec", params: { command: "ls" } },
    { sessionKey: "agent:ghost:main" },
  );
  expect(decision && "block" in decision && decision.block).toBeTruthy();
}

describe("T97: Root sees the installation chain", () => {
  it("shows Root an unregistered agent's refusal, marked as an installation-level event", async () => {
    await organisationEntry("before");
    await unregisteredAgentActs();
    const { status, body } = await call("GET", "ledger?limit=200", session("root"));
    expect(status).toBe(200);
    const refusal = body.find((entry: any) => entry.ruleId === "agent-not-registered");
    expect(refusal).toMatchObject({
      agentId: "ghost",
      decision: "deny",
      ledgerScope: "installation",
      seq: 1,
    });
    // The organisation's own entry is unmarked (D3).
    const own = body.find((entry: any) => entry.resource === "before");
    expect(own).toBeDefined();
    expect("ledgerScope" in own).toBe(false);
  });

  it("gives no lower tier an installation event, whatever its assignments", async () => {
    await unregisteredAgentActs();
    for (const role of ["administrator", "user", "viewer"] as const) {
      const actor = { ...session(role), assignedAgents: ["agent-a", "ghost"] };
      const { status, body } = await call("GET", "ledger?limit=1000", actor);
      expect(status).toBe(200);
      expect(body.filter((entry: any) => entry.ledgerScope !== undefined)).toEqual([]);
      expect(body.filter((entry: any) => entry.ruleId === "agent-not-registered")).toEqual([]);
    }
  });

  it("leaves every lower tier's ledger and verify responses exactly as they were (D8)", async () => {
    await organisationEntry("one");
    await organisationEntry("two");
    const before: Record<string, string> = {};
    for (const role of ["administrator", "user", "viewer"] as const) {
      before[`ledger-${role}`] = (await call("GET", "ledger?limit=200", session(role))).text;
      before[`verify-${role}`] = (await call("POST", "ledger/verify", session(role))).text;
    }
    await unregisteredAgentActs();
    await installationEntry("more");
    for (const role of ["administrator", "user", "viewer"] as const) {
      expect((await call("GET", "ledger?limit=200", session(role))).text).toBe(
        before[`ledger-${role}`],
      );
      expect((await call("POST", "ledger/verify", session(role))).text).toBe(
        before[`verify-${role}`],
      );
    }
  });

  it("gives no Root the installation chain when the installation holds two organisations", async () => {
    await createUser(
      {
        username: "other-root",
        password: "test-password-123",
        role: "root",
        groupId: newGroupId(),
      },
      { name: "test", role: "root" },
    );
    await unregisteredAgentActs();
    const { body } = await call("GET", "ledger?limit=200", session("root"));
    expect(body.filter((entry: any) => entry.ledgerScope === "installation")).toEqual([]);
    const verify = (await call("POST", "ledger/verify", session("root"))).body;
    expect(verify.installation).toBeUndefined();
  });

  it("gives a Root of a group that is not the installation's organisation nothing", async () => {
    await unregisteredAgentActs();
    const { status, body } = await call("GET", "ledger?limit=200", session("root", newGroupId()));
    expect(status).toBe(200);
    expect(body).toEqual([]);
  });
});

describe("T97 D4: one timeline, paged after merging", () => {
  it("orders both chains by time and keeps the newest `limit` across them", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const at = (second: number) => vi.setSystemTime(new Date(Date.UTC(2026, 10, 10, 9, 0, second)));
    at(1);
    await organisationEntry("o1");
    at(2);
    await installationEntry("i1");
    at(3);
    await organisationEntry("o2");
    at(4);
    await installationEntry("i2");
    at(5);
    await installationEntry("i3");
    at(6);
    await organisationEntry("o3");
    const all = (await call("GET", "ledger?limit=200", session("root"))).body;
    expect(all.map((entry: any) => entry.resource)).toEqual(["o1", "i1", "o2", "i2", "i3", "o3"]);
    const page = (await call("GET", "ledger?limit=3", session("root"))).body;
    expect(page.map((entry: any) => entry.resource)).toEqual(["i2", "i3", "o3"]);
    expect(page.map((entry: any) => entry.ledgerScope ?? "organisation")).toEqual([
      "installation",
      "installation",
      "organisation",
    ]);
  });

  it("puts the organisation's entry first on an equal time", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(Date.UTC(2026, 10, 10, 9, 0, 0)));
    await installationEntry("i");
    await organisationEntry("o");
    const all = (await call("GET", "ledger?limit=200", session("root"))).body;
    expect(all.map((entry: any) => entry.resource)).toEqual(["o", "i"]);
  });
});

describe("T97 D5: Root verifies the installation chain on its own", () => {
  it("adds the installation chain's verification for Root only", async () => {
    await organisationEntry("o1");
    await unregisteredAgentActs();
    const root = (await call("POST", "ledger/verify", session("root"))).body;
    expect(root).toMatchObject({ ok: true, entriesChecked: 1 });
    expect(root.installation).toMatchObject({ ok: true, entriesChecked: 1 });
    expect(root.installation.evidence.headSeq).toBe(1);
    const admin = (await call("POST", "ledger/verify", session("administrator"))).body;
    expect(admin.installation).toBeUndefined();
  });

  it("reports a broken installation chain without touching the organisation's verdict", async () => {
    await organisationEntry("o1");
    await installationEntry("i1");
    await installationEntry("i2");
    const path = ledgerFilePath(INSTALLATION_LEDGER_GROUP);
    const lines = (await readFile(path, "utf8")).split("\n").filter(Boolean);
    const first = JSON.parse(lines[0] as string);
    first.resource = "rewritten";
    await writeFile(path, `${JSON.stringify(first)}\n${lines[1]}\n`);
    const root = (await call("POST", "ledger/verify", session("root"))).body;
    expect(root.ok).toBe(true);
    expect(root.installation.ok).toBe(false);
    expect(root.installation.brokenAtSeq).toBe(1);
  });

  // Finding 456 (QA 2026-11-11): the installation chain is a second file, and Root's view of the
  // organisation must not depend on it. Before the fix, an installation ledger that could not be
  // read made Root's `ledger` and `ledger/verify` throw, while every other tier was answered.
  it("keeps Root's organisation view and verdict when the installation chain cannot be read", async () => {
    await organisationEntry("o1");
    await mkdir(ledgerFilePath(INSTALLATION_LEDGER_GROUP), { recursive: true });
    const ledger = await call("GET", "ledger?limit=200", session("root"));
    expect(ledger.status).toBe(200);
    expect(ledger.body.map((entry: any) => entry.resource)).toEqual(["o1"]);
    const verify = await call("POST", "ledger/verify", session("root"));
    expect(verify.status).toBe(200);
    expect(verify.body).toMatchObject({ ok: true, entriesChecked: 1 });
    expect(verify.body.installation).toMatchObject({ ok: false, entriesChecked: 0 });
    expect(verify.body.installation.reason).toMatch(/could not be read/);
  });

  it("verifies an empty installation chain as intact", async () => {
    await organisationEntry("o1");
    const root = (await call("POST", "ledger/verify", session("root"))).body;
    expect(root.installation).toMatchObject({ ok: true, entriesChecked: 0 });
  });
});

describe("T97 D1: nothing stored changes", () => {
  it("writes no field into either chain", async () => {
    await organisationEntry("o1");
    await unregisteredAgentActs();
    await call("GET", "ledger?limit=200", session("root"));
    await call("POST", "ledger/verify", session("root"));
    for (const entry of [
      ...(await tailLedger(GROUP, 50)),
      ...(await tailLedger(INSTALLATION_LEDGER_GROUP, 50)),
    ]) {
      expect("ledgerScope" in entry).toBe(false);
    }
    expect(await tailLedger(INSTALLATION_LEDGER_GROUP, 50)).toHaveLength(1);
  });
});
