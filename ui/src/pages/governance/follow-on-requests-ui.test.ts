/* @vitest-environment jsdom */
// T94 on the dashboard: a ledger entry for a request the agent did not name says how it was
// reached, so a redirect hop or a page's own request does not read as a call the agent made;
// and the rule form's hint says that network and url rules now judge those requests too.
// Asserted in the operator's words.
import { render } from "lit";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { i18n, t } from "../../i18n/index.ts";
import { enGovernance } from "../../i18n/locales/en-governance.ts";
import type { GovernanceLedgerEntry } from "./api.ledger.ts";
import { renderLedgerSection } from "./panels/oversight-panels.ts";

beforeEach(() => {
  i18n.registerLocaleStrings("en", enGovernance);
});

afterEach(() => {
  document.body.replaceChildren();
});

function ledgerWith(entry: Partial<GovernanceLedgerEntry>): string {
  const host = document.createElement("div");
  document.body.replaceChildren(host);
  render(
    renderLedgerSection({
      ledger: [
        {
          seq: 9,
          timestamp: new Date().toISOString(),
          agentId: "main",
          sessionKey: "s",
          toolName: "web_fetch",
          resourceKind: "network",
          resource: "elsewhere.example.net",
          url: "https://elsewhere.example.net:443/x",
          ruleId: "default-deny",
          decision: "deny",
          prevHash: "",
          hash: "",
          ...entry,
        },
      ],
      ledgerFilter: "all",
      verification: null,
      busy: false,
      onFilter: () => {},
      onVerify: () => {},
    }),
    host,
  );
  return host.textContent?.replace(/\s+/g, " ") ?? "";
}

describe("the ledger says how a request the agent did not name was reached", () => {
  it.each([
    ["redirect", "Reached by: a redirect from an address the agent named"],
    ["navigation", "Reached by: a page the agent was on (a link, a form, a script or a popup)"],
    ["page", "Reached by: a request the page made by itself"],
  ] as const)("names %s in the operator's words", (via, expected) => {
    expect(ledgerWith({ via })).toContain(expected);
  });

  it("adds no Reached by line to a call the agent named", () => {
    expect(ledgerWith({})).not.toContain("Reached by");
  });
});

describe("the rule form's hint", () => {
  it("says network and url rules also judge redirects, links and a page's own requests", () => {
    const hint = t("governance.policy.kindHint");
    expect(hint).toContain("the redirects and links they lead to");
    expect(hint).toContain("also stops a page's own requests");
  });
});
