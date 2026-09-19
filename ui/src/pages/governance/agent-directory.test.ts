// The agents a request may name (finding 379, the live QA of 2026-09-19). The Rule requests
// section listed every agent the page had heard of, OpenClaw's unregistered ones included,
// and a setting request for one could never be approved.
import { describe, expect, it } from "vitest";
import { registeredAgentIds } from "./agent-directory.ts";

describe("registeredAgentIds", () => {
  it("keeps the agents governance has registered and drops the host's unregistered ones", () => {
    expect(
      registeredAgentIds([
        { agentId: "main", registered: false },
        { agentId: "scout", displayName: "Scout Bot", registered: true },
        { agentId: "alpha", registered: true },
      ]),
    ).toEqual(["alpha", "scout"]);
  });
});
