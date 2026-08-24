// QA round 13 — the thirteenth review pass, and the first run as an
// independent adversarial review rather than as a follow-up to the previous
// round.
//
// Method, because it is the finding as much as any individual defect: read the
// requirements first, attack the running gate second, open the source third.
// Reading the source first is how every earlier round began, and it is how a
// reviewer inherits the author's model of the system — the shared blind spot
// rounds five and six identified.
//
// The headline is that round eleven's durable fix — a test comparing the
// governed-tool registry against the host's own tool list — compared against
// the wrong list and could not fail. It read `allToolNames`, the barrel for the
// seven *session* tools, all seven of which round eleven had just registered.
// The host declares fifty-two in `tool-catalog.ts`, of which seven were
// governed. That guard is corrected in `qa-round11.test.ts`; the tests below
// pin the behaviour the correction exposed.
//
// Each case here began as a probe that the gate answered wrongly. The probes
// are kept in `docs-notes/qa-round13-probes/` for reproduction.
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { matchesPattern } from "./pattern-match.js";
import { evaluateGovernancePolicy } from "./policy-engine.js";
import { loadPolicy, savePolicy } from "./policy-store.js";
import { resolveGovernedTool } from "./resource-extraction.js";
import { validateRulePattern } from "./rule-validation.js";

let dir: string;
let workspace: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "governance-qa13-"));
  process.env.OPENCLAW_GOVERNANCE_DIR = dir;
  workspace = await mkdtemp(join(tmpdir(), "governance-qa13-ws-"));
});

afterEach(async () => {
  delete process.env.OPENCLAW_GOVERNANCE_DIR;
  await rm(dir, { recursive: true, force: true });
  await rm(workspace, { recursive: true, force: true });
});

const ctx = () => ({ agentId: "agent-a", sessionKey: "agent:agent-a:main", cwd: workspace });

/** Written this way so no shell or editor between here and the file can eat it. */
const BACKSLASH = String.fromCharCode(92);

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

/** Refuse rather than escalate, keeping the shipped rules. */
async function enforceStrictly(): Promise<void> {
  const doc = await loadPolicy();
  await savePolicy({ ...doc, mode: "enforce", ask: "off" });
}

/**
 * Enforce, plus a wide-open allowance for one kind, so that a `block` verdict
 * can only have come from a **denial**.
 *
 * Note the deliberate absence of a multi-line case anywhere that uses this: `.`
 * does not match a line terminator, so `^.*$` fails to match a command
 * containing a newline and the call is refused by default-deny instead — the
 * right verdict for the wrong reason. The round-13 probe harness had exactly
 * that flaw, which is the round-seven mock-response defect in miniature, and it
 * is why the newline case below installs a rule that genuinely matches.
 */
async function onlyDenialsCanRefuse(kind: "command" | "path" | "network"): Promise<void> {
  const doc = await loadPolicy();
  await savePolicy({
    ...doc,
    mode: "enforce",
    ask: "off",
    rules: [
      ...doc.rules,
      {
        id: `qa13-open-${kind}`,
        resourceKind: kind,
        effect: "allow",
        tier: "admin",
        pattern: "^[\\s\\S]*$",
        createdAt: new Date().toISOString(),
        createdBy: "qa13",
      } as never,
    ],
  });
}

