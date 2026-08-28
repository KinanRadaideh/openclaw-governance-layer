// Behavioural half of the sanitiser guard (finding 133).
//
// ## Where the other half lives, and why not here
//
// The classification table `VIEWER_DISCLOSURE` is in `ledger-view.ts`, not in
// this file, and that placement is the whole point. **`tsconfig.core.json`
// excludes test files**, so a `Record<keyof Required<LedgerEntry>, …>` written
// here would be typechecked by nothing — vitest strips types without checking
// them. It would look like a guard and catch nothing, which is the exact defect
// this project keeps finding (137's harness, 136's lint claim, 133 itself).
//
// So the compile-time half sits in the module, where `pnpm tsgo:core` reads it:
// **adding a field to `LedgerEntry` fails the typecheck until it is
// classified.** Verified by planting one — the error names the missing field.
//
// This file is the run-time half, and it is needed because a table that merely
// exists is another rule written down. `sanitizeLedgerEntry` is *driven* by the
// table, so these tests check that the classification is true of the behaviour
// rather than just present in the source.
import { describe, expect, it } from "vitest";
import type { LedgerEntry } from "./audit-ledger.js";
import { REDACTED_INTENT, REDACTED_RESOURCE, sanitizeLedgerEntry } from "./ledger-view.js";

/** An entry carrying every field, so the run-time half has something to check. */
function fullEntry(): LedgerEntry {
  return {
    seq: 7,
    timestamp: "2026-08-28T10:00:00.000Z",
    agentId: "agent-a",
    sessionKey: "agent:agent-a:main",
    toolName: "exec",
    resourceKind: "command",
    resource: "cat /etc/shadow",
    ruleId: "core-credentials",
    decision: "deny",
    prevHash: "prev-hash",
    hash: "this-hash",
    intent: "I am reading the credentials file to check the user list",
    entryKind: "admin",
    actor: "amina",
    actorRole: "administrator",
    keyed: true,
  };
}

/**
 * The fields this test expects to be masked, stated independently of the module.
 *
 * Deliberately a second, hand-written copy: if these tests imported
 * `VIEWER_DISCLOSURE` they would agree with the module by construction and
 * assert nothing about whether the classification is *correct*.
 */
const MASKED_VALUES: Partial<Record<keyof LedgerEntry, string>> = {
  resource: REDACTED_RESOURCE,
  intent: REDACTED_INTENT,
};

describe("the Viewer sanitiser masks what its classification says it does", () => {
  it("masks every field classified as masked", () => {
    const sanitized = sanitizeLedgerEntry(fullEntry());
    for (const [field, mask] of Object.entries(MASKED_VALUES)) {
      expect(sanitized[field as keyof LedgerEntry], `${field} was not masked`).toBe(mask);
    }
  });

  it("preserves every field classified as visible", () => {
    const original = fullEntry();
    const sanitized = sanitizeLedgerEntry(original);
    for (const field of Object.keys(original)) {
      if (field in MASKED_VALUES) {
        continue;
      }
      const key = field as keyof LedgerEntry;
      expect(sanitized[key], `${field} should have survived sanitisation`).toEqual(original[key]);
    }
  });

  it("leaks no masked value verbatim anywhere in the sanitized entry", () => {
    // Field-by-field checks pass if a masked value is copied into some other
    // field — a summary, a duplicate, a future convenience column. Serialising
    // the whole entry is the assertion that survives that.
    const original = fullEntry();
    const serialized = JSON.stringify(sanitizeLedgerEntry(original));
    for (const field of Object.keys(MASKED_VALUES)) {
      const secret = String(original[field as keyof LedgerEntry]);
      expect(serialized, `${field}'s value appears in the sanitized entry`).not.toContain(secret);
    }
  });

  it("still masks a field that is absent from this particular entry", () => {
    // `intent` is absent far more often than present, so the common path must
    // not be the one that accidentally works. An entry without it must come
    // back without it, rather than gaining a placeholder that implies the model
    // said something.
    const withoutIntent = { ...fullEntry() };
    delete withoutIntent.intent;
    expect(sanitizeLedgerEntry(withoutIntent).intent).toBeUndefined();
  });
});
