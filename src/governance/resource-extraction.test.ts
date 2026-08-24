import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { evaluateGovernancePolicy } from "./policy-engine.js";
import { addRule, savePolicy, updatePolicy } from "./policy-store.js";
import { defaultPolicyDocument } from "./policy-types.js";

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "governance-extract-"));
  process.env.OPENCLAW_GOVERNANCE_DIR = dir;
  await savePolicy({ ...defaultPolicyDocument(), mode: "enforce", ask: "off" });
});

afterEach(async () => {
  delete process.env.OPENCLAW_GOVERNANCE_DIR;
  await rm(dir, { recursive: true, force: true });
});

const ctx = { agentId: "demo", sessionKey: "agent:demo:main" };

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

describe("resource extraction edge cases", () => {
  it("does not mistake an inherited Object property for a governed tool", async () => {
    // A tool literally named "constructor" or "toString" must not resolve to
    // Object.prototype's members and blow up the policy gate.
    for (const toolName of ["constructor", "toString", "__proto__", "valueOf", "hasOwnProperty"]) {
      const decision = await evaluateGovernancePolicy(
        { toolName, params: { command: "rm -rf /" } },
        ctx,
      );
      expect(verdict(decision), `tool named ${toolName}`).toBe("allow");
    }
  });

  it("governs a web_fetch whose URL has no usable hostname instead of waving it through", async () => {
    for (const url of ["file:///etc/shadow", "data:text/html,<script>", "not a url at all"]) {
      const decision = await evaluateGovernancePolicy(
        { toolName: "web_fetch", params: { url } },
        ctx,
      );
      expect(verdict(decision), `url ${url}`).toBe("block");
    }
  });

  it("matches path rules written with forward slashes on Windows-style paths", async () => {
    await addRule({ resourceKind: "path", pattern: "^src/allowed[.]ts$" });
    const decision = await evaluateGovernancePolicy(
      { toolName: "write", params: { path: "src\\allowed.ts" } },
      ctx,
    );
    expect(verdict(decision)).toBe("allow");
  });

  it("reads a path from either path or file_path", async () => {
    await addRule({ resourceKind: "path", pattern: "^ok[.]txt$" });
    expect(
      verdict(
        await evaluateGovernancePolicy({ toolName: "read", params: { path: "ok.txt" } }, ctx),
      ),
    ).toBe("allow");
    expect(
      verdict(
        await evaluateGovernancePolicy({ toolName: "read", params: { file_path: "ok.txt" } }, ctx),
      ),
    ).toBe("allow");
  });

  it("governs bash the same way it governs exec", async () => {
    await addRule({ resourceKind: "command", pattern: "^echo .*$" });
    expect(
      verdict(
        await evaluateGovernancePolicy({ toolName: "bash", params: { command: "echo hi" } }, ctx),
      ),
    ).toBe("allow");
    expect(
      verdict(
        await evaluateGovernancePolicy({ toolName: "bash", params: { command: "curl x" } }, ctx),
      ),
    ).toBe("block");
  });

  it("ignores a non-string command payload rather than crashing", async () => {
    for (const command of [123, null, { nested: true }, ["ls"]]) {
      const decision = await evaluateGovernancePolicy(
        { toolName: "exec", params: { command } },
        ctx,
      );
      expect(verdict(decision)).toBe("allow");
    }
  });

  it("keeps the query string out of the matched network resource", async () => {
    await addRule({ resourceKind: "network", pattern: "^api[.]example[.]com$" });
    const decision = await evaluateGovernancePolicy(
      { toolName: "web_fetch", params: { url: "https://api.example.com/p?secret=abc#frag" } },
      ctx,
    );
    expect(verdict(decision)).toBe("allow");
  });

  it("treats an anchored command rule as exact, not a prefix", async () => {
    await addRule({ resourceKind: "command", pattern: "^ls$" });
    expect(
      verdict(await evaluateGovernancePolicy({ toolName: "exec", params: { command: "ls" } }, ctx)),
    ).toBe("allow");
    expect(
      verdict(
        await evaluateGovernancePolicy(
          { toolName: "exec", params: { command: "ls; rm -rf /" } },
          ctx,
        ),
      ),
    ).toBe("block");
  });

  it("still evaluates when mode is enforce and the rule list is empty", async () => {
    await updatePolicy((doc) => {
      doc.rules = [];
    });
    const decision = await evaluateGovernancePolicy(
      { toolName: "exec", params: { command: "anything" } },
      ctx,
    );
    expect(verdict(decision)).toBe("block");
  });
});
