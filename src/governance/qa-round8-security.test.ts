// Eighth QA pass, security-focused.
//
// Deliberately aimed at the properties the other suites do *not* cover:
// session lifetime, secret leakage into the audit trail, object-prototype
// abuse through agent-controlled keys, and the confidentiality half of the
// role model. Each test states the attack rather than the mechanism, so a
// refactor that keeps the mechanism but loses the property still fails.
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { appendLedgerEntry, tailLedger } from "./audit-ledger.js";
import { projectLedgerForActor, REDACTED_RESOURCE } from "./ledger-view.js";
import { ledgerFilePath, sessionsFilePath } from "./paths.js";
import { evaluateGovernancePolicy } from "./policy-engine.js";
import { addRule, loadPolicy, savePolicy } from "./policy-store.js";
import { defaultPolicyDocument, resolveAskMode } from "./policy-types.js";
import { issueSession, verifySession } from "./session-tokens.js";
import { seedNamedGroup } from "./test-group.js";
import { createUser } from "./user-store.js";

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
  dir = await mkdtemp(join(tmpdir(), "governance-qa8sec-"));
  process.env.OPENCLAW_GOVERNANCE_DIR = dir;
  await seedNamedGroup(TEST_GROUP, ["agent-a", "agent-b"]);
  await savePolicy(TEST_GROUP, { ...defaultPolicyDocument(), mode: "enforce", ask: "off" });
});

afterEach(async () => {
  delete process.env.OPENCLAW_GOVERNANCE_DIR;
  await rm(dir, { recursive: true, force: true });
});

describe("secrets must not reach the audit trail", () => {
  it("redacts a credential appearing in a governed command", async () => {
    await evaluateGovernancePolicy(
      {
        toolName: "exec",
        params: { command: "curl -H 'Authorization: Bearer sk-ant-api03-SUPERSECRETVALUE' x.com" },
      },
      { agentId: "agent-a" },
    );
    const raw = await readFile(ledgerFilePath(TEST_GROUP), "utf8");
    expect(raw).not.toContain("sk-ant-api03-SUPERSECRETVALUE");
  });

  it("redacts a credential inside an ungoverned payload too", async () => {
    // The ungoverned path serialises the whole payload for forensic value, so
    // it is the easier place to leak from, not the harder one.
    await evaluateGovernancePolicy(
      { toolName: "some_unknown_tool", params: { token: "sk-ant-api03-ANOTHERSECRET" } },
      { agentId: "agent-a" },
    );
    const raw = await readFile(ledgerFilePath(TEST_GROUP), "utf8");
    expect(raw).not.toContain("sk-ant-api03-ANOTHERSECRET");
  });

  it("caps an agent-supplied resource so the trail cannot be flooded", async () => {
    // The agent chooses its own tool arguments, so an uncapped resource is a
    // denial of service against the record meant to survive an incident.
    const huge = "A".repeat(200_000);
    await evaluateGovernancePolicy(
      { toolName: "exec", params: { command: huge } },
      { agentId: "agent-a" },
    );
    const entry = (await tailLedger(TEST_GROUP)).at(-1);
    expect(entry?.resource.length ?? 0).toBeLessThan(10_000);
  });

  it("never writes a session token into the ledger", async () => {
    const user = await createUser(
      {
        username: "malek",
        password: "correct-horse-battery",
        role: "administrator",
        groupId: TEST_GROUP,
      },
      "root",
    );
    const session = await issueSession({
      id: user.id,
      username: user.username,
      role: user.role,
    });
    await appendLedgerEntry(TEST_GROUP, {
      agentId: "agent-a",
      toolName: "exec",
      resourceKind: "command",
      resource: "ls",
      ruleId: "r",
      decision: "allow",
    });
    const raw = await readFile(ledgerFilePath(TEST_GROUP), "utf8");
    expect(raw).not.toContain(session.token);
  });
});

describe("sessions expire and cannot be resurrected", () => {
  it("refuses a session past its expiry", async () => {
    const user = await createUser(
      {
        username: "malek",
        password: "correct-horse-battery",
        role: "administrator",
        groupId: TEST_GROUP,
      },
      "root",
    );
    const session = await issueSession({
      id: user.id,
      username: user.username,
      role: user.role,
    });
    // Backdate the stored expiry, as the passage of time would.
    const raw = JSON.parse(await readFile(sessionsFilePath(), "utf8")) as {
      sessions: Array<{ token: string; expiresAt: string }>;
    };
    for (const stored of raw.sessions) {
      stored.expiresAt = new Date(Date.now() - 1000).toISOString();
    }
    const { writeFile } = await import("node:fs/promises");
    await writeFile(sessionsFilePath(), JSON.stringify(raw), { mode: 0o600 });
    expect(await verifySession(session.token)).toBeUndefined();
  });

  it("issues tokens that are long and unguessable", async () => {
    const user = await createUser(
      {
        username: "malek",
        password: "correct-horse-battery",
        role: "administrator",
        groupId: TEST_GROUP,
      },
      "root",
    );
    const tokens = new Set<string>();
    for (let index = 0; index < 20; index += 1) {
      const session = await issueSession({
        id: user.id,
        username: user.username,
        role: user.role,
      });
      expect(session.token).toMatch(/^[0-9a-f]{64}$/);
      tokens.add(session.token);
    }
    expect(tokens.size).toBe(20);
  });
});

