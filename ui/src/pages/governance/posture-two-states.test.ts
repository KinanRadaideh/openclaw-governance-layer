/* @vitest-environment jsdom */

// T86 D4: the posture is Enforce or Monitor; Off is gone from the page.
//
// Off skipped the gate for every agent (no forbid rule, no kill switch, no record) and sat
// behind a confirmation (finding 87). Kinan removed it on 2026-10-10. The server refuses it
// (`POSTURE_OFF_REFUSED`); this asserts the page no longer offers it.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { i18n } from "../../i18n/index.ts";
import { enGovernance } from "../../i18n/locales/en-governance.ts";
import type { GovernanceIdentity, GovernancePolicyDocument } from "./api.ts";
import "./governance-page.ts";

type PageState = HTMLElement & {
  identity: GovernanceIdentity | null;
  loading: boolean;
  policy: GovernancePolicyDocument | null;
  users: unknown[];
  updateComplete: Promise<unknown>;
  requestUpdate(): void;
};

function policy(): GovernancePolicyDocument {
  return {
    version: 3,
    mode: "enforce",
    ask: "on-miss",
    agentMode: {},
    agentAsk: {},
    userAsk: {},
    hitlTimeoutSeconds: 300,
    rules: [],
    lockedAgents: [],
  } as GovernancePolicyDocument;
}

async function mountPage(role: GovernanceIdentity["role"]): Promise<PageState> {
  const page = document.createElement("openclaw-governance-page") as PageState;
  document.body.append(page);
  await page.updateComplete;
  Object.assign(page, {
    loading: false,
    users: [],
    identity: { username: role, role, assignedAgents: [] } as GovernanceIdentity,
    policy: policy(),
  });
  page.requestUpdate();
  await page.updateComplete;
  await page.updateComplete;
  return page;
}

function buttonTexts(root: ParentNode): string[] {
  return [...root.querySelectorAll("button")].map((button) => button.textContent?.trim() ?? "");
}

beforeEach(() => {
  i18n.registerLocaleStrings("en", enGovernance);
});

afterEach(() => {
  document.body.replaceChildren();
});

describe("the posture control (T86 D4)", () => {
  it("offers Enforce and Monitor and no Off, to an Administrator and to Root", async () => {
    for (const role of ["administrator", "root"] as const) {
      const page = await mountPage(role);
      const texts = buttonTexts(page);

      expect(texts).toContain("Enforce");
      expect(texts).toContain("Monitor");
      expect(texts).not.toContain("Off");
      expect((page.textContent ?? "").replace(/\s+/g, " ")).not.toContain("Off disables the gate");
      document.body.replaceChildren();
    }
  });
});
