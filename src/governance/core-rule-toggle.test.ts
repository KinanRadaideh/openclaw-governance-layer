// T24 — Root may switch off the five core denials that are not self-protecting,
// and may not touch the three that are.
//
// The interesting tests are not "can Root disable a rule" but the three
// properties that make it safe to allow at all:
//
//   1. A self-protecting rule is refused from every direction, including a
//      hand-edited `policy.json` — the file the core tier exists to survive.
//   2. Disabling changes what is *enforced* and nothing about what is
//      *declared*, so a disabled rule comes back intact.
//   3. A lowered floor cannot hide: it is recorded as its own audit action and
//      it fails the deployment report.
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { tailLedger } from "./audit-ledger.js";
import { coreRules, seedRuleId } from "./baseline-policy.js";
import { resetLedgerKeyCacheForTests } from "./ledger-key.js";
import { policyFilePath } from "./paths.js";
import { evaluateGovernancePolicy } from "./policy-engine.js";
import {
  loadPolicy,
  NotACoreRuleError,
  savePolicy,
  SelfProtectingCoreRuleError,
  setCoreRuleEnabled,
} from "./policy-store.js";
import { defaultPolicyDocument } from "./policy-types.js";

let dir: string;
let workspace: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "governance-core-toggle-"));
  process.env.OPENCLAW_GOVERNANCE_DIR = dir;
  resetLedgerKeyCacheForTests();
  workspace = await mkdtemp(join(tmpdir(), "governance-core-ws-"));
  await savePolicy({ ...defaultPolicyDocument(), mode: "enforce", ask: "off" });
});

afterEach(async () => {
  delete process.env.OPENCLAW_GOVERNANCE_DIR;
  resetLedgerKeyCacheForTests();
  await rm(dir, { recursive: true, force: true });
  await rm(workspace, { recursive: true, force: true });
});

const ctx = () => ({ agentId: "a1", sessionKey: "agent:a1:main", cwd: workspace });

function verdict(decision: Awaited<ReturnType<typeof evaluateGovernancePolicy>>): string {
  if (!decision) {
    return "allow";
  }
  if ("block" in decision) {
    return "block";
  }
  // T23 — absence is no longer the only way the engine says "allow". A call
  // whose path was redirected comes back carrying `params` (the canonical path
  // the tool should open), and reading that as "ask" would report an
  // escalation that never happened. Ask the question directly instead of
  // inferring it from a missing value.
  return "requireApproval" in decision ? "ask" : "allow";
}

const idFor = (fragment: string) =>
  coreRules()
    .map((rule) => ({ id: seedRuleId(rule), rule }))
    .find((entry) => entry.id.includes(fragment))!;

describe("the five that are Root's to decide", () => {
  it("splits exactly three self-protecting from five ordinary denials", () => {
    const declared = coreRules();
    const selfProtecting = declared.filter((rule) => rule.selfProtecting);
    // Asserted as a count so that adding a core rule without deciding which
    // side it falls on fails here rather than silently becoming disableable.
    // The dynamic governance-directory rules are self-protecting too, so the
    // count is "at least three", and every one of them must be a denial.
    expect(selfProtecting.length).toBeGreaterThanOrEqual(3);
    for (const rule of selfProtecting) {
      expect(rule.effect).toBe("deny");
    }
    expect(declared.filter((rule) => !rule.selfProtecting).length).toBe(5);
  });

  it("stops enforcing a disabled rule, and resumes when it is re-enabled", async () => {
    const sudo = idFor("privilege-escalation");
    // Before: the shipped denial refuses it.
    expect(
      verdict(
        await evaluateGovernancePolicy({ toolName: "exec", params: { command: "sudo ls" } }, ctx()),
      ),
    ).toBe("block");

    await setCoreRuleEnabled(sudo.id, false, "rootie");

    // After: the denial is gone, so the call falls through to the ordinary
    // default-deny path — which still refuses it, because no rule allows it.
    // That is the point worth seeing: disabling a *denial* does not grant
    // anything, it only stops the denial from overriding a later allowance.
    expect((await loadPolicy()).rules.some((rule) => rule.id === sudo.id)).toBe(false);

    await setCoreRuleEnabled(sudo.id, true, "rootie");
    expect((await loadPolicy()).rules.some((rule) => rule.id === sudo.id)).toBe(true);
  });

  it("lets an operator rule take effect once the core denial is off", async () => {
    const sudo = idFor("privilege-escalation");
    const { addRule } = await import("./policy-store.js");
    await addRule({ resourceKind: "command", pattern: "^sudo ls$" });

    // A core denial is consulted before allow rules, so the allowance is inert
    // while it stands. This is the whole reason an operator might need the
    // switch: previously their only option was to disable the entire gate.
    expect(
      verdict(
        await evaluateGovernancePolicy({ toolName: "exec", params: { command: "sudo ls" } }, ctx()),
      ),
    ).toBe("block");

    await setCoreRuleEnabled(sudo.id, false, "rootie");
    expect(
      verdict(
        await evaluateGovernancePolicy({ toolName: "exec", params: { command: "sudo ls" } }, ctx()),
      ),
    ).toBe("allow");
  });

  it("keeps the rule declared, so nothing is lost by switching it off", async () => {
    const creds = idFor("credential-files");
    await setCoreRuleEnabled(creds.id, false, "rootie");

    // Still in source, still rebuilt on every load, still one setting from
    // returning. The reassertion guarantee is unchanged; what the document
    // carries is a decision, not an edit.
    expect(coreRules().some((rule) => seedRuleId(rule) === creds.id)).toBe(true);
    await setCoreRuleEnabled(creds.id, true, "rootie");
    expect((await loadPolicy()).rules.some((rule) => rule.id === creds.id)).toBe(true);
  });
});