describe("agent-controlled keys cannot reach object internals", () => {
  it("an agent named __proto__ does not inherit a policy override", async () => {
    const doc = await loadPolicy(TEST_GROUP);
    // Even if such a key were present, resolution must read own properties only.
    expect(resolveAskMode(doc, "__proto__")).toBe(doc.ask);
    expect(resolveAskMode(doc, "constructor")).toBe(doc.ask);
    expect(resolveAskMode(doc, "toString")).toBe(doc.ask);
  });

  it("a tool named after an Object member is not treated as governed", async () => {
    for (const toolName of ["constructor", "__proto__", "toString", "hasOwnProperty"]) {
      const decision = await evaluateGovernancePolicy(
        { toolName, params: { command: "rm -rf /" } },
        { agentId: "agent-a" },
      );
      // Not governed, so not blocked, but it must be *recorded*, which is what
      // keeps the gap visible rather than silent.
      expect(decision, toolName).toBeUndefined();
    }
    const entries = await tailLedger(TEST_GROUP);
    expect(entries.filter((entry) => entry.decision === "ungoverned")).toHaveLength(4);
  });
});

describe("the viewer tier is confidentiality, not just read-only", () => {
  const viewer = { username: "v", role: "viewer" as const, assignedAgents: ["agent-a"] };
  const user = { username: "u", role: "user" as const, assignedAgents: ["agent-a"] };

  it("masks the resource a viewer could otherwise read", async () => {
    await evaluateGovernancePolicy(
      { toolName: "exec", params: { command: "cat /etc/shadow" } },
      { agentId: "agent-a" },
    );
    const projected = projectLedgerForActor(await tailLedger(TEST_GROUP), viewer);
    expect(projected.at(0)?.resource).toBe(REDACTED_RESOURCE);
    expect(JSON.stringify(projected)).not.toContain("/etc/shadow");
  });

  it("hides the existence of another agent entirely", async () => {
    // Filtering happens before masking on purpose: even a redacted placeholder
    // would disclose that the other agent is active.
    await evaluateGovernancePolicy(
      { toolName: "exec", params: { command: "ls" } },
      { agentId: "agent-b" },
    );
    expect(projectLedgerForActor(await tailLedger(TEST_GROUP), viewer)).toHaveLength(0);
    expect(projectLedgerForActor(await tailLedger(TEST_GROUP), user)).toHaveLength(0);
  });

  it("shows the User tier the literal resource for its own agent", async () => {
    await evaluateGovernancePolicy(
      { toolName: "exec", params: { command: "cat /etc/shadow" } },
      { agentId: "agent-a" },
    );
    expect(projectLedgerForActor(await tailLedger(TEST_GROUP), user).at(0)?.resource).toContain(
      "/etc/shadow",
    );
  });

  it("hides installation-wide administrative entries from a scoped account", async () => {
    // An installation-wide change carries no agent, so the scope filter keeps
    // it to Administrator and above. A User must not learn the posture changed.
    await addRule(TEST_GROUP, { resourceKind: "command", pattern: "^ls$" }, "kinan");
    expect(projectLedgerForActor(await tailLedger(TEST_GROUP), user)).toHaveLength(0);
  });
});

describe("a denial cannot be turned into an allow by malformed input", () => {
  it("an unparseable rule pattern never matches", async () => {
    await savePolicy(TEST_GROUP, {
      ...defaultPolicyDocument(),
      mode: "enforce",
      ask: "off",
      rules: [
        {
          id: "bad",
          resourceKind: "command",
          pattern: "([unclosed",
          createdAt: new Date().toISOString(),
        },
      ],
    });
    const decision = await evaluateGovernancePolicy(
      { toolName: "exec", params: { command: "([unclosed" } },
      { agentId: "agent-a" },
    );
    expect(decision && "block" in decision).toBe(true);
  });

  it("a rule whose expiry is unreadable is treated as expired, not as permanent", async () => {
    // Failing the other way would silently promote a temporary grant into a
    // permanent one, which is the direction that loses access control.
    await savePolicy(TEST_GROUP, {
      ...defaultPolicyDocument(),
      mode: "enforce",
      ask: "off",
      rules: [
        {
          id: "bad-date",
          resourceKind: "command",
          pattern: "^ls$",
          createdAt: new Date().toISOString(),
          expiresAt: "not-a-date",
        },
      ],
    });
    const decision = await evaluateGovernancePolicy(
      { toolName: "exec", params: { command: "ls" } },
      { agentId: "agent-a" },
    );
    expect(decision && "block" in decision).toBe(true);
  });
});
