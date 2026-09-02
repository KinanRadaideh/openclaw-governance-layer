// Finding 211: deleting an organisation destroyed the evidence its retained
// ledger points at.
//
// `deleteOrganisation` keeps `audit-ledger.jsonl` on an argument it makes at
// length — "an operator who can delete the trail by deleting the organisation it
// covers has a one-click way to erase every record of everything their agents
// ever did". Attachments live at `groups/<id>/attachments`, inside the very
// directory the purge empties, so the trail survived and the files it names did
// not.
//
// The rule being broken is not a new one. `releaseAttachment` refuses to delete
// an attachment once it has been sent, because "a ledger entry names it and the
// store is the evidence behind that entry" — and the person reaching this path
// is the Root that entry would incriminate.
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { markAttachmentUsed, storeAttachment } from "./attachment-store.js";
import { deleteOrganisation } from "./organisation-deletion.js";
import { attachmentsDir, ledgerFilePath } from "./paths.js";
import { seedNamedGroup } from "./test-group.js";
import { createUser } from "./user-store.js";

const TEST_ACTOR = { name: "root", role: "root" } as const;
const TEST_GROUP = "group-evidence";

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "governance-org-delete-"));
  process.env.OPENCLAW_GOVERNANCE_DIR = dir;
  await seedNamedGroup(TEST_GROUP, ["scout"]);
});

afterEach(async () => {
  delete process.env.OPENCLAW_GOVERNANCE_DIR;
  await rm(dir, { recursive: true, force: true });
});

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

describe("deleting an organisation", () => {
  it("keeps the attachments a ledger entry names, and discards the rest", async () => {
    const root = await createUser(
      { username: "root", password: "correct-horse-battery", role: "root", groupId: TEST_GROUP },
      TEST_ACTOR,
    );
    const sent = await storeAttachment(TEST_GROUP, {
      content: new TextEncoder().encode("evidence the ledger names"),
      declaredName: "sent.txt",
      storedBy: "root",
      agentId: "scout",
    });
    const unsent = await storeAttachment(TEST_GROUP, {
      content: new TextEncoder().encode("an upload nobody ever sent"),
      declaredName: "draft.txt",
      storedBy: "root",
      agentId: "scout",
    });
    await markAttachmentUsed(TEST_GROUP, sent.sha256);

    const result = await deleteOrganisation(
      { groupId: TEST_GROUP, actingUserId: root.id, confirmation: "root" },
      TEST_ACTOR,
    );
    expect(result.ok).toBe(true);

    // The trail itself, which this module already argued for keeping.
    expect(await exists(ledgerFilePath(TEST_GROUP))).toBe(true);
    // The bytes behind it, which is the half that was missing.
    expect(await exists(join(attachmentsDir(TEST_GROUP), sent.sha256))).toBe(true);
    // An upload that was never sent is nobody's evidence, and deleting an
    // organisation is still meant to remove its data.
    expect(await exists(join(attachmentsDir(TEST_GROUP), unsent.sha256))).toBe(false);
  });

  it("leaves no attachment directory behind when nothing was ever sent", async () => {
    const root = await createUser(
      { username: "root", password: "correct-horse-battery", role: "root", groupId: TEST_GROUP },
      TEST_ACTOR,
    );
    await storeAttachment(TEST_GROUP, {
      content: new TextEncoder().encode("never sent"),
      declaredName: "draft.txt",
      storedBy: "root",
      agentId: "scout",
    });

    const result = await deleteOrganisation(
      { groupId: TEST_GROUP, actingUserId: root.id, confirmation: "root" },
      TEST_ACTOR,
    );
    expect(result.ok).toBe(true);
    expect(await exists(attachmentsDir(TEST_GROUP))).toBe(false);
  });

  it("still removes the organisation's policy and other state", async () => {
    const root = await createUser(
      { username: "root", password: "correct-horse-battery", role: "root", groupId: TEST_GROUP },
      TEST_ACTOR,
    );
    const result = await deleteOrganisation(
      { groupId: TEST_GROUP, actingUserId: root.id, confirmation: "root" },
      TEST_ACTOR,
    );
    expect(result.ok).toBe(true);
    // The retain rule is the narrow half; everything else still goes.
    expect(await exists(join(dir, "groups", TEST_GROUP, "policy.json"))).toBe(false);
    const ledger = await readFile(ledgerFilePath(TEST_GROUP), "utf8");
    expect(ledger).toContain("organisation");
  });
});