describe("qa round 13 — control surfaces are governed (findings 71–73)", () => {
  /**
   * Finding 71, and the one that matters most: this is round eleven's
   * `terminal` defect on the sibling tool, five days later.
   *
   * `exec` with `background: true` leaves a shell running; `process` types into
   * it through `data` / `literal` / `text` / `keys`. Neither the allowlist nor
   * any core denial was consulted, because `process` was not in the registry at
   * all. A gate that covers the front door of a shell and not its keyboard is
   * not covering the shell — and the fix for that sentence had been applied to
   * one tool rather than to the sentence.
   */
  it("refuses privilege escalation typed into a backgrounded shell", async () => {
    await onlyDenialsCanRefuse("command");
    for (const params of [
      { action: "write", sessionId: "s1", data: "sudo -i\n" },
      { action: "send-keys", sessionId: "s1", literal: "sudo -i" },
      { action: "send-keys", sessionId: "s1", keys: ["sudo", "-i"] },
      { action: "paste", sessionId: "s1", text: "sudo -i" },
    ]) {
      const decision = await evaluateGovernancePolicy({ toolName: "process", params }, ctx());
      expect(verdict(decision), JSON.stringify(params)).toBe("block");
    }
  });

  it("governs a desktop keystroke as the command it is", async () => {
    // Finding 72. `computer` delivers synthetic keyboard and mouse events to a
    // real desktop, so an agent refused `exec` could open a terminal window and
    // type instead. Governing it as `command` means the core denial that stops
    // `exec` running sudo stops this too, without that rule knowing `computer`
    // exists.
    await onlyDenialsCanRefuse("command");
    const decision = await evaluateGovernancePolicy(
      { toolName: "computer", params: { action: "type", text: "sudo rm -rf /" } },
      ctx(),
    );
    expect(verdict(decision)).toBe("block");
  });

  it("finds the typed text even when the host nests it (mobile_ui)", async () => {
    // `mobile_ui` has no top-level `text`: the payload is
    // `mobileAction: {type:"set_text", ref, text}`. Written from memory the
    // first time, and wrong — which is the registry-versus-host mistake
    // beginning a fourth time. The object is serialised whole rather than
    // reaching for a field name, so guessing cannot be what makes it work.
    await onlyDenialsCanRefuse("command");
    const decision = await evaluateGovernancePolicy(
      {
        toolName: "mobile_ui",
        params: { action: "act", mobileAction: { type: "set_text", ref: "n1", text: "sudo -i" } },
      },
      ctx(),
    );
    expect(verdict(decision)).toBe("block");
  });

  it("requires an explicit grant for every control surface, by default", async () => {
    // Default-deny, applied to the surface the requirement actually names.
    // None of these is on the baseline allowlist, so under `enforce` each is
    // refused until an operator grants it — which is requirement #3 for
    // "process execution" rather than for `exec` alone.
    await enforceStrictly();
    for (const toolName of [
      "process",
      "computer",
      "screen",
      "browser",
      "nodes",
      "gateway",
      "automations",
      "sessions_spawn",
      "subagents",
      "code_execution",
      "mobile_ui",
    ]) {
      expect(resolveGovernedTool(toolName), `${toolName} has an extractor`).toBeDefined();
      const decision = await evaluateGovernancePolicy(
        { toolName, params: { action: "list" } },
        ctx(),
      );
      expect(verdict(decision), toolName).toBe("block");
    }
  });

  it("lets an operator grant one surface without granting the rest", async () => {
    // The resource shape has to be writable as a rule, or governing the surface
    // just breaks it. `<tool>:<action>` is what makes a targeted grant possible.
    const doc = await loadPolicy();
    await savePolicy({
      ...doc,
      mode: "enforce",
      ask: "off",
      rules: [
        ...doc.rules,
        {
          id: "qa13-screenshot",
          resourceKind: "command",
          effect: "allow",
          tier: "admin",
          pattern: "^computer:screenshot$",
          createdAt: new Date().toISOString(),
          createdBy: "qa13",
        } as never,
      ],
    });
    const allowed = await evaluateGovernancePolicy(
      { toolName: "computer", params: { action: "screenshot" } },
      ctx(),
    );
    expect(verdict(allowed)).toBe("allow");
    const refused = await evaluateGovernancePolicy(
      { toolName: "computer", params: { action: "type", text: "whoami" } },
      ctx(),
    );
    expect(verdict(refused)).toBe("block");
  });
});

describe("qa round 13 — a hand-edited policy cannot switch the gate off (finding 80)", () => {
  /**
   * `POST policy/agent-mode` refuses `off` at every tier and explains why: the
   * engine returns *before* the lockdown check, so a per-agent `off` removes
   * the kill switch and the core denials as well as the ordinary rules, and
   * leaves no ledger entry saying so.
   *
   * That refusal guarded the route and not the file. `loadPolicy` re-asserts
   * `CORE_RULES` on every load precisely so a hand-edited `policy.json` cannot
   * remove them — and the same file defeated that one field away. You did not
   * remove the protections; you switched off the agent they applied to.
   */
  it("ignores a stored per-agent `off` and keeps the kill switch binding", async () => {
    const doc = await loadPolicy();
    await savePolicy({
      ...doc,
      mode: "enforce",
      ask: "off",
      lockedAgents: ["agent-a"],
      agentMode: { "agent-a": "off" as never },
    });
    const decision = await evaluateGovernancePolicy(
      { toolName: "read", params: { path: ".env" } },
      ctx(),
    );
    expect(verdict(decision)).toBe("block");
    // Dropped rather than coerced upward: an absent override means "follow the
    // installation default", which is the documented meaning of having none.
    expect((await loadPolicy()).agentMode["agent-a"]).toBeUndefined();
  });

  it("still honours the two postures the route does accept", async () => {
    const doc = await loadPolicy();
    await savePolicy({ ...doc, agentMode: { "agent-a": "monitor", "agent-b": "enforce" } });
    const reloaded = await loadPolicy();
    expect(reloaded.agentMode["agent-a"]).toBe("monitor");
    expect(reloaded.agentMode["agent-b"]).toBe("enforce");
  });
});

