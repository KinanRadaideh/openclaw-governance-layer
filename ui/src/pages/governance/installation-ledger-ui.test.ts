/* @vitest-environment jsdom */
// T97 on the dashboard: an installation-level event is marked as one, numbered in its own chain,
// and Root's verification shows the installation chain in a row of its own. Organisation entries
// and an organisation-only verification render exactly as before. Asserted in the operator's words.
import { render } from "lit";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { i18n, t } from "../../i18n/index.ts";
import { enGovernance } from "../../i18n/locales/en-governance.ts";
import type { GovernanceLedgerEntry, GovernanceLedgerVerification } from "./api.ledger.ts";
import { renderLedgerSection } from "./panels/oversight-panels.ts";

beforeEach(() => {
  i18n.registerLocaleStrings("en", enGovernance);
});

afterEach(() => {
  document.body.replaceChildren();
});

function entry(patch: Partial<GovernanceLedgerEntry>): GovernanceLedgerEntry {
  return {
    seq: 3,
    timestamp: new Date().toISOString(),
    agentId: "ghost",
    sessionKey: "agent:ghost:main",
    toolName: "exec",
    resourceKind: "command",
    resource: "*",
    ruleId: "agent-not-registered",
    decision: "deny",
    prevHash: "",
    hash: "",
    ...patch,
  };
}

function panel(
  ledger: GovernanceLedgerEntry[],
  verification: GovernanceLedgerVerification | null = null,
): HTMLElement {
  const host = document.createElement("div");
  document.body.replaceChildren(host);
  render(
    renderLedgerSection({
      ledger,
      ledgerFilter: "all",
      verification,
      busy: false,
      onFilter: () => {},
      onVerify: () => {},
    }),
    host,
  );
  return host;
}

describe("T97: installation-level events on the ledger panel", () => {
  it("marks an installation entry and numbers it in its own chain", () => {
    const text = panel([entry({ ledgerScope: "installation" })]).textContent ?? "";
    expect(text).toContain(t("governance.ledger.installationNumber", { seq: "3" }));
    expect(text).toContain("installation #3 exec");
    expect(text).toContain(t("governance.ledger.installationEvent"));
    expect(text).toContain("Only Root sees these.");
  });

  it("leaves an organisation entry exactly as before", () => {
    const text = panel([entry({ agentId: "agent-a", ruleId: "default-deny" })]).textContent ?? "";
    expect(text).toContain("#3 exec");
    expect(text).not.toContain("installation #3");
    expect(text).not.toContain(t("governance.ledger.installationEvent"));
  });

  it("tells the two apart when both carry the same number", () => {
    const host = panel([
      entry({ agentId: "agent-a", ruleId: "default-deny", resource: "ls" }),
      entry({ ledgerScope: "installation" }),
    ]);
    const codes = [...host.querySelectorAll("code")].map((code) => code.textContent?.trim());
    expect(codes).toContain("#3 exec");
    expect(codes).toContain("installation #3 exec");
  });

  it("shows Root's installation verification in a row of its own, apart from the organisation's", () => {
    const host = panel([], {
      ok: true,
      entriesChecked: 4,
      evidence: { headSeq: 4, headHash: "a".repeat(64), checkpointSeq: 4, keyed: true },
      installation: {
        ok: false,
        entriesChecked: 2,
        brokenAtSeq: 1,
        reason: "hash mismatch",
      },
    });
    // The row itself, not the live region, which repeats both verdicts (mutation M11 survived a
    // check of the whole panel's text for exactly that reason).
    const live0 = host.querySelector('[role="status"]');
    live0?.remove();
    const text = host.textContent ?? "";
    expect(text).toContain(`${t("governance.ledger.intact")} (4)`);
    expect(text).toContain(t("governance.ledger.installationIntegrity"));
    expect(text).toContain(t("governance.ledger.installationIntegrityHow"));
    expect(text).toContain(`${t("governance.ledger.tampered")} #1: hash mismatch`);
    if (live0) {
      host.append(live0);
    }
    // The live region speaks both verdicts.
    const live = host.querySelector('[role="status"]')?.textContent ?? "";
    expect(live).toContain(t("governance.ledger.installationIntegrity"));
  });

  it("gives the installation chain's head and checkpoint, as the organisation's row does", () => {
    const text =
      panel([], {
        ok: true,
        entriesChecked: 2,
        evidence: { headSeq: 2, headHash: "c".repeat(64), checkpointSeq: 2, keyed: true },
        installation: {
          ok: true,
          entriesChecked: 3,
          evidence: { headSeq: 3, headHash: "d".repeat(64), checkpointSeq: 3, keyed: true },
        },
      }).textContent ?? "";
    expect(text).toContain(
      t("governance.ledger.integrityEvidence", {
        count: "3",
        headSeq: "3",
        headHash: "d".repeat(16),
        checkpointSeq: "3",
      }),
    );
  });

  it("adds no installation row when the verification carries none", () => {
    const text =
      panel([], {
        ok: true,
        entriesChecked: 1,
        evidence: { headSeq: 1, headHash: "b".repeat(64), keyed: true },
      }).textContent ?? "";
    expect(text).not.toContain(t("governance.ledger.installationIntegrity"));
  });

  // Finding 457 (QA 2026-11-11): every failed sign-in and lockout is written to the installation
  // chain, a real account's included (recorded alike so the trail is no account-existence
  // oracle). The line under such a row said the event "belongs to no organisation".
  it("does not tell Root that a failed sign-in for a real account belongs to no organisation", () => {
    const text =
      panel([
        entry({
          ledgerScope: "installation",
          entryKind: "admin",
          toolName: "governance.auth.login-failed",
          resourceKind: "admin",
          resource: 'failed sign-in for "root1"',
          actor: "unauthenticated",
          agentId: "-",
          ruleId: "root1",
        }),
      ]).textContent ?? "";
    expect(text).toContain(t("governance.ledger.installationEvent"));
    expect(text).not.toMatch(/because it belongs to no organisation/);
    expect(text).toMatch(/every failed or locked-out sign-in/);
  });
});
