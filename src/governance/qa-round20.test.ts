// Round twenty — everything built since round eighteen, excluding the M-series
// (2026-08-27).
//
// Round nineteen audited the M-series as one system. This one covers the *other*
// work from the same window: **T6 and finding 120's fix, T7's audit half, T28,
// T30's rotation seam, and T16's splits** — read against the nine design
// requirements in `Grad_Proj___Current.pdf` §1.3 rather than against the code's
// own idea of itself.
//
// ## What it found
//
//   - **131** — `search-audit.ts` wrote `grep`'s matched **file content** into
//     the tamper-evident ledger as a governed resource, secrets included. A
//     direct breach of **requirement 8** ("shall prevent sensitive data (such as
//     secrets or credentials) from being written in plaintext to log files"), in
//     the one file the layer protects and never deletes.
//
// ## Method note
//
// 131 was found by **mutation testing plus a requirement read**, not by either
// alone. The code carried a comment asserting the safety property — "a line that
// is not a path is simply one that will normalize to something no denial
// matches" — which is true only while no denial is broad. Reading requirement 8
// and then asking what a *broad* denial does to that sentence produced the
// reproduction in one step.
//
// The same mutation pass found one property held only by prose: search-audit
// filters expired denials, and disabling that filter left all eleven of its
// tests passing. That is a **requirement 4** property ("time-limited
// permissions"), so it is asserted here rather than left to the comment.
//
// **The first version of that assertion was wrong, and the mistake is worth
// keeping.** It used `secrets/key.pem` with an expired rule and saw the reach
// recorded anyway — which looked like the expiry filter failing. It was not:
// `.pem` is covered by a **shipped core denial**, which never expires, so the
// entry came from the floor rather than from the expired rule. A test about one
// rule has to use a resource no other rule matches, or it is measuring the
// baseline. Round five's lesson, arriving in a test of my own.
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resetAgentGroupCacheForTests } from "./agent-group.js";
import { registerAgent } from "./agent-registry.js";
import { LEDGER_ROTATE_BYTES, tailLedger } from "./audit-ledger.js";
import { resetLedgerKeyCacheForTests } from "./ledger-key.js";
import { savePolicy } from "./policy-store.js";
import { defaultPolicyDocument, type PolicyRule } from "./policy-types.js";
import { auditSearchReach } from "./search-audit.js";
import { seedGroupWithAgents } from "./test-group.js";
import { createUser, newGroupId } from "./user-store.js";

const PASSWORD = "correct-horse-battery";
const ACTOR = { name: "admin", role: "administrator" as const };
const AGENT = "reader";

let dir: string;
let groupId: string;

/** A denial broad enough to confine an agent — the realistic operator rule. */
function denial(overrides: Partial<PolicyRule> = {}): PolicyRule {
  return {
    id: "confine-to-workspace",
    resourceKind: "path",
    effect: "deny",
    tier: "admin",
    access: "read",
    pattern: ".*",
    createdAt: new Date().toISOString(),
    createdBy: "test",
    ...overrides,
  } as PolicyRule;
}

async function withRules(...rules: PolicyRule[]): Promise<void> {
  await savePolicy(groupId, { ...defaultPolicyDocument(), mode: "enforce", rules });
}

/** The shape both search tools render into. */
function toolResult(...lines: string[]): unknown {
  return { content: [{ type: "text", text: lines.join("\n") }] };
}

async function reaches(): Promise<string[]> {
  return (await tailLedger(groupId, 100))
    .filter((entry) => entry.ruleId === "search-reached-denied")
    .map((entry) => entry.resource);
}

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "governance-round20-"));
  process.env.OPENCLAW_GOVERNANCE_DIR = dir;
  await seedGroupWithAgents([]);
  resetLedgerKeyCacheForTests();
  resetAgentGroupCacheForTests();
  groupId = newGroupId();
  await createUser(
    { username: "r20-root", password: PASSWORD, role: "root", groupId },
    "bootstrap",
  );
  const admin = await createUser(
    { username: "r20-admin", password: PASSWORD, role: "administrator", groupId },
    "r20-root",
  );
  await registerAgent({ id: AGENT, displayName: "Reader", groupId, adminId: admin.id }, ACTOR);
  resetAgentGroupCacheForTests();
});

afterEach(async () => {
  delete process.env.OPENCLAW_GOVERNANCE_DIR;
  resetLedgerKeyCacheForTests();
  resetAgentGroupCacheForTests();
  await rm(dir, { recursive: true, force: true });
});