describe("the three that protect the layer itself", () => {
  it("refuses to disable the governance-state denial", async () => {
    const state = idFor("governance-layer-s-own-policy");
    await expect(setCoreRuleEnabled(state.id, false, "rootie")).rejects.toBeInstanceOf(
      SelfProtectingCoreRuleError,
    );
    expect((await loadPolicy()).rules.some((rule) => rule.id === state.id)).toBe(true);
  });

  it("refuses to disable the governance command line", async () => {
    const cli = idFor("governance-command-line");
    await expect(setCoreRuleEnabled(cli.id, false, "rootie")).rejects.toBeInstanceOf(
      SelfProtectingCoreRuleError,
    );
  });

  it("ignores a hand-edited policy.json that lists a self-protecting rule", async () => {
    // The attack the core tier exists to survive: edit the file directly. The
    // load path must not trust `disabledCoreRules` any more than it trusts a
    // stored rule claiming `tier: "core"`.
    const cli = idFor("governance-command-line");
    const raw = JSON.parse(await readFile(policyFilePath(), "utf8"));
    raw.disabledCoreRules = [cli.id];
    await writeFile(policyFilePath(), JSON.stringify(raw));

    const loaded = await loadPolicy();
    expect(loaded.rules.some((rule) => rule.id === cli.id)).toBe(true);
    // And it still blocks, which is the property that matters rather than the
    // rule merely being present in a list.
    expect(
      verdict(
        await evaluateGovernancePolicy(
          { toolName: "exec", params: { command: "openclaw governance policy set-mode off" } },
          ctx(),
        ),
      ),
    ).toBe("block");
  });

  it("refuses a rule id that is not a core rule at all", async () => {
    await expect(setCoreRuleEnabled("not-a-real-rule", false, "rootie")).rejects.toBeInstanceOf(
      NotACoreRuleError,
    );
  });
});

describe("a lowered floor cannot hide", () => {
  it("records the change as its own action, naming the rule", async () => {
    const sudo = idFor("privilege-escalation");
    await setCoreRuleEnabled(sudo.id, false, "rootie");

    const entries = await tailLedger(50);
    const entry = entries.find((e) => e.toolName === "governance.policy.core-rule");
    expect(entry?.actor).toBe("rootie");
    expect(entry?.ruleId).toBe(sudo.id);
    // "core rule disabled" without saying which is an entry an investigation
    // cannot use.
    expect(entry?.resource).toContain("Privilege escalation");
    expect(entry?.decision).toBe("deny");
  });

  it("records a re-enable distinguishably from a disable", async () => {
    const sudo = idFor("privilege-escalation");
    await setCoreRuleEnabled(sudo.id, false, "rootie");
    await setCoreRuleEnabled(sudo.id, true, "rootie");

    const entries = (await tailLedger(50)).filter(
      (e) => e.toolName === "governance.policy.core-rule",
    );
    expect(entries).toHaveLength(2);
    expect(entries.map((e) => e.decision)).toEqual(["deny", "allow"]);
  });

  it("fails the deployment report while any core rule is off", async () => {
    const { readDeploymentStatus } = await import("./deployment-status.js");
    const environment = {
      bind: "loopback" as const,
      port: 18_799,
      authMode: "token" as const,
      authSecretConfigured: true,
      tailscaleMode: "off",
      controlUiEnabled: true,
      hasNonLoopbackTrustedProxy: false,
      tlsEnabled: false,
      gatewayFindings: [],
    };

    const before = await readDeploymentStatus(environment);
    expect(before.checks.find((c) => c.id === "deployment.core_rules_intact")?.status).toBe("pass");

    await setCoreRuleEnabled(idFor("privilege-escalation").id, false, "rootie");

    const after = await readDeploymentStatus(environment);
    const check = after.checks.find((c) => c.id === "deployment.core_rules_intact");
    // `fail`, not `warn`. Chapter 4 quotes this report as evidence, and an
    // installation that looked clean while a shipped denial was switched off
    // would be worse than having no report.
    expect(check?.status).toBe("fail");
    expect(check?.detail).toContain("privilege-escalation");
  });
});
