/* @vitest-environment jsdom */
// T93 on the dashboard (Kinan, 2026-11-08, "Separate url kind"): the url kind can be chosen
// wherever a rule kind is chosen, the pattern box shows an example in that kind's terms, and
// the ledger shows the address a network call asked for. Asserted in the operator's words.
import { render } from "lit";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { i18n } from "../../i18n/index.ts";
import { enGovernance } from "../../i18n/locales/en-governance.ts";
import type { GovernanceLedgerEntry } from "./api.ledger.ts";
import type { GovernanceRuleRequest } from "./api.rule-requests.ts";
import type { GovernanceApi } from "./api.ts";
import { renderRuleRequestsSection } from "./panels/account-panels.ts";
import { renderLedgerSection } from "./panels/oversight-panels.ts";
import { emptyRuleRequestDrafts, type RuleRequestDrafts } from "./panels/rule-request-drafts.ts";
import { patternPlaceholderFor, RULE_KINDS } from "./rule-kind-hints.ts";

beforeEach(() => {
  i18n.registerLocaleStrings("en", enGovernance);
});

afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

function requestForm(initial: Partial<RuleRequestDrafts> = {}) {
  const submitRuleRequest = vi.fn(async (_input: unknown) => ({}) as GovernanceRuleRequest);
  let drafts: RuleRequestDrafts = { ...emptyRuleRequestDrafts(), ...initial };
  const host = document.createElement("div");
  document.body.replaceChildren(host);
  const draw = () =>
    render(
      renderRuleRequestsSection({
        api: () => ({ submitRuleRequest }) as unknown as GovernanceApi,
        run: async (action) => {
          await action();
        },
        confirmThen: async () => {},
        role: "user",
        identity: { username: "user1", role: "user", assignedAgents: ["main"] },
        ruleRequests: [],
        busy: false,
        canAdminister: false,
        canManageAnyAgent: false,
        knownAgentIds: ["main"],
        agentLabel: (agentId) => agentId,
        drafts,
        onDraft: (patch) => {
          drafts = { ...drafts, ...patch };
          draw();
        },
      }),
      host,
    );
  draw();
  return { host, submitRuleRequest };
}

describe("the kind box shows the kind the form holds", () => {
  // Found live on 2026-11-08: after the warning's "Change it" the add-rule form is drawn
  // afresh, and the kind box showed "command" while the form still held "url", because the
  // select's value was set before its options existed.
  it.each(["url", "network", "path"] as const)("a form drawn afresh with %s shows %s", (kind) => {
    const { host } = requestForm({ requestKind: kind });
    const select = host.querySelector<HTMLSelectElement>('select[aria-label="Resource kind"]')!;
    expect(select.value).toBe(kind);
  });
});

describe("the url kind on the rule request form", () => {
  it("offers every kind, url included, and explains the two network kinds", () => {
    const { host } = requestForm();
    const kind = host.querySelector<HTMLSelectElement>('select[aria-label="Resource kind"]')!;
    expect([...kind.options].map((option) => option.value)).toEqual([
      "command",
      "path",
      "network",
      "url",
    ]);
    expect(kind.title).toContain("scheme://host:port/path?query");
  });

  it("shows an address example once url is chosen, and asks for a url rule", async () => {
    const { host, submitRuleRequest } = requestForm();
    const kind = host.querySelector<HTMLSelectElement>('select[aria-label="Resource kind"]')!;
    kind.value = "url";
    kind.dispatchEvent(new Event("change"));
    const pattern = host.querySelector<HTMLInputElement>('input[aria-label="Rule pattern"]')!;
    expect(pattern.placeholder).toContain("https://api[.]example[.]com:443/");

    pattern.value = "^https://api[.]example[.]com:443/v1(/|\\?|$)";
    pattern.dispatchEvent(new Event("input"));
    const reason = host.querySelector<HTMLInputElement>(
      'input[aria-label="Reason for this request"]',
    )!;
    reason.value = "the v1 API only";
    reason.dispatchEvent(new Event("input"));
    [...host.querySelectorAll("button")]
      .find((b) => b.textContent?.trim() === "Submit request")!
      .click();
    await vi.waitFor(() =>
      expect(submitRuleRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          resourceKind: "url",
          pattern: "^https://api[.]example[.]com:443/v1(/|\\?|$)",
        }),
      ),
    );
  });
});

describe("pattern examples by kind", () => {
  it("gives a host for network, an address with its port for url", () => {
    expect(patternPlaceholderFor("network")).toContain("^api[.]example[.]com$");
    expect(patternPlaceholderFor("url")).toContain(":443/");
    expect(patternPlaceholderFor("command")).toContain("^ls");
    expect(RULE_KINDS).toContain("url");
  });
});

describe("the ledger shows the address of a network call", () => {
  function ledgerWith(entry: Partial<GovernanceLedgerEntry>): HTMLElement {
    const host = document.createElement("div");
    document.body.replaceChildren(host);
    render(
      renderLedgerSection({
        ledger: [
          {
            seq: 7,
            timestamp: new Date().toISOString(),
            agentId: "main",
            sessionKey: "s",
            toolName: "web_fetch",
            resourceKind: "network",
            resource: "api.example.com",
            ruleId: "default-deny",
            decision: "ask",
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
    return host;
  }

  it("prints the masked address under the entry", () => {
    const host = ledgerWith({ url: "https://api.example.com:443/v1/x?key=***" });
    expect(host.textContent?.replace(/\s+/g, " ")).toContain(
      "Address: https://api.example.com:443/v1/x?key=***",
    );
  });

  it("adds no empty Address line to an entry that has none", () => {
    const host = ledgerWith({ toolName: "exec", resourceKind: "command", resource: "ls" });
    expect(host.textContent).not.toContain("Address:");
  });
});