describe("finding 131 — requirement 8: no secrets in the log", () => {
  it("never writes grep's matched content into the ledger", async () => {
    // The reproduction. `grep` searching a single file omits the filename, so
    // its lines are `<lineno>: <matched text>`. The old fallback took the whole
    // line as a path candidate, resolved it, and — under a broad denial —
    // recorded it. A grep for `password` recorded the passwords it found.
    await withRules(denial());
    await auditSearchReach({
      toolName: "grep",
      toolParams: { path: "." },
      result: toolResult(
        "12:AWS_SECRET_ACCESS_KEY=wJalrXUtnFEMIK7MDENGbPxRfiCYEXAMPLEKEY",
        "13:password=hunter2",
        "14:BEGIN RSA PRIVATE KEY",
      ),
      agentId: AGENT,
      sessionKey: `agent:${AGENT}:main`,
    });

    const recorded = (await reaches()).join("\n");
    expect(recorded).not.toContain("AWS_SECRET_ACCESS_KEY");
    expect(recorded).not.toContain("hunter2");
    expect(recorded).not.toContain("PRIVATE KEY");
  });

  it("still records the file a real grep match came from", async () => {
    // The fix must not buy requirement 8 by making T7's audit useless: a
    // prefixed line still yields its path, which is the whole point of the gap.
    await withRules(denial());
    await auditSearchReach({
      toolName: "grep",
      toolParams: { path: "." },
      result: toolResult("secrets/creds.txt:3: password=hunter2"),
      agentId: AGENT,
      sessionKey: `agent:${AGENT}:main`,
    });

    const recorded = await reaches();
    expect(recorded).toHaveLength(1);
    expect(recorded[0]).toMatch(/creds\.txt$/);
    // The path, and nothing that stood next to it on the line.
    expect(recorded[0]).not.toContain("hunter2");
  });

  it("reads a context line for its path and not for its text", async () => {
    // `grep` renders the lines around a match as `path-N- text`, which the
    // match pattern does not recognise. Left unhandled that was either the same
    // content leak (before the fix) or a missed reach (after it).
    await withRules(denial());
    await auditSearchReach({
      toolName: "grep",
      toolParams: { path: "." },
      result: toolResult("secrets/creds.txt-4- api_token=sk-live-abcdef"),
      agentId: AGENT,
      sessionKey: `agent:${AGENT}:main`,
    });

    const recorded = await reaches();
    expect(recorded).toHaveLength(1);
    expect(recorded[0]).toMatch(/creds\.txt$/);
    expect(recorded.join("\n")).not.toContain("sk-live-abcdef");
  });

  it("keeps reading bare paths from find and ls, which report no line numbers", async () => {
    // The narrowing applies to `grep` alone. `find` and `ls` emit paths by
    // construction, so requiring a prefix there would delete the audit.
    //
    // `notes/diary.txt` rather than anything credential-shaped: the shipped core
    // denials already cover `.pem`, `.env` and friends, so a test using one of
    // those cannot tell its own rule from the floor underneath it.
    await withRules(denial({ pattern: "(^|/)diary\\.txt$" }));
    await auditSearchReach({
      toolName: "find",
      toolParams: { path: "." },
      result: toolResult("notes/diary.txt", "README.md"),
      agentId: AGENT,
      sessionKey: `agent:${AGENT}:main`,
    });

    expect((await reaches())[0]).toMatch(/diary\.txt$/);
  });
});

describe("requirement 4 — time-limited permissions bind the audit too", () => {
  it("does not report a reach against an expired denial", async () => {
    // Found by mutation: deleting the expiry filter left all eleven
    // search-audit tests passing. An expired rule denies nothing, so recording
    // `search-reached-denied` against one asserts in the tamper-evident trail
    // that an agent reached something forbidden when nothing forbade it.
    await withRules(
      denial({
        pattern: "(^|/)diary\\.txt$",
        expiresAt: new Date(Date.now() - 60_000).toISOString(),
      }),
    );
    await auditSearchReach({
      toolName: "find",
      toolParams: { path: "." },
      result: toolResult("notes/diary.txt"),
      agentId: AGENT,
      sessionKey: `agent:${AGENT}:main`,
    });

    expect(await reaches()).toHaveLength(0);
  });

  it("still reports one that has not expired yet", async () => {
    // Both directions, so the test above cannot pass by the audit being broken.
    await withRules(
      denial({
        pattern: "(^|/)diary\\.txt$",
        expiresAt: new Date(Date.now() + 600_000).toISOString(),
      }),
    );
    await auditSearchReach({
      toolName: "find",
      toolParams: { path: "." },
      result: toolResult("notes/diary.txt"),
      agentId: AGENT,
      sessionKey: `agent:${AGENT}:main`,
    });

    expect(await reaches()).toHaveLength(1);
  });
});

describe("T30 — the rotation seam cannot weaken the shipped threshold", () => {
  it("ships the 8 MB threshold regardless of the test override", async () => {
    // The seam exists so two rotation tests stop taking two minutes and timing
    // out under load. It is an in-process function a test calls — not reachable
    // from configuration, a policy document or the network — and the shipped
    // constant is asserted separately so lowering it cannot hide a change to
    // the real one. Asserted here too, because that separation is the entire
    // argument for allowing an adjustable security constant at all.
    expect(LEDGER_ROTATE_BYTES).toBe(8 * 1024 * 1024);
  });
});

describe("requirement 5 — the gap is recorded as a gap", () => {
  it("records the reach as ungoverned rather than as a decision", async () => {
    // Requirement 5 is "record 100% of agent actions, policy decisions and
    // administrative approvals". A search that reached a denied path is an
    // action that happened without the gate judging it, and `ungoverned` is the
    // ledger's existing word for exactly that. Calling it `deny` would inflate
    // the count of things the gate stopped with things it did not.
    await withRules(denial({ pattern: "(^|/)diary\\.txt$" }));
    await auditSearchReach({
      toolName: "find",
      toolParams: { path: "." },
      result: toolResult("notes/diary.txt"),
      agentId: AGENT,
      sessionKey: `agent:${AGENT}:main`,
    });

    const entry = (await tailLedger(groupId, 100)).find(
      (e) => e.ruleId === "search-reached-denied",
    );
    expect(entry?.decision).toBe("ungoverned");
  });

  it("records nothing at all when governance is switched off", async () => {
    // Recording oversight that is not running would be a false entry in the
    // trail — the mirror of the green-tick class this project treats as its
    // worst defect.
    await savePolicy(groupId, {
      ...defaultPolicyDocument(),
      mode: "off",
      rules: [denial({ pattern: "(^|/)diary\\.txt$" })],
    });
    await auditSearchReach({
      toolName: "find",
      toolParams: { path: "." },
      result: toolResult("notes/diary.txt"),
      agentId: AGENT,
      sessionKey: `agent:${AGENT}:main`,
    });

    expect(await reaches()).toHaveLength(0);
  });
});
