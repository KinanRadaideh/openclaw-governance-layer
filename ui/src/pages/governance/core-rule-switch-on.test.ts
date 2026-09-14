/* @vitest-environment jsdom */

// A switched-off core rule is named on the Policy section, with Switch on for Root
// (finding 367). Rendered through the real settings rows, and pressed.
import { render } from "lit";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { i18n } from "../../i18n/index.ts";
import { enGovernance } from "../../i18n/locales/en-governance.ts";
import type { GovernancePolicyDocument } from "./api.ts";
import {
  renderRootPolicySettings,
  type RootPolicySettingsProps,
} from "./panels/policy-root-settings.ts";

const RULE_ID = "core-command-privilege-escalation-sudo-su-doas-runas-pkexec";

function policy(): GovernancePolicyDocument {
  return {
    version: 1,
    mode: "enforce",
    ask: "on-miss",
    agentAsk: {},
    agentMode: {},
    userAsk: {},
    hitlTimeoutSeconds: 300,
    rules: [],
    lockedAgents: [],
    disabledCoreRules: [RULE_ID],
    switchedOffCoreRules: [
      {
        id: RULE_ID,
        resourceKind: "command",
        pattern: "^(sudo|su|doas)\\b",
        description: "Privilege escalation (sudo, su, doas, runas, pkexec)",
        effect: "deny",
        tier: "core",
        createdAt: "1970-01-01T00:00:00.000Z",
      },
    ],
  } as unknown as GovernancePolicyDocument;
}

function mount(isRoot: boolean) {
  const container = document.createElement("div");
  document.body.append(container);
  const calls: Array<[string, boolean]> = [];
  let last: Promise<unknown> = Promise.resolve();
  render(
    renderRootPolicySettings({
      api: () =>
        ({
          setCoreRule: async (ruleId: string, enabled: boolean) => {
            calls.push([ruleId, enabled]);
            return { ok: true, disabledCoreRules: [] };
          },
        }) as unknown as ReturnType<RootPolicySettingsProps["api"]>,
      run: (action) => {
        last = action();
        return last.then(() => undefined);
      },
      confirmThen: async () => {},
      policy: policy(),
      isRoot,
      canAdminister: true,
      busy: false,
      users: [],
      drafts: { hitlTimeoutDraft: "", userAskUsername: "" },
      onDraft: () => {},
    }),
    container,
  );
  const text = (container.textContent ?? "").replace(/\s+/g, " ");
  const switchOn = [...container.querySelectorAll("button")].find(
    (button) => button.textContent?.trim() === "Switch on",
  );
  return { text, switchOn, calls, settled: () => last };
}

beforeEach(() => {
  i18n.registerLocaleStrings("en", enGovernance);
});

afterEach(() => {
  document.body.replaceChildren();
});

describe("a switched-off core rule on the Policy section", () => {
  it("is named, and Root can switch it back on", async () => {
    const view = mount(true);

    expect(view.text).toContain("Privilege escalation (sudo, su, doas, runas, pkexec)");
    view.switchOn?.click();
    await view.settled();

    expect(view.calls).toEqual([[RULE_ID, true]]);
  });

  it("is shown to an Administrator as switched off, with no control", () => {
    const view = mount(false);

    expect(view.text).toContain("Privilege escalation (sudo, su, doas, runas, pkexec)");
    expect(view.text).toContain("Switched off by Root");
    expect(view.switchOn).toBeUndefined();
  });
});
