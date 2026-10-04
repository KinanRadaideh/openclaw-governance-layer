// T73, ideas 4 and 14: the dashboard as a witness, and the alerts a person sees.
import { createHmac } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ADMIN_ACTIONS, recordAdminAction } from "./admin-audit.js";
import {
  appendLedgerEntry,
  LEDGER_WITNESS_ACTION,
  resetLedgerCursorForTests,
  setLedgerRotateBytesForTests,
  verifyLedgerChain,
  type LedgerEntry,
} from "./audit-ledger.js";
import {
  acknowledgeLedgerAlert,
  AlertAcknowledgementError,
  listLedgerIntegrityAlerts,
  resetLedgerAlertIndexForTests,
  unacknowledgedLedgerAlerts,
} from "./ledger-alerts.js";
import { resetLedgerKeyCacheForTests } from "./ledger-key.js";
import {
  checkLedgerWitnessReceipt,
  issueLedgerWitnessReceipt,
  parseLedgerWitnessReceipt,
  type LedgerWitnessReceipt,
} from "./ledger-witness.js";
import { ledgerCheckpointFilePath, ledgerFilePath } from "./paths.js";
import { seedGroupWithAgents } from "./test-group.js";

let dir: string;
let GROUP: string;
const ROOT = { name: "rooty", role: "root" as const };

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "governance-witness-"));
  process.env.OPENCLAW_GOVERNANCE_DIR = dir;
  GROUP = await seedGroupWithAgents(["agent-a"]);
  resetLedgerKeyCacheForTests();
  resetLedgerCursorForTests();
  resetLedgerAlertIndexForTests();
});

afterEach(async () => {
  setLedgerRotateBytesForTests(undefined);
  delete process.env.OPENCLAW_GOVERNANCE_DIR;
  resetLedgerKeyCacheForTests();
  resetLedgerCursorForTests();
  resetLedgerAlertIndexForTests();
  await rm(dir, { recursive: true, force: true });
});

async function append(resource: string): Promise<LedgerEntry> {
  return appendLedgerEntry(GROUP, {
    agentId: "agent-a",
    toolName: "exec",
    resourceKind: "command",
    resource,
    ruleId: "default-deny",
    decision: "deny",
  });
}

async function entries(): Promise<LedgerEntry[]> {
  return (await readFile(ledgerFilePath(GROUP), "utf8"))
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as LedgerEntry);
}

/**
 * The attack the witness exists for: cut the ledger **and** rewind the
 * checkpoint to match, so the gap line has nothing to find.
 */
async function cutAndCoverTracks(keep: number): Promise<void> {
  const kept = (await entries()).slice(0, keep);
  await writeFile(ledgerFilePath(GROUP), kept.map((e) => `${JSON.stringify(e)}\n`).join(""));
  const file = JSON.parse(await readFile(ledgerCheckpointFilePath(), "utf8"));
  const last = kept.at(-1) as LedgerEntry;
  file[GROUP] = { seq: last.seq, hash: last.hash, updatedAt: new Date().toISOString() };
  await writeFile(ledgerCheckpointFilePath(), JSON.stringify(file));
  resetLedgerCursorForTests();
}

async function receipt(): Promise<LedgerWitnessReceipt> {
  const issued = await issueLedgerWitnessReceipt(GROUP);
  if (!issued) {
    throw new Error("expected a head");
  }
  return issued;
}

