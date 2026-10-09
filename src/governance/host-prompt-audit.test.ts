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
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ADMIN_ACTIONS, FabricatedActorError, recordAdminAction } from "./admin-audit.js";
import { resetAgentGroupCacheForTests } from "./agent-group.js";
import { tailLedger } from "./audit-ledger.js";
import { BACKGROUND_TEXT_WITHHELD, backgroundPromptFingerprint } from "./background-prompt.js";
import {
  HOST_PROMPT_ACTOR,
  recordHostPrompt,
  resetHostPromptDuplicateGuardForTests,
} from "./host-prompt-audit.js";
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
  resetHostPromptDuplicateGuardForTests();
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
// T75, decision B: a prompt the host writes for itself is recorded as a fact.
//
// The dream diary prompt below is built the way memory-core's `buildNarrativePrompt`
// builds it, with the shape of the fragment that leaked on the 2026-10-03 QA fixture:
// an earlier reply quoting a file an agent read. Synthetic values only.
// ---------------------------------------------------------------------------

const QUOTED_FILE_CONTENT = "GAMMA-PRIVATE: deployment notes, value QA-GAMMA-SECRET-7731";
const DREAM_PROMPT = [
  "Write a dream diary entry from these memory fragments:\n",
  "- User: Please read `gamma/secret-notes.txt` and tell me what it says.",
  `- Assistant: Evidence snippet: ${QUOTED_FILE_CONTENT}`,
  "- User: thanks",
  "\nRecurring themes:",
  "- deployment notes",
  "- file reviews",
  "\nDiary continuity context:",
  "- Current sweep: 2026-10-08",
].join("\n");

describe("a background prompt is recorded as a described fact (T75, decision B)", () => {
  it("records the dream diary's source, purpose, phase and shape, and none of its words", async () => {
    await recordHostPrompt({
      agentId: AGENT,
      message: DREAM_PROMPT,
      channel: "webchat",
      origin: { kind: "background", source: { type: "plugin", pluginId: "memory-core" } },
      sessionKey: `agent:${AGENT}:dreaming-narrative-memory-core-v2-light-3f9a2c1d`,
    });

    const resource = (await promptEntries())[0]?.resource ?? "";
    expect(resource).toContain('background prompt from plugin "memory-core"');
    expect(resource).toContain("dream diary entry, light phase");
    expect(resource).toContain("3 memory fragments, 2 recurring themes, 0 promoted memories");
    expect(resource).toContain(`${DREAM_PROMPT.length.toLocaleString("en-US")} characters`);
    expect(resource).toContain(`SHA-256 ${backgroundPromptFingerprint(DREAM_PROMPT)}`);
    expect(resource).toContain(BACKGROUND_TEXT_WITHHELD);
    // The whole point: nothing the fragments quoted reaches the sealed entry.
    expect(resource).not.toContain("QA-GAMMA-SECRET-7731");
    expect(resource).not.toContain("GAMMA-PRIVATE");
    expect(resource).not.toContain("secret-notes.txt");
    expect(resource, "and it no longer reads as typed in OpenClaw's chat").not.toContain("webchat");
  });

  it("describes the deep-phase rewrite of MEMORY.md without its contents", async () => {
    const rewrite = JSON.stringify({
      currentMemory: "- Kinan's staging password is hunter2\n- prefers short answers",
      candidates: [
        { key: "a", text: QUOTED_FILE_CONTENT },
        { key: "b", text: "x" },
      ],
    });
    await recordHostPrompt({
      agentId: AGENT,
      message: rewrite,
      origin: { kind: "background", source: { type: "plugin", pluginId: "memory-core" } },
    });

    const resource = (await promptEntries())[0]?.resource ?? "";
    expect(resource).toContain("long-term memory rewrite (deep phase): 2 candidate memories");
    expect(resource).not.toContain("hunter2");
    expect(resource).not.toContain("QA-GAMMA-SECRET-7731");
  });

  it.each([
    [{ type: "heartbeat" } as const, "background prompt from the heartbeat"],
    [
      { type: "memory-flush" } as const,
      "background prompt from the memory flush before compaction",
    ],
    [{ type: "skill-workshop" } as const, "background prompt from the skill workshop"],
    [{ type: "session-name" } as const, "background prompt from the session-name helper"],
  ])("names the source of a %o prompt and withholds the text", async (source, label) => {
    await recordHostPrompt({
      agentId: AGENT,
      message: `System: exec finished, output ${QUOTED_FILE_CONTENT}`,
      origin: { kind: "background", source },
    });
    const resource = (await promptEntries())[0]?.resource ?? "";
    expect(resource).toContain(label);
    expect(resource).not.toContain("QA-GAMMA-SECRET-7731");
  });

  it("keeps a scheduled job's message in full and names the job", async () => {
    await recordHostPrompt({
      agentId: AGENT,
      message: "summarise yesterday's tickets",
      origin: { kind: "scheduled-job", jobId: "job-7", jobName: "Morning summary" },
    });
    const resource = (await promptEntries())[0]?.resource ?? "";
    expect(resource).toContain('prompt from scheduled job "Morning summary" (job-7)');
    expect(resource).toContain("summarise yesterday's tickets");
  });

  it("records one turn once when two entry points see it (voice consult through a plugin)", async () => {
    await recordHostPrompt({ agentId: AGENT, message: "what's on my calendar", runId: "run-v" });
    await recordHostPrompt({
      agentId: AGENT,
      message: "what's on my calendar",
      runId: "run-v",
      origin: { kind: "background", source: { type: "plugin", pluginId: "voice-call" } },
    });
    const entries = await promptEntries();
    expect(entries).toHaveLength(1);
    expect(entries[0]?.resource, "the first record, the person's words, wins").toContain(
      "what's on my calendar",
    );
  });

  it("still records a scheduled job's next run, which reuses its run id", async () => {
    const now = vi.spyOn(Date, "now");
    try {
      now.mockReturnValue(1_000_000);
      const job = { kind: "scheduled-job", jobId: "job-7" } as const;
      await recordHostPrompt({
        agentId: AGENT,
        message: "summarise",
        runId: "sess-1",
        origin: job,
      });
      now.mockReturnValue(1_000_000 + 60_000);
      await recordHostPrompt({
        agentId: AGENT,
        message: "summarise",
        runId: "sess-1",
        origin: job,
      });
    } finally {
      now.mockRestore();
    }
    expect(await promptEntries()).toHaveLength(2);
  });

  it("keeps a person's message in full, as before", async () => {
    await recordHostPrompt({ agentId: AGENT, message: "list the files", channel: "telegram" });
    const resource = (await promptEntries())[0]?.resource ?? "";
    expect(resource).toBe("prompt via telegram (no governance account): list the files");
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
    // The channel is spelled once, as a shared constant, since finding 347 needed
    // the same name in the approval-surface checks; the scan pins the constant and
    // the constant's value both, so neither can drift on its own.
    const source = await readFile(FUNNEL, "utf8");
    const { GOVERNANCE_MESSAGE_CHANNEL } = await import("../utils/message-channel-constants.js");
    expect(GOVERNANCE_MESSAGE_CHANNEL).toBe("governance");
    expect(source).toContain("initialOpts.messageChannel !== GOVERNANCE_MESSAGE_CHANNEL");
  });

  it("does not record a raw model run as if it were somebody asking", async () => {
    const source = await readFile(FUNNEL, "utf8");
    expect(source).toMatch(
      /if \(!isRawModelRun && initialOpts\.messageChannel !== GOVERNANCE_MESSAGE_CHANNEL\)/,
    );
  });
});
