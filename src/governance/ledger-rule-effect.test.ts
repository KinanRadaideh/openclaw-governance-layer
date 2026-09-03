// What a rule-change entry has to say for the trail to mean anything.
//
// Found by T38, by reading the ledger on screen after using the folder-grant
// form (2026-08-31). That feature writes an **allow** rule and a **deny** rule
// as one act, and the two entries it produced were:
//
//   governance.policy.rule.add path ^C:/srv/app(/|$)         (all agents, indefinite)
//   governance.policy.rule.add path ^C:/srv/app/secrets(/|$) (all agents, indefinite)
//
// Identical in form, opposite in meaning, and nothing in either says which was
// which. `describeRule` recorded kind, pattern, scope and expiry and omitted
// `effect`, so the tamper-evident record of policy changes could not
// distinguish *an operator granted access to this path* from *an operator
// forbade it*. Requirement #5 asks the log to record policy decisions; a
// decision whose direction is unrecoverable is not recorded.
//
// `access` was missing for the same reason and matters for the same reason: a
// path rule allowing **write** and one allowing **read** are different grants,
// and the older entry is the one an investigation reads.
//
// Nothing caught it because every existing assertion checks that the pattern
// reaches the entry, which it always did. The direction was never asserted
// because it was never written.
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { tailLedger } from "./audit-ledger.js";
import { resetLedgerKeyCacheForTests } from "./ledger-key.js";
import { addRule, removeRule, savePolicy } from "./policy-store.js";
import { defaultPolicyDocument } from "./policy-types.js";
import { seedGroupWithAgents } from "./test-group.js";

const ACTOR = { name: "amina", role: "administrator" } as const;

let dir: string;
let group: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "governance-rule-effect-"));
  process.env.OPENCLAW_GOVERNANCE_DIR = dir;
  resetLedgerKeyCacheForTests();
  group = await seedGroupWithAgents(["agent-a"]);
  await savePolicy(group, defaultPolicyDocument());
});

afterEach(async () => {
  delete process.env.OPENCLAW_GOVERNANCE_DIR;
  resetLedgerKeyCacheForTests();
  await rm(dir, { recursive: true, force: true });
});

async function lastAdd(): Promise<string> {
  const entries = await tailLedger(group, 200);
  // The most recent add, not the first: several tests write more than one.
  const entry = entries.findLast((e) => e.toolName === "governance.policy.rule.add");
  return entry?.resource ?? "";
}

describe("a rule-change entry records which direction the change went", () => {
  it("says a denial is a denial", async () => {
    await addRule(
      group,
      { resourceKind: "network", pattern: "^registry\\.npmjs\\.org$", effect: "deny" },
      ACTOR,
    );

    expect(await lastAdd()).toContain("deny");
  });

  it("says an allowance is an allowance, rather than leaving it to be inferred", async () => {
    // Stated rather than implied by absence. An entry that names one direction
    // and stays silent for the other reads as an incomplete record of the
    // second, and "silence means allow" is exactly the convention an auditor
    // cannot check.
    await addRule(group, { resourceKind: "command", pattern: "^ls$" }, ACTOR);

    expect(await lastAdd()).toContain("allow");
  });

  it("distinguishes the two entries the folder grant writes as one act", async () => {
    // The case that found this. Both are path rules over overlapping patterns
    // and they mean opposite things.
    await addRule(group, { resourceKind: "path", pattern: "^/srv/app(/|$)" }, ACTOR);
    const allow = await lastAdd();
    await addRule(
      group,
      { resourceKind: "path", pattern: "^/srv/app/secrets(/|$)", effect: "deny" },
      ACTOR,
    );
    const deny = await lastAdd();

    expect(allow).not.toBe(deny);
    expect({
      allowSaysAllow: allow.includes("allow"),
      denySaysDeny: deny.includes("deny"),
    }).toEqual({ allowSaysAllow: true, denySaysDeny: true });
  });

  it("records the direction of a path rule's access, which is a different grant", async () => {
    await addRule(group, { resourceKind: "path", pattern: "^/srv/app/.*", access: "write" }, ACTOR);

    expect(await lastAdd()).toContain("write");
  });

  it("says the same things when a rule is removed", async () => {
    // The removal entry uses the same description, and an auditor asking what
    // protection was taken away needs the direction most of all.
    const rule = await addRule(
      group,
      { resourceKind: "path", pattern: "^/etc/shadow$", effect: "deny" },
      ACTOR,
    );

    await removeRule(group, rule.id, ACTOR);

    const removed = (await tailLedger(group, 200)).findLast(
      (e) => e.toolName === "governance.policy.rule.remove",
    );
    expect(removed?.resource).toContain("deny");
  });

  it("still records kind, pattern, scope and expiry", async () => {
    // The fields that were already there must survive the change: this entry
    // is the one an investigation reads, and narrowing it would be a worse
    // defect than the one being fixed.
    await addRule(group, { resourceKind: "command", pattern: "^ls$", agentId: "agent-a" }, ACTOR);

    const resource = await lastAdd();
    expect(resource).toContain("command");
    expect(resource).toContain("^ls$");
    expect(resource).toContain("agent-a");
    expect(resource).toContain("indefinite");
  });
});
