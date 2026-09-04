// T7 prevention. The wiring, as opposed to the decision.
//
// `search-filter.test.ts` proves `filterSearchResult` removes the right lines.
// This proves the hook that carries it into a run behaves: that it chains the
// hook already installed rather than replacing it, that governance runs **last**
// so it inspects what is actually delivered, and that a call it does not act on
// passes through untouched.
//
// **Why this test is filed under `src/governance/`** although the module it
// exercises lives under `src/agents/`: the verification set in `HANDOFF.md` §4
// runs `src/governance/` and `src/gateway/governance-*.test.ts`. A test placed
// with the module would sit outside every command the project uses to check
// itself, which is finding 148 exactly, and finding 149's test is filed here for
// the same reason.
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { installGovernanceSearchFilterHook } from "../agents/embedded-agent-runner/run/governance-search-filter.js";
import { resetLedgerKeyCacheForTests } from "./ledger-key.js";
import { addRule, savePolicy } from "./policy-store.js";
import { defaultPolicyDocument } from "./policy-types.js";
import { seedGroupWithAgents } from "./test-group.js";

let dir: string;

/**
 * The agent's working directory, deliberately **not** the governance directory.
 *
 * This fixture used `dir` for both, and every one of these tests passed because
 * the core denial on "the governance directory in use" was inert for
 * workspace-relative paths (finding 254): with the workspace and the policy
 * store being the same folder, every path here normalises to a short form the
 * absolute core pattern could not match. Now that it can, an agent working
 * inside the policy store is refused everything, which is correct and is why
 * the two must be separate here as they are in production.
 */
let workspace: string;
let TEST_GROUP: string;
const AGENT = "agent-a";

type AfterToolCall = (context: unknown, signal?: unknown) => Promise<unknown>;
type FakeAgent = { afterToolCall?: AfterToolCall };

/** The context shape `finalizeExecutedToolCall` passes to the hook. */
function callContext(toolName: string, lines: string[]) {
  return {
    toolCall: { name: toolName, id: "call-1" },
    args: { path: "." },
    result: { content: [{ type: "text", text: lines.join("\n") }] },
    isError: false,
  };
}

function textOf(value: unknown): string {
  const content = (value as { content?: Array<{ text?: string }> } | undefined)?.content;
  return Array.isArray(content) ? content.map((c) => c.text ?? "").join("\n") : "";
}

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "governance-filter-hook-"));
  process.env.OPENCLAW_GOVERNANCE_DIR = dir;
  workspace = await mkdtemp(join(tmpdir(), "governance-workspace-"));
  resetLedgerKeyCacheForTests();
  TEST_GROUP = await seedGroupWithAgents([AGENT]);
  await savePolicy(TEST_GROUP, { ...defaultPolicyDocument(), mode: "enforce" });
  await addRule(
    TEST_GROUP,
    {
      resourceKind: "path",
      pattern: ".*secrets\\.txt$",
      effect: "deny",
      access: "read",
      description: "deny secrets.txt",
    },
    { name: "test-admin", role: "administrator" },
  );
});

afterEach(async () => {
  delete process.env.OPENCLAW_GOVERNANCE_DIR;
  resetLedgerKeyCacheForTests();
  await rm(dir, { recursive: true, force: true });
  await rm(workspace, { recursive: true, force: true });
});

function install(agent: FakeAgent): void {
  installGovernanceSearchFilterHook({
    agent: agent as never,
    agentId: AGENT,
    sessionKey: `agent:${AGENT}:test`,
    cwd: workspace,
  });
}

