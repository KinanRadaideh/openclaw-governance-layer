// Recording what the model said it was doing (§1.6's "raw LLM intent").
//
// §1.6 "Granular Event Tracking" lists six things the log should capture, and
// five were already there. This is the sixth, and the properties below are the
// ones that make it safe to add a **model-authored** field to a hash chain:
//
//   1. **Every chain written before this field existed still verifies.** The
//      field joins the canonical payload by *presence*, the migration `actor`,
//      `actorRole` and `keyed` each used, so an entry with no intent hashes
//      exactly the array it hashed before, byte for byte.
//   2. **The value is tagged in the payload**. Defensively. The first version
//      of this file claimed the tag closed a collision an agent could reach;
//      mutation testing showed otherwise, since every entry is keyed and the
//      colliding pair cannot be produced. That correction is finding 132, and
//      the tag stays on `role:`'s reasoning: remove the question rather than
//      answer it, because "no unkeyed entry can be written" is a premise, not a
//      guarantee.
//   3. **It is redacted and clamped**, at capture and again at the ledger
//      boundary. Model narration quotes what the model was working with.
//   4. **Its absence is normal.** Nothing is gated on it and nothing fails
//      without it.
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  extractIntentText,
  MAX_INTENT_LENGTH,
  MAX_TRACKED_SESSIONS,
  normalizeIntent,
  readAgentIntent,
  recordAgentIntent,
  resetAgentIntentsForTests,
} from "./agent-intent.js";
import { appendLedgerEntry, tailLedger, verifyLedgerChain } from "./audit-ledger.js";
import { resetLedgerKeyCacheForTests } from "./ledger-key.js";
import { REDACTED_INTENT, sanitizeLedgerEntry } from "./ledger-view.js";
import { seedGroupWithAgents } from "./test-group.js";
import { newGroupId } from "./user-store.js";

let dir: string;
let groupId: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "governance-intent-"));
  process.env.OPENCLAW_GOVERNANCE_DIR = dir;
  await seedGroupWithAgents([]);
  resetLedgerKeyCacheForTests();
  resetAgentIntentsForTests();
  groupId = newGroupId();
});

afterEach(async () => {
  delete process.env.OPENCLAW_GOVERNANCE_DIR;
  resetLedgerKeyCacheForTests();
  resetAgentIntentsForTests();
  await rm(dir, { recursive: true, force: true });
});

describe("pulling the intent out of what the model produced", () => {
  it("prefers the model's reasoning blocks, which are the closest thing to raw intent", () => {
    const text = extractIntentText({
      assistantTexts: ["Let me check the config."],
      lastAssistant: {
        content: [
          {
            type: "thinking",
            thinking: "The user asked about the port, so I should read the config file.",
          },
          { type: "text", text: "Let me check the config." },
        ],
      },
    });
    expect(text).toContain("read the config file");
  });

  it("falls back to the assistant's visible text, so the field is not usually empty", () => {
    // Most providers emit no reasoning blocks at all. Without this fallback the
    // field would be populated only for the few that do, which is a worse
    // outcome than a slightly less "raw" intent.
    expect(
      extractIntentText({
        assistantTexts: ["I'll list the files first."],
        lastAssistant: undefined,
      }),
    ).toBe("I'll list the files first.");
  });

  it("returns nothing rather than guessing when the shape is unfamiliar", () => {
    // `lastAssistant` is `unknown` in the host's hook contract and differs
    // between harnesses. Under-reporting is the correct failure direction: this
    // must never turn a working tool call into an error.
    expect(extractIntentText({ lastAssistant: "a bare string" })).toBe("");
    expect(extractIntentText({ lastAssistant: { content: "not an array" } })).toBe("");
    expect(extractIntentText({})).toBe("");
  });

  it("collapses wrapping and marks a truncation rather than cutting silently", () => {
    expect(normalizeIntent("read   the\n\nconfig\tfile")).toBe("read the config file");
    const long = normalizeIntent("x".repeat(MAX_INTENT_LENGTH + 200));
    expect(long).toHaveLength(MAX_INTENT_LENGTH);
    expect(long.endsWith("…")).toBe(true);
  });
});

