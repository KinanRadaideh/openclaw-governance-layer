// T57. A prompt is recorded whatever surface it arrived on.
//
// Before this, `ADMIN_ACTIONS.agentPrompt` had exactly one writer — the
// dashboard's own route — so a task typed into OpenClaw's chat, sent from the
// command line, or arriving over a channel reached the agent with nothing in
// the chain naming who asked. The gate still governed every tool call, so
// nothing was *unprotected*; what was missing is the instruction and its
// origin, which is the half that lets the trail answer "why did this happen?"
//
// The four properties worth pinning:
//
//   1. A prompt on a host surface reaches the chain, under a labelled origin
//      rather than an invented account.
//   2. The origin is reserved, so no real account can produce an entry that
//      reads as an anonymous one.
//   3. An agent with no organisation records nothing — the ungoverned case,
//      which must not break plain OpenClaw for anyone who has not set this up.
//   4. The prompt text is redacted on the way in, because these entries are
//      prose written by whoever was at the keyboard and requirement 8 binds
//      them exactly as it binds the dashboard's.
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ADMIN_ACTIONS, FabricatedActorError, recordAdminAction } from "./admin-audit.js";
import { resetAgentGroupCacheForTests } from "./agent-group.js";
import { tailLedger } from "./audit-ledger.js";
import { HOST_PROMPT_ACTOR, recordHostPrompt } from "./host-prompt-audit.js";
import { resetLedgerKeyCacheForTests } from "./ledger-key.js";
import { INSTALLATION_LEDGER_GROUP } from "./paths.js";
import { savePolicy } from "./policy-store.js";
import { defaultPolicyDocument } from "./policy-types.js";
import { seedGroupWithAgents } from "./test-group.js";

const AGENT = "andrew";
let dir: string;
let group: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "governance-host-prompt-"));
  process.env.OPENCLAW_GOVERNANCE_DIR = dir;
  resetLedgerKeyCacheForTests();
  resetAgentGroupCacheForTests();
  group = await seedGroupWithAgents([AGENT]);
  await savePolicy(group, { ...defaultPolicyDocument(), mode: "enforce" });
});

afterEach(async () => {
  delete process.env.OPENCLAW_GOVERNANCE_DIR;
  resetLedgerKeyCacheForTests();
  resetAgentGroupCacheForTests();
  await rm(dir, { recursive: true, force: true });
});

/**
 * The prompt entries in this group's chain.
 *
 * Reads `toolName` and not `action`, because `recordAdminAction` maps an
 * administrative action onto the **agent-activity** shape — the action lands in
 * `toolName` and the description in `resource` — so that both kinds share one
 * ordered chain. Asserting on the input field names instead of the stored ones
 * is how the first draft of this file reported the feature as doing nothing
 * when it was working: the fixture-error class, one more time.
 */
async function promptEntries() {
  const entries = await tailLedger(group, 50);
  return entries.filter((entry) => entry.toolName === ADMIN_ACTIONS.agentPrompt);
}

