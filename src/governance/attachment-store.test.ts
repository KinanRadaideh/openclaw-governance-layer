// T14 — attachments are allowed, and requirement #8 still holds.
//
// The tests are grouped by the claim each defends, because the feature is only
// acceptable if all four hold at once:
//
//   1. The content never reaches the ledger. This is requirement #8, and it is
//      the reason the feature was held for weeks rather than built.
//   2. The governed agent cannot read the store. Inherited from the
//      self-protecting core denials — and *asserted*, because inherited
//      protection that nobody checks is the shape of the coverage guard that
//      could not fail.
//   3. The hostile-input list is answered: the filename never becomes a path,
//      the size cap bites before memory is allocated, the declared type never
//      wins over the content.
//   4. Evidence and record stay in step: the sweep is driven by the ledger, not
//      by the transcript that forgets.
import { mkdtemp, readdir, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  attachmentStoreStats,
  AttachmentIndexUnreadableError,
  AttachmentQuotaExceededError,
  AttachmentTooLargeError,
  listAttachments,
  markAttachmentUsed,
  MAX_ATTACHMENT_BYTES,
  releaseAttachment,
  sniffMimeType,
  storeAttachment,
  sweepOrphans,
} from "./attachment-store.js";
import { tailLedger } from "./audit-ledger.js";
import { resetLedgerKeyCacheForTests } from "./ledger-key.js";
import { attachmentsDir } from "./paths.js";
import { evaluateGovernancePolicy } from "./policy-engine.js";
import { savePolicy } from "./policy-store.js";
import { defaultPolicyDocument } from "./policy-types.js";
import { seedGroupWithAgents } from "./test-group.js";

let dir: string;
let workspace: string;

/** The organisation this suite's agents belong to (M5). Per-group storage means
 * every call names a group, and mandatory registration means the gate refuses an
 * agent it has no record of, so the fixture creates a real one. */
let TEST_GROUP: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "governance-attachments-"));
  process.env.OPENCLAW_GOVERNANCE_DIR = dir;
  TEST_GROUP = await seedGroupWithAgents(["agent-a"]);
  resetLedgerKeyCacheForTests();
  workspace = await mkdtemp(join(tmpdir(), "governance-attach-ws-"));
  await savePolicy(TEST_GROUP, { ...defaultPolicyDocument(), mode: "enforce", ask: "off" });
});

afterEach(async () => {
  delete process.env.OPENCLAW_GOVERNANCE_DIR;
  resetLedgerKeyCacheForTests();
  await rm(dir, { recursive: true, force: true });
  await rm(workspace, { recursive: true, force: true });
});

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);

function store(overrides: Partial<Parameters<typeof storeAttachment>[1]> = {}) {
  return storeAttachment(TEST_GROUP, {
    content: PNG,
    declaredName: "screenshot.png",
    storedBy: "alice",
    agentId: "agent-a",
    ...overrides,
  });
}

describe("requirement #8: the content never reaches the ledger", () => {
  it("records hash, type and size — and not the bytes", async () => {
    const secret = new TextEncoder().encode("api_key=SUPERSECRETVALUE12345");
    const record = await store({ content: secret, declaredName: "notes.txt" });

    const { recordAdminAction, ADMIN_ACTIONS } = await import("./admin-audit.js");
    await recordAdminAction(TEST_GROUP, {
      actor: { name: "alice", role: "user" },
      action: ADMIN_ACTIONS.agentPrompt,
      agentId: "agent-a",
      target: `prompt: look at this | attachments: ${record.declaredName} (${record.mimeType}, ${record.bytes} bytes, sha256:${record.sha256})`,
    });

    const entries = await tailLedger(TEST_GROUP, 10);
    const serialised = JSON.stringify(entries);
    // The proof: the ledger names the file and cannot reproduce it.
    expect(serialised).toContain(record.sha256);
    expect(serialised).not.toContain("SUPERSECRETVALUE12345");
  });

  it("keeps the bytes retrievable from the store, so the trail is provable", async () => {
    const record = await store();
    const onDisk = await readFile(join(attachmentsDir(TEST_GROUP), record.sha256));
    // An investigator holding the file can show it is the file that was sent;
    // one without it learns type, size, sender, agent and time. That is how
    // evidence handling usually works.
    expect(new Uint8Array(onDisk)).toEqual(PNG);
  });
});