describe("holding the intent between the model speaking and the tool running", () => {
  it("remembers it for the session that produced it", () => {
    recordAgentIntent({ sessionKey: "agent:a:main", assistantTexts: ["Reading the config."] });
    expect(readAgentIntent("agent:a:main")).toBe("Reading the config.");
  });

  it("keeps it across several tool calls in one turn", () => {
    // One model turn commonly issues several calls, all asked for by the same
    // statement of purpose. Consuming on first read would attach the intent to
    // the first call and leave its siblings bare.
    recordAgentIntent({ sessionKey: "agent:a:main", assistantTexts: ["Auditing the repo."] });
    expect(readAgentIntent("agent:a:main")).toBe("Auditing the repo.");
    expect(readAgentIntent("agent:a:main")).toBe("Auditing the repo.");
  });

  it("does not leak one session's intent into another", () => {
    recordAgentIntent({ sessionKey: "agent:a:main", assistantTexts: ["Mine."] });
    expect(readAgentIntent("agent:b:main")).toBeUndefined();
  });

  it("replaces it on the next turn, because that is when it stops being true", () => {
    recordAgentIntent({ sessionKey: "agent:a:main", assistantTexts: ["First."] });
    recordAgentIntent({ sessionKey: "agent:a:main", assistantTexts: ["Second."] });
    expect(readAgentIntent("agent:a:main")).toBe("Second.");
  });

  it("clears it when a turn says nothing, rather than leaving the previous one standing", () => {
    // A stale intent is worse than none: it would attach last turn's stated
    // purpose to this turn's call, which is a false statement in the trail.
    recordAgentIntent({ sessionKey: "agent:a:main", assistantTexts: ["First."] });
    recordAgentIntent({ sessionKey: "agent:a:main", assistantTexts: ["   "] });
    expect(readAgentIntent("agent:a:main")).toBeUndefined();
  });

  it("redacts before storing, not only before writing", () => {
    // The value sits in memory between the model speaking and the tool running.
    // A store of unredacted model narration is worth not having even briefly.
    recordAgentIntent({
      sessionKey: "agent:a:main",
      assistantTexts: ["Connecting with postgres://admin:s3cr3tP4ss@db.internal:5432/prod"],
    });
    expect(readAgentIntent("agent:a:main")).not.toContain("s3cr3tP4ss");
  });

  it("drops the oldest session rather than growing without bound", () => {
    // Round four's lesson: agent-influenced text with no size bound is a
    // disk-fill vector. Here it is memory, and the bound is the live set of
    // sessions mid-turn.
    for (let i = 0; i < MAX_TRACKED_SESSIONS + 10; i += 1) {
      recordAgentIntent({ sessionKey: `agent:a:s${i}`, assistantTexts: [`turn ${i}`] });
    }
    expect(readAgentIntent("agent:a:s0")).toBeUndefined();
    expect(readAgentIntent(`agent:a:s${MAX_TRACKED_SESSIONS + 9}`)).toBeDefined();
  });
});