describe("qa round 13 — the gate cannot be stopped by a rule (finding 79)", () => {
  /**
   * `^(.*a){20}$` passed `checkRegexSafety` because a `{n}` with no comma was
   * treated as a fixed count that "cannot blow up". That is true of the
   * quantifier and false of the construction. Measured before the fix: one
   * `matchesPattern` call took **142,431 ms** against a 31-character
   * non-matching input, with the event loop blocked throughout.
   *
   * The timing assertion is the point. A test that only checked the validator
   * would pass against a heuristic that happened to reject this one shape while
   * missing its neighbours, so the cost is measured rather than assumed.
   */
  it("rejects the measured pattern, and matching stays fast for what it accepts", () => {
    expect(validateRulePattern("^(.*a){20}$").ok).toBe(false);

    const victim = `${"a".repeat(40)}!`;
    for (const pattern of ["^(a|a)+$", "^(a|ab)+$", "^([a-z]|[a-z])+$", "^ls( -[a-z]+)?$"]) {
      const validation = validateRulePattern(pattern);
      if (!validation.ok) {
        continue;
      }
      const startedAt = Date.now();
      matchesPattern(pattern, victim);
      expect(Date.now() - startedAt, pattern).toBeLessThan(1000);
    }
  });
});

describe("qa round 13 — core denials cover the ordinary spellings (findings 73–75, 85)", () => {
  /**
   * The separator class was `(^|[;&|]\s*)`: one of exactly three
   * metacharacters, immediately before the optional whitespace. Every string
   * below reached the shell when measured against the running gate.
   *
   * `su""do -i` is deliberately absent. Shell quoting splits the command name
   * itself, and no pattern over the raw string catches that — the file header
   * of `baseline-policy.ts` says so, and this test asserts the boundary of the
   * claim rather than pretending it is wider.
   */
  it("refuses privilege escalation however the command line reaches it", async () => {
    await onlyDenialsCanRefuse("command");
    const spellings = [
      "sudo -i",
      "ls; sudo -i",
      "ls && sudo -i",
      "echo `sudo -i`",
      "echo $(sudo -i)",
      "FOO=1 sudo -i",
      "  sudo -i",
      "/usr/bin/sudo -i",
      `ls${String.fromCharCode(10)}sudo -i`,
      ["C:", "Windows", "System32", "runas /user:Administrator cmd"].join(BACKSLASH),
    ];
    for (const command of spellings) {
      const decision = await evaluateGovernancePolicy(
        { toolName: "exec", params: { command } },
        ctx(),
      );
      expect(verdict(decision), JSON.stringify(command)).toBe("block");
    }
  });

  it("does not refuse a command that merely contains the letters", async () => {
    // The widening blocks more than strictly intended by design, but it must
    // not swallow unrelated command names — `mysudo` and `--use-sudo` are not
    // invocations of `sudo`.
    await onlyDenialsCanRefuse("command");
    for (const command of ["mysudoku --help", "git commit -m sudoku"]) {
      const decision = await evaluateGovernancePolicy(
        { toolName: "exec", params: { command } },
        ctx(),
      );
      expect(verdict(decision), command).toBe("allow");
    }
  });

  it("refuses the governance state directory in either path separator", async () => {
    // The pattern spelled the path with `/` only, so the plain Windows
    // spelling was not matched — on the platform this project is developed on.
    await onlyDenialsCanRefuse("command");
    for (const command of [
      "cat ~/.openclaw/governance/policy.json",
      ["type %USERPROFILE%", ".openclaw", "governance", "policy.json"].join(BACKSLASH),
    ]) {
      const decision = await evaluateGovernancePolicy(
        { toolName: "exec", params: { command } },
        ctx(),
      );
      expect(verdict(decision), command).toBe("block");
    }
  });

  it("refuses the governance command line itself (finding 73)", async () => {
    // The bypass that had been recorded only as an attribution limitation:
    // no login on the CLI, and the directory rule does not cover the command.
    await onlyDenialsCanRefuse("command");
    for (const command of [
      "openclaw governance policy set-mode off",
      "node openclaw.mjs governance policy set-mode off",
      "npx openclaw governance policy set-mode off",
      "pnpm openclaw governance kill agent-a",
      "openclaw governance users list",
    ]) {
      const decision = await evaluateGovernancePolicy(
        { toolName: "exec", params: { command } },
        ctx(),
      );
      expect(verdict(decision), command).toBe("block");
    }
  });

  it("refuses the metadata endpoint in its IPv6 spellings (finding 75)", async () => {
    await onlyDenialsCanRefuse("network");
    for (const url of [
      "http://169.254.169.254/latest/meta-data/",
      "http://[::ffff:169.254.169.254]/latest/",
      "http://[::ffff:a9fe:a9fe]/latest/",
      "http://[fd00:ec2::254]/latest/",
      "http://100.100.100.200/latest/",
      "http://metadata/computeMetadata/v1/",
      "http://metadata.google.internal/computeMetadata/v1/",
    ]) {
      const decision = await evaluateGovernancePolicy(
        { toolName: "web_fetch", params: { url } },
        ctx(),
      );
      expect(verdict(decision), url).toBe("block");
    }
  });

  it("leaves ordinary hosts alone", async () => {
    await onlyDenialsCanRefuse("network");
    for (const url of ["https://api.example.com/v1", "https://metadata-service.example.com/"]) {
      const decision = await evaluateGovernancePolicy(
        { toolName: "web_fetch", params: { url } },
        ctx(),
      );
      expect(verdict(decision), url).toBe("allow");
    }
  });

  it("refuses a credential file the agent creates under a different casing (finding 85)", async () => {
    // Reading an *existing* `.env` spelled `.ENV` was already denied, because
    // the canonicaliser resolves the real on-disk name first — that was
    // verified, not assumed. The gap was a file that does not exist yet, where
    // the basename survives as the agent typed it.
    await onlyDenialsCanRefuse("path");
    for (const path of ["ID_RSA", "NEW.ENV", "certs/server.PEM", "sub/.ENV", ".Env"]) {
      const decision = await evaluateGovernancePolicy(
        { toolName: "write", params: { path } },
        ctx(),
      );
      expect(verdict(decision), path).toBe("block");
    }
  });
});