describe("the agent cannot read the store", () => {
  it("is refused by the self-protecting core denial", async () => {
    const record = await store();
    const target = join(attachmentsDir(TEST_GROUP), record.sha256);

    const decision = await evaluateGovernancePolicy(
      { toolName: "read", params: { path: target } },
      { agentId: "agent-a", sessionKey: "agent:agent-a:main", cwd: workspace },
    );

    // Inherited from the denial on the governance directory — which is one of
    // the three Root cannot switch off. Asserted rather than assumed: this is
    // the whole reason the store lives where it lives.
    expect(decision && "block" in decision).toBe(true);
  });

  it("is refused to a command naming it too, not only to file tools", async () => {
    const decision = await evaluateGovernancePolicy(
      {
        toolName: "exec",
        params: { command: `cat ${join(attachmentsDir(TEST_GROUP), "anything")}` },
      },
      { agentId: "agent-a", sessionKey: "agent:agent-a:main", cwd: workspace },
    );
    expect(decision && "block" in decision).toBe(true);
  });

  it("stores files privately", async () => {
    const record = await store();
    const info = await stat(join(attachmentsDir(TEST_GROUP), record.sha256));
    if (process.platform !== "win32") {
      expect(info.mode & 0o077).toBe(0);
    }
    expect(info.isFile()).toBe(true);
  });
});

describe("the hostile-input list", () => {
  it("never lets the declared filename become a path component", async () => {
    const record = await store({ declaredName: "../../.ssh/authorized_keys" });

    const names = await readdir(attachmentsDir(TEST_GROUP));
    // Named by hash. Traversal is not defended against here — it is
    // unreachable, because the uploader's string never reaches the filesystem.
    expect(names).toContain(record.sha256);
    expect(names.every((name) => !name.includes(".."))).toBe(true);
    expect(names.every((name) => !name.includes("ssh"))).toBe(true);
    // It is still recorded, as metadata, so an investigator sees what the
    // uploader called it.
    expect(record.declaredName).toContain("authorized_keys");
  });

  it("clamps an enormous declared name", async () => {
    const record = await store({ declaredName: "z".repeat(5000) });
    expect(record.declaredName.length).toBeLessThanOrEqual(200);
  });

  it("refuses an oversized file while streaming, not after buffering it", async () => {
    // The cap has to bite during the read. Buffering first and checking the
    // length afterwards lets an attacker choose how much memory the process
    // allocates before being told no — which is the denial of service the cap
    // exists to prevent rather than a check against it.
    let produced = 0;
    async function* tooBig(): AsyncGenerator<Uint8Array> {
      const chunk = new Uint8Array(1024 * 1024);
      for (let index = 0; index < 32; index += 1) {
        produced += chunk.byteLength;
        yield chunk;
      }
    }

    await expect(store({ content: tooBig() })).rejects.toBeInstanceOf(AttachmentTooLargeError);
    // Stopped early: it never read all 32 MB.
    expect(produced).toBeLessThanOrEqual(MAX_ATTACHMENT_BYTES + 1024 * 1024);
  });

  it("enforces a per-account quota so one person cannot fill the disk", async () => {
    // Per account rather than installation-wide, so one uploader cannot deny
    // the feature to everybody else.
    const big = new Uint8Array(MAX_ATTACHMENT_BYTES);
    for (let index = 0; index < 8; index += 1) {
      // Distinct content, or deduplication would make this test meaningless.
      big[index] = index + 1;
      await store({ content: big.slice(), declaredName: `f${index}` });
    }
    big[100] = 42;
    await expect(
      store({ content: big.slice(), declaredName: "one-too-many" }),
    ).rejects.toBeInstanceOf(AttachmentQuotaExceededError);
  });

  it("sniffs the type from content and ignores what the client called it", async () => {
    const record = await store({ content: PNG, declaredName: "totally-a-document.pdf" });
    // The declared type is a claim, not a fact.
    expect(record.mimeType).toBe("image/png");
  });

  it("says 'bytes we did not recognise' rather than guessing", async () => {
    expect(sniffMimeType(new Uint8Array([0x00, 0xff, 0x13, 0x37]))).toBe(
      "application/octet-stream",
    );
    expect(sniffMimeType(new TextEncoder().encode("plain text"))).toBe("text/plain");
    expect(sniffMimeType(new Uint8Array([0x25, 0x50, 0x44, 0x46]))).toBe("application/pdf");
  });
});

describe("evidence and record stay in step", () => {
  it("stores one copy of an identical file and names it once", async () => {
    const first = await store();
    const second = await store({ declaredName: "same-picture-again.png" });

    expect(second.sha256).toBe(first.sha256);
    expect(await listAttachments(TEST_GROUP)).toHaveLength(1);
    // Content addressing is not a deduplication trick here: it lets an
    // investigator see that Tuesday's file is byte-identical to Monday's.
  });

  it("sweeps only what the ledger no longer references", async () => {
    const kept = await store({ content: PNG, declaredName: "keep.png" });
    const dropped = await store({
      content: new TextEncoder().encode("temporary"),
      declaredName: "drop.txt",
    });

    const removed = await sweepOrphans(TEST_GROUP, new Set([kept.sha256]));

    expect(removed).toBe(1);
    const names = await readdir(attachmentsDir(TEST_GROUP));
    expect(names).toContain(kept.sha256);
    expect(names).not.toContain(dropped.sha256);
  });

  it("counts unreferenced files on disk so the deployment report can say so", async () => {
    await store();
    const { writeFile } = await import("node:fs/promises");
    await writeFile(join(attachmentsDir(TEST_GROUP), "deadbeef".repeat(8)), "orphan");

    const stats = await attachmentStoreStats(TEST_GROUP);
    expect(stats.count).toBe(1);
    expect(stats.orphanCount).toBe(1);
  });

  it("reports an empty store without inventing one", async () => {
    const stats = await attachmentStoreStats(TEST_GROUP);
    expect(stats).toEqual({ count: 0, totalBytes: 0, orphanCount: 0 });
  });
});