describe("installing the filter onto a run", () => {
  it("filters when no other hook is present", async () => {
    const agent: FakeAgent = {};
    install(agent);
    const out = await agent.afterToolCall?.(
      callContext("grep", ["safe.ts:1:ok", "secrets.txt:1:TOPSECRET"]),
    );
    expect(textOf(out)).not.toContain("TOPSECRET");
    expect(textOf(out)).toContain("safe.ts:1:ok");
  });

  it("returns undefined for a call it does not act on, so the tool's own result stands", async () => {
    const agent: FakeAgent = {};
    install(agent);
    const out = await agent.afterToolCall?.(callContext("grep", ["safe.ts:1:ok"]));
    // The loop treats `undefined` as "keep what the tool returned". Returning a
    // rewritten-but-identical result instead would make every search allocate a
    // new payload for nothing, and would lose that distinction.
    expect(out).toBeUndefined();
  });

  it("calls the hook that was already installed rather than replacing it", async () => {
    let priorRan = false;
    const agent: FakeAgent = {
      afterToolCall: async () => {
        priorRan = true;
        return undefined;
      },
    };
    install(agent);
    await agent.afterToolCall?.(callContext("grep", ["safe.ts:1:ok"]));
    // `agent.afterToolCall` is a single slot with several claimants. Extensions
    // assign it, the source-reply tracker wraps it. Assignment would silently
    // drop whichever got there first.
    expect(priorRan).toBe(true);
  });

  it("filters what an earlier hook rewrote, not the result it replaced", async () => {
    // The ordering claim, and the reason governance installs last. An extension
    // may legitimately rewrite a tool result; a filter that inspected the
    // pre-rewrite text would be checking something nobody receives while the
    // delivered text went unchecked.
    const agent: FakeAgent = {
      afterToolCall: async () => ({
        content: [{ type: "text", text: "secrets.txt:1:INJECTED-BY-EXTENSION" }],
      }),
    };
    install(agent);
    const out = await agent.afterToolCall?.(callContext("grep", ["safe.ts:1:ok"]));
    expect(textOf(out)).not.toContain("INJECTED-BY-EXTENSION");
    expect(textOf(out)).toMatch(/withheld by governance policy/i);
  });

  it("respects an earlier hook that blanked the result, rather than refilling it", async () => {
    // **Not a regression test. This behaviour was already correct.** It was
    // raised on 2026-08-31 as a defect, on the reading that `prior?.content ? …`
    // would treat a blanked rewrite as "no rewrite" and hand back the tool's raw
    // output. `content` is an array, so a blanked rewrite is `[]` and is truthy;
    // the claim dissolved when reverting the "fix" changed no test result.
    //
    // Kept because the property is worth holding true whoever touches this next:
    // the layer that exists to remove things must never put back what another
    // layer removed.
    const agent: FakeAgent = {
      afterToolCall: async () => ({ content: [] }),
    };
    install(agent);

    const out = await agent.afterToolCall?.(
      callContext("grep", ["safe.ts:1:ok", "secrets.txt:1:LEAK"]),
    );

    // The earlier hook said "nothing". Governance must not turn that back into
    // "everything except the denied lines".
    expect(textOf(out)).not.toContain("LEAK");
    expect(textOf(out)).not.toContain("safe.ts:1:ok");
  });

  it("preserves the earlier hook's other fields when it filters", async () => {
    const agent: FakeAgent = {
      afterToolCall: async () => ({
        content: [{ type: "text", text: "secrets.txt:1:LEAK" }],
        isError: true,
      }),
    };
    install(agent);
    const out = (await agent.afterToolCall?.(callContext("grep", ["x"]))) as {
      isError?: boolean;
    };
    // Only `content` is governance's business. Dropping `isError` would turn a
    // failed tool call into a successful-looking one on its way to the model.
    expect(out.isError).toBe(true);
    expect(textOf(out)).not.toContain("LEAK");
  });

  it("leaves a non-search tool entirely alone, including the earlier hook's answer", async () => {
    const agent: FakeAgent = {
      afterToolCall: async () => ({ content: [{ type: "text", text: "read result" }] }),
    };
    install(agent);
    const out = await agent.afterToolCall?.(callContext("read", ["secrets.txt contents"]));
    expect(textOf(out)).toBe("read result");
  });
});