describe("qa round 13 — the shipped rules meet the standard they impose", () => {
  /**
   * `BASELINE-RULES.md` states that the shipped rules are held to the same
   * standard as an operator's, because "a validator the defaults would fail is
   * a validator nobody believes". Round 13 both widened several shipped
   * patterns and tightened the validator (finding 79), so the claim is now
   * asserted rather than restated — if the two ever drift, this fails.
   */
  it("every core and baseline pattern passes the operator-facing validator", async () => {
    const { CORE_RULES, BASELINE_RULES } = await import("./baseline-policy.js");
    for (const rule of [...CORE_RULES, ...BASELINE_RULES]) {
      const result = validateRulePattern(rule.pattern);
      expect(
        result.ok,
        `${rule.description ?? rule.pattern}: ${JSON.stringify(rule.pattern)}`,
      ).toBe(true);
    }
  });
});

describe("qa round 13 — a refusal records every resource it refused", () => {
  /**
   * Requirement #5 asks for 100% of policy decisions. The allow pass has
   * evaluated every resource since round one (finding 5), so that a patch
   * touching several paths shows its full blast radius. The deny pass returned
   * on the first match, so the same patch touching three *forbidden* files was
   * recorded as touching one — the identical defect, in the half of the engine
   * that matters more, unnoticed because a blocked call feels like it needs only
   * one reason.
   *
   * Found while fixing a fixture that the credential-denial extension had
   * started tripping, which is worth recording: the test that caught this was
   * not looking for it.
   */
  it("records all three refused paths, not just the one in the message", async () => {
    const { tailLedger } = await import("./audit-ledger.js");
    await enforceStrictly();
    const decision = await evaluateGovernancePolicy(
      {
        toolName: "apply_patch",
        params: {},
        derivedPaths: [".env", "id_rsa", "certs/server.pem"],
      },
      ctx(),
    );
    expect(verdict(decision)).toBe("block");
    const refused = (await tailLedger(50))
      .filter((entry) => entry.entryKind !== "admin" && entry.decision === "deny")
      .map((entry) => entry.resource);
    expect(refused).toEqual([".env", "id_rsa", "certs/server.pem"]);
  });
});

