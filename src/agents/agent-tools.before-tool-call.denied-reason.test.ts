import { describe, expect, it } from "vitest";
import { GOVERNANCE_APPROVAL_PLUGIN_ID } from "../governance/approval-origin.js";
import { deniedByUserReason } from "./agent-tools.before-tool-call.approval.js";

describe("what the agent is told when an approval is denied (T47 6i.19)", () => {
  it("names an Administrator for the governance gate and rules out permission advice", () => {
    const reason = deniedByUserReason({ pluginId: GOVERNANCE_APPROVAL_PLUGIN_ID });
    expect(reason).toContain("Denied by an Administrator");
    expect(reason).toContain("not a file-permission problem");
    expect(reason).toContain("chmod");
  });

  it("keeps the plain wording for every other plugin", () => {
    expect(deniedByUserReason({ pluginId: "some-other-plugin" })).toBe("Denied by user");
    expect(deniedByUserReason({})).toBe("Denied by user");
  });
});