// ---------------------------------------------------------------------------
// Finding 194 — the index was the one governance store written without a lock.
//
// Four functions read this index, change it and write it back. None of them
// took the lock the account, agent and policy stores take, and none went
// through `writeGovernanceJson`. Two of the consequences are security
// properties rather than tidiness, so both are pinned here rather than left to
// the header that now explains them.
// ---------------------------------------------------------------------------
describe("the index survives concurrent writers (finding 194)", () => {
  it("keeps every record when uploads arrive together", async () => {
    const uploads = Array.from({ length: 8 }, (_, i) =>
      store({
        content: new TextEncoder().encode(`payload-${i}`),
        declaredName: `file-${i}.txt`,
      }),
    );

    await Promise.all(uploads);

    // Without the lock the last writer wins and the rest of the records are
    // lost — while their files stay on disk, unreferenced and no longer
    // counting toward the quota. That is the quota bypass, not just untidiness.
    const held = await listAttachments(TEST_GROUP);
    expect(held).toHaveLength(8);
    expect((await attachmentStoreStats(TEST_GROUP)).orphanCount).toBe(0);
  });

  it("does not lose usedAt to a write racing beside it", async () => {
    const sent = await store({
      content: new TextEncoder().encode("evidence"),
      declaredName: "sent.txt",
    });

    await Promise.all([
      markAttachmentUsed(TEST_GROUP, sent.sha256),
      store({ content: new TextEncoder().encode("unrelated"), declaredName: "other.txt" }),
    ]);

    // `usedAt` is what stops an uploader deleting bytes a ledger entry names.
    // A lost update here re-opens exactly that delete.
    const held = await listAttachments(TEST_GROUP);
    expect(held.find((entry) => entry.sha256 === sent.sha256)?.usedAt).toBeTruthy();
    expect(await releaseAttachment(TEST_GROUP, sent.sha256, "alice")).toBe("already-sent");
  });

  it("carries usedAt forward when the same bytes are uploaded again", async () => {
    const first = await store({ content: PNG, declaredName: "first.png" });
    await markAttachmentUsed(TEST_GROUP, first.sha256);

    const again = await store({ content: PNG, declaredName: "second.png" });

    // The metadata is the new upload's, because the ledger entry about to be
    // written describes that upload; the flag is the old one's, because the
    // bytes have already been sent and are evidence whoever re-uploads them.
    expect(again.declaredName).toBe("second.png");
    expect(again.usedAt).toBeTruthy();
    expect(await releaseAttachment(TEST_GROUP, first.sha256, "alice")).toBe("already-sent");
  });
});

describe("an unreadable index stops rather than reading as empty (finding 194)", () => {
  it("refuses to store against an index it cannot parse", async () => {
    await store();
    const { writeFile } = await import("node:fs/promises");
    await writeFile(join(attachmentsDir(TEST_GROUP), "index.json"), "{ truncated", "utf8");

    // Swallowing this into an empty index is how every `usedAt` in the store
    // could be dropped by one crash mid-write — the finding-78 rule at a second
    // store: a damaged state file stops the operation rather than degrading it.
    await expect(store({ declaredName: "after.txt" })).rejects.toBeInstanceOf(
      AttachmentIndexUnreadableError,
    );
  });

  it("lets the deployment report say so instead of throwing at Root", async () => {
    await store();
    const { writeFile } = await import("node:fs/promises");
    await writeFile(join(attachmentsDir(TEST_GROUP), "index.json"), "{ truncated", "utf8");

    // The one caller that must not propagate it: a Root-only diagnostic that
    // throws on the fault it exists to surface is a green tick for a defence
    // that is not there, one step further along.
    const stats = await attachmentStoreStats(TEST_GROUP);
    expect(stats).toEqual({ count: 0, totalBytes: 0, orphanCount: 0, unreadable: true });
  });

  it("still treats a store that has never been written as empty", async () => {
    // Absent and unreadable are different answers, and only the first means
    // "nothing has been stored".
    expect(await listAttachments(TEST_GROUP)).toEqual([]);
  });
});
