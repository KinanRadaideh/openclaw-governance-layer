/* @vitest-environment jsdom */

// What the Identity section tells a Viewer it can read, against what the route serves
// (finding 378, the live QA of 2026-09-19). `GET rule-requests` gives a Viewer the requests
// for the agents assigned to it and those binding every agent, unmasked (decision C2). The
// sentence said "the rule requests queue in full", and a Viewer with no agents found an empty
// queue while it held three requests.
import { render } from "lit";
import { beforeEach, describe, expect, it } from "vitest";
import { i18n } from "../../i18n/index.ts";
import { enGovernance } from "../../i18n/locales/en-governance.ts";
import type { GovernanceApi, GovernanceIdentity } from "./api.ts";
import { renderIdentityRow } from "./panels/session-panels.ts";

function capabilityText(identity: GovernanceIdentity): string {
  const container = document.createElement("div");
  render(
    renderIdentityRow({
      identity,
      busy: false,
      onSignOut: () => {},
      api: () => ({}) as GovernanceApi,
      run: async () => {},
      confirmThen: async () => {},
    }),
    container,
  );
  return (container.textContent ?? "").replace(/\s+/g, " ");
}

beforeEach(() => {
  i18n.registerLocaleStrings("en", enGovernance);
});

describe("the Viewer's Identity sentence", () => {
  it("promises the rule requests the route serves, not the whole queue", () => {
    const text = capabilityText({ username: "view1", role: "viewer", assignedAgents: [] });

    expect(text).not.toContain("queue in full");
    expect(text).toContain("rule requests for those agents and for rules binding every agent");
    expect(text).toContain("unmasked");
  });

  it("still says where masking applies", () => {
    const text = capabilityText({ username: "view1", role: "viewer", assignedAgents: ["scout"] });

    expect(text).toContain("with resource details masked there");
  });
});