describe("qa round 13 — the kill switch holds on every path (finding 81)", () => {
  it("refuses a call that carries no agent id while a lockdown is in force", async () => {
    const doc = await loadPolicy();
    await savePolicy({ ...doc, mode: "enforce", lockedAgents: ["agent-a"] });
    const decision = await evaluateGovernancePolicy(
      { toolName: "exec", params: { command: "ls" } },
      { cwd: workspace },
    );
    expect(verdict(decision)).toBe("block");
  });

  it("still refuses when only the session key identifies the locked agent", async () => {
    // The B6 fallback, re-asserted alongside its residue so the two cannot
    // drift apart again.
    const doc = await loadPolicy();
    await savePolicy({ ...doc, mode: "enforce", lockedAgents: ["agent-a"] });
    const decision = await evaluateGovernancePolicy(
      { toolName: "exec", params: { command: "ls" } },
      { sessionKey: "agent:agent-a:main", cwd: workspace },
    );
    expect(verdict(decision)).toBe("block");
  });

  it("changes nothing when no agent is locked", async () => {
    // The over-blocking is bounded to an active incident. With an empty
    // lockdown list an unattributable call is evaluated exactly as before.
    const doc = await loadPolicy();
    await savePolicy({ ...doc, mode: "enforce", ask: "off", lockedAgents: [] });
    const decision = await evaluateGovernancePolicy(
      { toolName: "exec", params: { command: "ls" } },
      { cwd: workspace },
    );
    expect(verdict(decision)).toBe("allow");
  });

  it("records the two cases under different rule ids", async () => {
    // An auditor has to be able to count "we stopped the agent you named"
    // separately from "we stopped a call we could not attribute".
    const { tailLedger } = await import("./audit-ledger.js");
    const doc = await loadPolicy();
    await savePolicy({ ...doc, mode: "enforce", lockedAgents: ["agent-a"] });
    await evaluateGovernancePolicy({ toolName: "exec", params: { command: "ls" } }, ctx());
    await evaluateGovernancePolicy(
      { toolName: "exec", params: { command: "ls" } },
      { cwd: workspace },
    );
    const ruleIds = (await tailLedger(20))
      .filter((entry) => entry.entryKind !== "admin")
      .map((entry) => entry.ruleId);
    expect(ruleIds).toContain("kill-switch");
    expect(ruleIds).toContain("kill-switch-unattributable");
  });
});

describe("qa round 13 — relocating the governance directory moves its protection (finding 86)", () => {
  /**
   * `GOVERNANCE_STATE` and the matching command denial both spelled the literal
   * `.openclaw/governance`. `paths.ts` documents `OPENCLAW_GOVERNANCE_DIR` as a
   * supported deployment option — "so a deployment can place the ledger on
   * separate storage… without a code change" — and taking it silently removed
   * the agent's inability to read the policy, the accounts, the ledger and its
   * signing key.
   *
   * The documented deployment step and the core tier disagreed, and the
   * deployment step won. This is the same shape as every other defect in the
   * project: two halves of the system holding different beliefs, neither
   * visible from inside the other.
   *
   * `dir` here *is* a relocated directory — every test in this file sets
   * `OPENCLAW_GOVERNANCE_DIR` to a fresh temp path — so this asserts against
   * exactly the configuration the finding describes.
   */
  it("denies reading the relocated governance directory", async () => {
    await onlyDenialsCanRefuse("path");
    for (const file of ["policy.json", "users.json", "ledger.key", "audit-ledger.jsonl"]) {
      const decision = await evaluateGovernancePolicy(
        { toolName: "read", params: { path: join(dir, file) } },
        ctx(),
      );
      expect(verdict(decision), file).toBe("block");
    }
  });

  it("denies a command naming the relocated directory, in either separator", async () => {
    await onlyDenialsCanRefuse("command");
    const posix = dir.replaceAll(BACKSLASH, "/");
    for (const command of [`cat ${posix}/policy.json`, `type ${dir}${BACKSLASH}policy.json`]) {
      const decision = await evaluateGovernancePolicy(
        { toolName: "exec", params: { command } },
        ctx(),
      );
      expect(verdict(decision), command).toBe("block");
    }
  });

  it("still denies the default location as well", async () => {
    // The static patterns are kept alongside the derived ones: an installation
    // reached through a symbolic link, or one that later moves back, stays
    // covered, and an over-broad denial costs nothing an agent needs.
    await onlyDenialsCanRefuse("command");
    const decision = await evaluateGovernancePolicy(
      { toolName: "exec", params: { command: "cat ~/.openclaw/governance/policy.json" } },
      ctx(),
    );
    expect(verdict(decision)).toBe("block");
  });
});