describe("the witness receipt (idea 4)", () => {
  it("is issued for the head and checks as consistent while the ledger holds it", async () => {
    await append("one");
    const second = await append("two");
    const held = await receipt();
    expect(held).toMatchObject({ groupId: GROUP, seq: 2, hash: second.hash });
    await append("three");
    expect(await checkLedgerWitnessReceipt(GROUP, held, "viewer1 (viewer)")).toEqual({
      status: "consistent",
    });
  });

  it("catches a cut the checkpoint was rewound to hide, and records it in the chain", async () => {
    await append("one");
    await append("two");
    await append("three");
    const held = await receipt();
    await cutAndCoverTracks(1);
    // The gap line has nothing to find: the checkpoint agrees with the cut file.
    await append("four");
    expect((await verifyLedgerChain(GROUP)).alerts).toBeUndefined();

    const checked = await checkLedgerWitnessReceipt(GROUP, held, "admin2 (administrator)");

    expect(checked.status).toBe("contradicted");
    const alert = (await entries()).find((e) => e.toolName === LEDGER_WITNESS_ACTION);
    expect(alert?.seq).toBe(checked.alertSeq);
    // #3 no longer exists as it was: the cut file's #3 is "four".
    expect(alert?.resource).toContain("dashboard of admin2 (administrator)");
    expect(alert?.resource).toContain(`entry #3 (fingerprint ${held.hash.slice(0, 16)})`);
    const verification = await verifyLedgerChain(GROUP);
    expect(verification.ok).toBe(true);
    expect(verification.alerts?.map((a) => a.action)).toEqual([LEDGER_WITNESS_ACTION]);
  });

  it("records one alert for one contradiction, however often it is reported", async () => {
    await append("one");
    await append("two");
    const held = await receipt();
    await cutAndCoverTracks(1);
    await checkLedgerWitnessReceipt(GROUP, held, "a");
    await checkLedgerWitnessReceipt(GROUP, held, "b");
    await Promise.all([
      checkLedgerWitnessReceipt(GROUP, held, "c"),
      checkLedgerWitnessReceipt(GROUP, held, "d"),
    ]);
    expect((await entries()).filter((e) => e.toolName === LEDGER_WITNESS_ACTION)).toHaveLength(1);
  });

  it("does not add a second alert when the gap line already records the same entry", async () => {
    await append("one");
    await append("two");
    const held = await receipt();
    // Cut without rewinding the checkpoint: the checkpoint names the held head.
    const kept = (await entries()).slice(0, 1);
    await writeFile(ledgerFilePath(GROUP), `${JSON.stringify(kept[0])}\n`);
    resetLedgerCursorForTests();
    const checked = await checkLedgerWitnessReceipt(GROUP, held, "a");
    expect(checked.status).toBe("contradicted");
    const alerts = await listLedgerIntegrityAlerts(GROUP);
    expect(alerts).toHaveLength(1);
    expect(alerts[0]?.subject).toBe(`checkpoint:2:${held.hash}`);
  });

  it("cannot be forged by an account without the key", async () => {
    await append("one");
    const made = { groupId: GROUP, seq: 1, hash: "a".repeat(64) };
    const forged = {
      ...made,
      receipt: createHmac("sha256", "guess").update("anything").digest("hex"),
    };
    expect((await checkLedgerWitnessReceipt(GROUP, forged, "x")).status).toBe("unverifiable");
    expect(await listLedgerIntegrityAlerts(GROUP)).toEqual([]);
  });

  it("is unverifiable for another organisation and for another installation's key", async () => {
    await append("one");
    const held = await receipt();
    expect(
      (await checkLedgerWitnessReceipt("group-other", { ...held, groupId: "group-other" }, "x"))
        .status,
    ).toBe("unverifiable");
    process.env.OPENCLAW_GOVERNANCE_LEDGER_KEY = "a-completely-different-installation";
    resetLedgerKeyCacheForTests();
    try {
      expect((await checkLedgerWitnessReceipt(GROUP, held, "x")).status).toBe("unverifiable");
    } finally {
      delete process.env.OPENCLAW_GOVERNANCE_LEDGER_KEY;
      resetLedgerKeyCacheForTests();
    }
  });

  it("ignores anything in browser storage that is not shaped like a receipt", () => {
    expect(parseLedgerWitnessReceipt(undefined)).toBeUndefined();
    expect(parseLedgerWitnessReceipt("x")).toBeUndefined();
    expect(
      parseLedgerWitnessReceipt({
        groupId: "g",
        seq: 0,
        hash: "a".repeat(64),
        receipt: "b".repeat(64),
      }),
    ).toBeUndefined();
    expect(
      parseLedgerWitnessReceipt({
        groupId: "g",
        seq: 1,
        hash: "A".repeat(64),
        receipt: "b".repeat(64),
      }),
    ).toBeUndefined();
    expect(
      parseLedgerWitnessReceipt({
        groupId: "g",
        seq: 1,
        hash: "a".repeat(64),
        receipt: "b".repeat(64),
      }),
    ).toEqual({ groupId: "g", seq: 1, hash: "a".repeat(64), receipt: "b".repeat(64) });
  });

  it("has nothing to issue while the ledger is empty", async () => {
    // The fixture's own entries were discarded, so this group has written nothing.
    expect(await issueLedgerWitnessReceipt(GROUP)).toBeUndefined();
  });
});