describe("the ledger field, and the hash chain it joins", () => {
  it("records the intent alongside the action", async () => {
    await appendLedgerEntry(groupId, {
      agentId: "agent-a",
      sessionKey: "agent:agent-a:main",
      toolName: "read",
      resourceKind: "path",
      resource: "/workspace/config.json",
      ruleId: "allow-workspace",
      decision: "allow",
      intent: "The user asked about the port, so I should read the config file.",
    });
    const entry = (await tailLedger(groupId, 10)).find((e) => e.toolName === "read");
    expect(entry?.intent).toContain("read the config file");
  });

  it("verifies a chain that mixes entries with and without an intent", async () => {
    // The migration property. An entry with no intent must hash exactly the
    // array it hashed before the field existed, so a chain written across the
    // change verifies end to end.
    await appendLedgerEntry(groupId, {
      agentId: "agent-a",
      sessionKey: "agent:agent-a:main",
      toolName: "read",
      resourceKind: "path",
      resource: "/a",
      ruleId: "r",
      decision: "allow",
    });
    await appendLedgerEntry(groupId, {
      agentId: "agent-a",
      sessionKey: "agent:agent-a:main",
      toolName: "read",
      resourceKind: "path",
      resource: "/b",
      ruleId: "r",
      decision: "allow",
      intent: "checking the second file",
    });
    await appendLedgerEntry(groupId, {
      agentId: "agent-a",
      sessionKey: "agent:agent-a:main",
      toolName: "read",
      resourceKind: "path",
      resource: "/c",
      ruleId: "r",
      decision: "allow",
    });

    expect((await verifyLedgerChain(groupId)).ok).toBe(true);
  });

  it("detects an intent edited after the fact", async () => {
    // The point of putting it in the payload at all. If intent were stored
    // outside the hash, an attacker could rewrite the agent's stated purpose
    // while leaving the chain intact. The trail would then contain a sentence
    // nobody said, with a valid signature over it.
    await appendLedgerEntry(groupId, {
      agentId: "agent-a",
      sessionKey: "agent:agent-a:main",
      toolName: "read",
      resourceKind: "path",
      resource: "/a",
      ruleId: "r",
      decision: "allow",
      intent: "reading the config",
    });
    const { readFile, writeFile } = await import("node:fs/promises");
    const { ledgerFilePath } = await import("./paths.js");
    const path = ledgerFilePath(groupId);
    const raw = await readFile(path, "utf8");
    await writeFile(path, raw.replace("reading the config", "deleting the config"), "utf8");

    expect((await verifyLedgerChain(groupId)).ok).toBe(false);
  });

  it("redacts and clamps at the ledger boundary too", async () => {
    // Not only at capture: a caller that assembles an intent some other way
    // must not be able to widen the field or slip a secret past by going round
    // `agent-intent.ts`.
    await appendLedgerEntry(groupId, {
      agentId: "agent-a",
      sessionKey: "agent:agent-a:main",
      toolName: "read",
      resourceKind: "path",
      resource: "/a",
      ruleId: "r",
      decision: "allow",
      intent: `connecting to postgres://admin:s3cr3tP4ss@db/prod ${"x".repeat(MAX_INTENT_LENGTH)}`,
    });
    const entry = (await tailLedger(groupId, 10)).find((e) => e.toolName === "read");
    expect(entry?.intent).not.toContain("s3cr3tP4ss");
    expect((entry?.intent ?? "").length).toBeLessThanOrEqual(MAX_INTENT_LENGTH);
  });

  it("writes no intent key at all when there is none", async () => {
    // Presence is what the payload keys on, so an explicit `undefined` would
    // change the hash of every entry that has no intent.
    await appendLedgerEntry(groupId, {
      agentId: "agent-a",
      sessionKey: "agent:agent-a:main",
      toolName: "read",
      resourceKind: "path",
      resource: "/a",
      ruleId: "r",
      decision: "allow",
    });
    const entry = (await tailLedger(groupId, 10)).find((e) => e.toolName === "read");
    expect(entry && Object.hasOwn(entry, "intent")).toBe(false);
  });

  it("gives a hostile intent string its own fingerprint", async () => {
    // **This test is weaker than its first version claimed, and finding 132 is
    // the correction.** It was written asserting that the payload tag closes a
    // *reachable* collision: an intent of the literal `"keyed"` colliding with
    // the marker that follows it. Mutation testing disproved that. Removing
    // the tag left every test here passing, because `appendLedgerEntry` writes
    // `keyed: true` on every entry, so the colliding pair cannot be produced.
    //
    // What is asserted below is what is actually true and worth holding: a
    // model-supplied string that looks like ledger machinery still produces a
    // distinct entry and leaves the chain verifiable. The tag stays as defence
    // against a future unkeyed path, and the comment in `canonicalPayload` now
    // says so rather than claiming a live threat.
    await appendLedgerEntry(groupId, {
      agentId: "agent-a",
      sessionKey: "agent:agent-a:main",
      toolName: "read",
      resourceKind: "path",
      resource: "/a",
      ruleId: "r",
      decision: "allow",
      intent: "keyed",
    });
    await appendLedgerEntry(groupId, {
      agentId: "agent-a",
      sessionKey: "agent:agent-a:main",
      toolName: "read",
      resourceKind: "path",
      resource: "/a",
      ruleId: "r",
      decision: "allow",
    });
    const entries = (await tailLedger(groupId, 10)).filter((e) => e.toolName === "read");
    expect(entries).toHaveLength(2);
    // Different entries, different fingerprints, and the chain still verifies.
    expect(entries[0]?.hash).not.toBe(entries[1]?.hash);
    expect((await verifyLedgerChain(groupId)).ok).toBe(true);
  });
});

describe("finding 133. A Viewer must not read the model's narration", () => {
  it("masks the intent for a sanitized reader", async () => {
    // The Viewer tier is masked from the literal command, path and host because
    // those disclose workspace detail. Model narration discloses more: it names
    // the files it is about to touch and quotes what it has already read. A
    // field added after `sanitizeLedgerEntry` was written does not inherit its
    // protection. This is the test that says so.
    await appendLedgerEntry(groupId, {
      agentId: "agent-a",
      sessionKey: "agent:agent-a:main",
      toolName: "read",
      resourceKind: "path",
      resource: "/workspace/secrets/config.json",
      ruleId: "r",
      decision: "allow",
      intent: "Opening /workspace/secrets/config.json to find the database password.",
    });
    const entry = (await tailLedger(groupId, 10)).find((e) => e.toolName === "read");
    expect(entry).toBeDefined();

    const masked = sanitizeLedgerEntry(entry as NonNullable<typeof entry>);
    expect(masked.intent).toBe(REDACTED_INTENT);
    expect(masked.intent).not.toContain("database password");
    expect(masked.intent).not.toContain("secrets/config.json");
  });

  it("leaves the field absent rather than inventing one when there was no intent", async () => {
    // Masking must not manufacture an intent for an entry that never had one:
    // a Viewer would read "[intent visible to…]" and conclude the model had
    // stated a purpose that it never did.
    await appendLedgerEntry(groupId, {
      agentId: "agent-a",
      sessionKey: "agent:agent-a:main",
      toolName: "read",
      resourceKind: "path",
      resource: "/a",
      ruleId: "r",
      decision: "allow",
    });
    const entry = (await tailLedger(groupId, 10)).find((e) => e.toolName === "read");
    const masked = sanitizeLedgerEntry(entry as NonNullable<typeof entry>);
    expect(Object.hasOwn(masked, "intent")).toBe(false);
  });
});