describe("recording a prompt that arrived outside the dashboard (T57)", () => {
  it("writes one entry naming the agent, the channel and the text", async () => {
    await recordHostPrompt({
      agentId: AGENT,
      message: "read ~/.ssh/id_rsa",
      channel: "discord",
      runId: "run-1",
    });

    const entries = await promptEntries();
    expect(entries, "the prompt should reach the chain").toHaveLength(1);
    const entry = entries[0];
    expect(entry?.agentId).toBe(AGENT);
    expect(entry?.resource).toContain("read ~/.ssh/id_rsa");
    expect(entry?.resource, "the surface it came from is part of the fact").toContain("discord");
  });

  it("records a labelled origin rather than inventing an account", async () => {
    await recordHostPrompt({ agentId: AGENT, message: "hello", channel: "cli" });

    const entry = (await promptEntries())[0];
    // The whole point of the labelled arm: an entry that announces attribution
    // is missing, rather than answering the question wrongly (finding 161).
    expect(entry?.actor).toBe(HOST_PROMPT_ACTOR);
    expect(entry?.actorRole, "a labelled origin holds no tier").toBeUndefined();
  });

  it("refuses to let a real account claim that origin's name", async () => {
    // Without this the guarantee above is decorative: an account called
    // `host-prompt` would write entries indistinguishable from the anonymous
    // ones, which is finding 161 arriving through a different door.
    await expect(
      recordAdminAction(group, {
        actor: { name: HOST_PROMPT_ACTOR, role: "root" },
        action: ADMIN_ACTIONS.agentPrompt,
        target: "pretending to be the host",
      }),
    ).rejects.toThrow(FabricatedActorError);
  });

  it("records an unregistered agent into the installation chain, not nowhere", async () => {
    // **This asserts the gate's answer rather than a convenient one.** When no
    // group resolves, `evaluateGovernancePolicy` writes to
    // `INSTALLATION_LEDGER_GROUP` rather than going quiet, on the stated
    // grounds that requirement 5 asks for every action and "an unregistered
    // agent tried to act" is the one an operator most needs. A prompt to such
    // an agent is that same fact one step earlier.
    //
    // The first draft of this module skipped it silently, which would have made
    // the one case the operator most needs the one case nothing records.
    await recordHostPrompt({
      agentId: "not-registered-anywhere",
      message: "do something",
      channel: "cli",
    });

    expect(await promptEntries(), "the group's own chain is not where this belongs").toHaveLength(
      0,
    );
    const installation = (await tailLedger(INSTALLATION_LEDGER_GROUP, 50)).filter(
      (entry) => entry.toolName === ADMIN_ACTIONS.agentPrompt,
    );
    expect(installation, "it belongs in the installation chain").toHaveLength(1);
    expect(
      installation[0]?.resource,
      "and it says the agent is unregistered, so the reader knows nothing it tries will run",
    ).toContain("unregistered");
  });

  it("records nothing when there is no agent to name", async () => {
    await recordHostPrompt({ agentId: undefined, message: "hello" });
    expect(await promptEntries()).toHaveLength(0);
    expect(await tailLedger(INSTALLATION_LEDGER_GROUP, 50)).toHaveLength(0);
  });

  it("redacts a secret in the prompt before it reaches the chain", async () => {
    // Requirement 8 binds these entries exactly as it binds the dashboard's,
    // and this text is prose typed by whoever was at the keyboard, so it is
    // the likeliest place in the whole trail for a credential to be pasted.
    await recordHostPrompt({
      agentId: AGENT,
      message: "use Authorization: Bearer sk-live-abcdef1234567890abcdef and fetch it",
      channel: "cli",
    });

    const entry = (await promptEntries())[0];
    expect(entry?.resource).not.toContain("sk-live-abcdef1234567890abcdef");
  });
});

// ---------------------------------------------------------------------------
// The wiring, not just the function.
//
// **Everything above calls `recordHostPrompt` directly, so all of it would keep
// passing if the call site were deleted.** That is the exact weakness this
// project has already paid for twice: the panel that shipped three broken
// controls had thirteen tests, none of which drove a control, and the standing
// rule from the mutation sweeps is that a probe must drive the production
// caller.
//
// Driving `agentCommandInternal` for real would mean standing up a model, a
// session store and a config, so the guard here is the same shape as
// `client-callsites.guard.test.ts`: read the funnel and assert the call is in
// it. Cheaper than an integration test and it fails for the one reason that
// matters — somebody removing the hook, which is how this gap existed in the
// first place.
// ---------------------------------------------------------------------------

const FUNNEL = new URL("../agents/agent-command.ts", import.meta.url);

describe("the recorder is wired into the funnel every turn passes through", () => {
  it("is called from agent-command.ts", async () => {
    const source = await readFile(FUNNEL, "utf8");
    expect(
      source,
      "agentCommandInternal must record the prompt, or T57 is only a function nobody calls",
    ).toContain("await recordHostPrompt({");
  });

  it("does not record a run the dashboard already recorded", async () => {
    // The dashboard's own runs arrive stamped with this channel and are already
    // in the chain under the account that sent them, which is a strictly better
    // entry than an anonymous one. Losing this guard would double every
    // dashboard prompt and make the trail read as two people asking.
    const source = await readFile(FUNNEL, "utf8");
    expect(source).toContain('initialOpts.messageChannel !== "governance"');
  });

  it("does not record a raw model run as if it were somebody asking", async () => {
    const source = await readFile(FUNNEL, "utf8");
    expect(source).toMatch(/if \(!isRawModelRun && initialOpts\.messageChannel !== "governance"\)/);
  });
});