describe("the alerts a person sees (idea 14)", () => {
  async function raiseGap(): Promise<number> {
    await append("one");
    await append("two");
    const kept = (await entries()).slice(0, 1);
    await writeFile(ledgerFilePath(GROUP), `${JSON.stringify(kept[0])}\n`);
    resetLedgerCursorForTests();
    await append("three");
    const [alert] = await unacknowledgedLedgerAlerts(GROUP);
    if (!alert) {
      throw new Error("expected an alert");
    }
    return alert.seq;
  }

  it("lists a gap line until Root acknowledges it with a reason", async () => {
    const seq = await raiseGap();
    expect(await unacknowledgedLedgerAlerts(GROUP)).toEqual([
      expect.objectContaining({ seq, summary: expect.stringContaining("removed from the end") }),
    ]);
    await acknowledgeLedgerAlert(GROUP, { seq, reason: "  restored from backup  ", actor: ROOT });
    expect(await unacknowledgedLedgerAlerts(GROUP)).toEqual([]);
    const ack = (await entries()).find((e) => e.toolName === ADMIN_ACTIONS.ledgerAlertAcknowledge);
    expect(ack).toMatchObject({ actor: "rooty", actorRole: "root", ruleId: String(seq) });
    expect(ack?.resource).toContain("reason: restored from backup");
    // The alert itself stays in the chain.
    expect((await verifyLedgerChain(GROUP)).alerts).toHaveLength(1);
  });

  it("refuses an acknowledgement without a reason, or for an alert that is not open", async () => {
    const seq = await raiseGap();
    await expect(
      acknowledgeLedgerAlert(GROUP, { seq, reason: "   ", actor: ROOT }),
    ).rejects.toThrow(AlertAcknowledgementError);
    await expect(
      acknowledgeLedgerAlert(GROUP, { seq, reason: "x".repeat(501), actor: ROOT }),
    ).rejects.toThrow(/keep it to 500/);
    await expect(
      acknowledgeLedgerAlert(GROUP, { seq: seq + 100, reason: "why", actor: ROOT }),
    ).rejects.toThrow(/no unacknowledged integrity alert/);
    await acknowledgeLedgerAlert(GROUP, { seq, reason: "why", actor: ROOT });
    await expect(
      acknowledgeLedgerAlert(GROUP, { seq, reason: "again", actor: ROOT }),
    ).rejects.toThrow(/no unacknowledged integrity alert/);
  });

  it("does not count an acknowledgement recorded at a lower tier", async () => {
    const seq = await raiseGap();
    await recordAdminAction(GROUP, {
      actor: { name: "admin2", role: "administrator" },
      action: ADMIN_ACTIONS.ledgerAlertAcknowledge,
      subjectId: String(seq),
      target: "not mine to clear",
    });
    expect(await unacknowledgedLedgerAlerts(GROUP)).toHaveLength(1);
  });

  it("neither raises nor clears an alert from a line appended without the key", async () => {
    const seq = await raiseGap();
    const last = (await entries()).at(-1) as LedgerEntry;
    // Shaped exactly like the real thing, administrative and keyed, so the only
    // thing wrong with them is the seal. (The first version spread an agent entry,
    // so neither line looked like an alert or an acknowledgement at all and the
    // seal check was never reached: mutation testing found it, 2026-10-04.)
    const fakeAck = {
      ...last,
      entryKind: "admin",
      keyed: true,
      seq: last.seq + 1,
      prevHash: last.hash,
      toolName: ADMIN_ACTIONS.ledgerAlertAcknowledge,
      actor: "rooty",
      actorRole: "root",
      ruleId: String(seq),
      hash: "0".repeat(64),
    };
    const fakeAlert = {
      ...fakeAck,
      seq: last.seq + 2,
      toolName: LEDGER_WITNESS_ACTION,
      actor: "ledger-integrity",
    };
    await writeFile(
      ledgerFilePath(GROUP),
      `${await readFile(ledgerFilePath(GROUP), "utf8")}${JSON.stringify(fakeAck)}\n${JSON.stringify(fakeAlert)}\n`,
    );
    const open = await unacknowledgedLedgerAlerts(GROUP);
    expect(open.map((a) => a.seq)).toEqual([seq]);
  });

  it("reads only what was appended since the last read, and starts again after a rotation", async () => {
    const seq = await raiseGap();
    expect((await unacknowledgedLedgerAlerts(GROUP)).map((a) => a.seq)).toEqual([seq]);
    setLedgerRotateBytesForTests(400);
    for (let index = 0; index < 5; index += 1) {
      await append(`after-${index}`);
    }
    // The alert is now in an archive; the index rebuilt and still finds it.
    expect((await unacknowledgedLedgerAlerts(GROUP)).map((a) => a.seq)).toEqual([seq]);
    await acknowledgeLedgerAlert(GROUP, { seq, reason: "checked", actor: ROOT });
    expect(await unacknowledgedLedgerAlerts(GROUP)).toEqual([]);
  });
});
