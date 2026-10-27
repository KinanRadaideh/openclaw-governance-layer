/* @vitest-environment jsdom */

import { render } from "lit";
// The kill notice shows both measurements in every notice that has them (2026-10-22).
//
// It used to show one number: the total when the stop was confirmed, the signal time
// when it was not, and nothing on the other branches, while Chapter 3 said the
// dashboard reports both. Asserted in the operator's words, never in markup.
import { describe, expect, it } from "vitest";
import type { GovernanceKillResult } from "./api.ts";
import { renderKillNotice } from "./panels/agent-panels.ts";
import "./governance-page.ts";

const agents = [{ agentId: "zeta", displayName: "Zeta", registered: true }];

function notice(result: Omit<GovernanceKillResult, "ok">): string {
  const host = document.createElement("div");
  render(renderKillNotice({ agentId: "zeta", result: { ok: true, ...result } }, agents), host);
  document.body.replaceChildren(host);
  return (host.textContent ?? "").replace(/\s+/g, " ");
}

describe("the kill notice's timings", () => {
  it("shows both times for a confirmed stop", () => {
    const text = notice({
      abortedRunIds: ["run-1"],
      stoppedConfirmed: true,
      dispatchMs: 3.2,
      elapsedMs: 41.5,
    });
    expect(text).toContain("Lockdown engaged");
    expect(text).toContain("stop signal sent in 3.2 ms");
    expect(text).toContain("confirmed stopped 41.5 ms after the request");
  });

  it("shows both times for an unconfirmed stop, and does not call the second one a stop", () => {
    const text = notice({
      abortedRunIds: ["run-1"],
      stoppedConfirmed: false,
      dispatchMs: 3.2,
      elapsedMs: 2010.4,
    });
    expect(text).toContain("not confirmed to have stopped");
    expect(text).toContain("stop signal sent in 3.2 ms");
    expect(text).toContain("gave up confirming 2010.4 ms after the request");
    expect(text).not.toContain("confirmed stopped");
  });

  it("shows them when nothing was running", () => {
    const text = notice({
      abortedRunIds: [],
      stoppedConfirmed: true,
      inFlightTerminationSupported: true,
      dispatchMs: 0.4,
      elapsedMs: 6.1,
    });
    expect(text).toContain("Nothing was running");
    expect(text).toContain("stop signal sent in 0.4 ms");
    expect(text).toContain("confirmed stopped 6.1 ms after the request");
  });

  it("shows them when in-flight termination is unavailable", () => {
    const text = notice({
      abortedRunIds: [],
      stoppedConfirmed: false,
      inFlightTerminationSupported: false,
      dispatchMs: 0.2,
      elapsedMs: 5,
    });
    expect(text).toContain("in-flight termination is unavailable");
    expect(text).toContain("gave up confirming 5 ms after the request");
  });

  it("shows them beside an audit failure, without claiming the agent stopped", () => {
    const text = notice({
      abortedRunIds: ["run-1"],
      stoppedConfirmed: false,
      dispatchMs: 3.2,
      elapsedMs: 2008,
      auditError: "disk full",
    });
    expect(text).toContain("could not be written to the audit ledger");
    expect(text).toContain("stop signal sent in 3.2 ms");
    expect(text).toContain("gave up confirming 2008 ms after the request");
    expect(text).not.toContain("IS stopped");
  });

  it("shows no brackets when the response carried no times", () => {
    const text = notice({ abortedRunIds: [], inFlightTerminationSupported: true });
    expect(text).not.toContain("(");
  });
});
