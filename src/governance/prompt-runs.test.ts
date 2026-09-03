// Q-90: a prompt that could not be stopped, timed out, or counted.
//
// `POST agent/prompt` held the request open for a whole agent run with no
// timeout, no cancellation and no concurrency limit. The third is the one with
// teeth: unbounded concurrency is a denial of service available to the lowest
// tier that can act at all, and availability of the *control plane* is what an
// operator needs most at the moment it is under strain.
//
// These tests drive the registry directly. The prompting path's use of it is
// covered in `agent-conversation.test.ts`; here the properties are the bounds
// themselves and who is allowed past them.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  beginPromptRun,
  cancelPromptRun,
  finishPromptRun,
  listPromptRuns,
  MAX_CONCURRENT_PROMPTS,
  MAX_CONCURRENT_PROMPTS_PER_ACCOUNT,
  PromptCapacityError,
  resetPromptRunsForTests,
} from "./prompt-runs.js";

beforeEach(() => {
  resetPromptRunsForTests();
});

afterEach(() => {
  resetPromptRunsForTests();
});

let counter = 0;
function start(username: string, agentId = "agent-a") {
  counter += 1;
  const runId = `gov-run-${counter}`;
  const controller = beginPromptRun({ runId, agentId, username });
  return { runId, controller };
}

describe("concurrency is bounded per account and per installation", () => {
  it("refuses an account its third simultaneous prompt", () => {
    for (let i = 0; i < MAX_CONCURRENT_PROMPTS_PER_ACCOUNT; i += 1) {
      start("malek");
    }
    expect(() => start("malek")).toThrow(PromptCapacityError);
    try {
      start("malek");
    } catch (err) {
      expect((err as PromptCapacityError).scope).toBe("account");
    }
  });

  it("does not let one account exhaust the installation for everybody else", () => {
    // The security argument for having a per-account cap at all. Without it a
    // single User could hold every slot and lock out Root. A resource limit
    // inverted into a privilege inversion, where the least privileged tier
    // decides whether the most privileged one may act.
    for (let i = 0; i < MAX_CONCURRENT_PROMPTS_PER_ACCOUNT; i += 1) {
      start("malek");
    }
    expect(() => start("root")).not.toThrow();
  });

  it("still bounds the installation once enough accounts are busy", () => {
    const accounts = Math.ceil(MAX_CONCURRENT_PROMPTS / MAX_CONCURRENT_PROMPTS_PER_ACCOUNT);
    for (let a = 0; a < accounts; a += 1) {
      for (let i = 0; i < MAX_CONCURRENT_PROMPTS_PER_ACCOUNT; i += 1) {
        try {
          start(`account-${a}`);
        } catch {
          // The installation filled before this account's own allowance did.
        }
      }
    }
    expect(
      listPromptRuns({ username: "x", includeOthers: true, groupAgentIds: ["agent-a"] }),
    ).toHaveLength(MAX_CONCURRENT_PROMPTS);
    try {
      start("late-arrival");
      throw new Error("expected the installation cap to refuse this");
    } catch (err) {
      expect(err).toBeInstanceOf(PromptCapacityError);
      expect((err as PromptCapacityError).scope).toBe("installation");
    }
  });

  it("frees the slot when the run finishes", () => {
    const first = start("malek");
    start("malek");
    expect(() => start("malek")).toThrow(PromptCapacityError);
    finishPromptRun(first.runId);
    expect(() => start("malek")).not.toThrow();
  });

  it("does not free the slot merely because the run was cancelled", () => {
    // The abort asks the run to stop; the slot is released when it actually
    // unwinds. Releasing on the request would make the caps bound *requests*
    // rather than work, so an account could cancel-and-resend in a loop and
    // keep an unbounded number of runs alive on the way out. Same distinction
    // the kill switch draws between asking a run to stop and seeing it stop.
    const first = start("malek");
    start("malek");
    expect(
      cancelPromptRun({
        runId: first.runId,
        username: "malek",
        mayCancelOthers: false,
        groupAgentIds: ["agent-a"],
      }),
    ).toMatchObject({ cancelled: true });
    expect(() => start("malek")).toThrow(PromptCapacityError);
    finishPromptRun(first.runId);
    expect(() => start("malek")).not.toThrow();
  });
});

describe("cancellation is owned by the account that asked", () => {
  it("aborts the run it names", () => {
    const { runId, controller } = start("malek");
    expect(controller.signal.aborted).toBe(false);
    expect(
      cancelPromptRun({
        runId,
        username: "malek",
        mayCancelOthers: false,
        groupAgentIds: ["agent-a"],
      }),
    ).toEqual({
      cancelled: true,
      agentId: "agent-a",
    });
    expect(controller.signal.aborted).toBe(true);
  });

  it("refuses another account's run", () => {
    const { runId, controller } = start("malek");
    expect(
      cancelPromptRun({
        runId,
        username: "kinan",
        mayCancelOthers: false,
        groupAgentIds: ["agent-a"],
      }),
    ).toMatchObject({
      cancelled: false,
      reason: "forbidden",
    });
    expect(controller.signal.aborted).toBe(false);
  });

  it("lets an operator tier stop anybody's run", () => {
    // §1.6 gives Administrator and Root real-time control over agent sessions,
    // and a runaway prompt is exactly that. The HTTP layer still applies agent
    // scope on top, so an Administrator cannot reach an agent outsideit.
    const { runId, controller } = start("malek");
    expect(
      cancelPromptRun({
        runId,
        username: "root",
        mayCancelOthers: true,
        groupAgentIds: ["agent-a"],
      }),
    ).toMatchObject({
      cancelled: true,
    });
    expect(controller.signal.aborted).toBe(true);
  });

  it("says plainly when there is no such run", () => {
    // Round 13 found the kill switch returning 200 for a mistyped agent id. A
    // cancel control that always reports success is the same defect, and it
    // teaches an operator that the button means nothing.
    expect(
      cancelPromptRun({
        runId: "gov-nope",
        username: "malek",
        mayCancelOthers: true,
        groupAgentIds: ["agent-a"],
      }),
    ).toEqual({ cancelled: false, reason: "not-found" });
  });

  it("reports the second cancel of one run as nothing to do", () => {
    const { runId } = start("malek");
    expect(
      cancelPromptRun({
        runId,
        username: "malek",
        mayCancelOthers: false,
        groupAgentIds: ["agent-a"],
      }),
    ).toMatchObject({
      cancelled: true,
    });
    expect(
      cancelPromptRun({
        runId,
        username: "malek",
        mayCancelOthers: false,
        groupAgentIds: ["agent-a"],
      }),
    ).toMatchObject({
      cancelled: false,
    });
  });
});

describe("a disconnected client stops its own run", () => {
  it("aborts when the caller's signal aborts", () => {
    // Closing the browser tab used to leave the agent working with no way to
    // reach it short of the kill switch, which locks the agent down entirely.
    const parent = new AbortController();
    counter += 1;
    const controller = beginPromptRun({
      runId: `gov-run-${counter}`,
      agentId: "agent-a",
      username: "malek",
      parentSignal: parent.signal,
    });
    parent.abort();
    expect(controller.signal.aborted).toBe(true);
  });

  it("handles a signal that was already aborted before the run began", () => {
    const parent = new AbortController();
    parent.abort();
    counter += 1;
    const controller = beginPromptRun({
      runId: `gov-run-${counter}`,
      agentId: "agent-a",
      username: "malek",
      parentSignal: parent.signal,
    });
    expect(controller.signal.aborted).toBe(true);
  });
});

describe("what an account may see", () => {
  it("shows an account only its own runs", () => {
    start("malek");
    start("kinan");
    const mine = listPromptRuns({
      username: "malek",
      includeOthers: false,
      groupAgentIds: ["agent-a"],
    });
    expect(mine).toHaveLength(1);
    expect(mine[0]?.username).toBe("malek");
  });

  it("shows an operator tier every run", () => {
    start("malek");
    start("kinan");
    expect(
      listPromptRuns({ username: "root", includeOthers: true, groupAgentIds: ["agent-a"] }),
    ).toHaveLength(2);
  });
});

describe("the organisation boundary (finding 235)", () => {
  // This table is module-level and therefore installation-wide: every run on
  // the host, of every organisation. Before the fix the only scope its two
  // readers applied was `canManageAgent`, and `hasUnlimitedAgentScope` makes
  // that unconditionally true for an Administrator or Root, so the filter that
  // looked like the boundary was a no-op at precisely the tier that can see
  // other people's runs.
  //
  // That is finding 139 exactly, on a second registry. `listActiveSessions`
  // carries the same sentence about the Gateway's run registry and closed it by
  // making the roster a **required** parameter, "so no call site could keep the
  // defect by omission". These pin the same property here.
  it("omits a run whose agent belongs to another organisation", () => {
    start("malek", "agent-mine");
    start("kinan", "agent-theirs");

    const seen = listPromptRuns({
      username: "root",
      // The operator tier, which is the one the old filter never narrowed.
      includeOthers: true,
      groupAgentIds: ["agent-mine"],
    });

    expect(seen.map((run) => run.agentId)).toEqual(["agent-mine"]);
  });

  it("refuses to cancel a run whose agent belongs to another organisation", () => {
    const { runId, controller } = start("kinan", "agent-theirs");

    const outcome = cancelPromptRun({
      runId,
      username: "root",
      mayCancelOthers: true,
      groupAgentIds: ["agent-mine"],
    });

    // Asserted as one object rather than field by field, which is both the
    // style the tests above use and the only form that typechecks: `cancelled`
    // discriminates the union, so `outcome.reason` is not a property of the
    // success arm and `expect(...).toBe(false)` does not narrow it.
    //
    // "not-found", not "forbidden". A run in another organisation must not be
    // distinguishable from one that never existed, or a run id becomes an
    // existence oracle across the boundary. The distinction the ownership
    // refusal above it deliberately does draw, because there both parties are
    // inside the same organisation.
    expect(outcome).toMatchObject({ cancelled: false, reason: "not-found" });
    expect(controller.signal.aborted).toBe(false);
  });

  it("still cancels a run inside the caller's own organisation", () => {
    // The positive control: a guard that refuses everything passes both tests
    // above and breaks the feature.
    const { runId, controller } = start("kinan", "agent-mine");

    const outcome = cancelPromptRun({
      runId,
      username: "root",
      mayCancelOthers: true,
      groupAgentIds: ["agent-mine"],
    });

    expect(outcome.cancelled).toBe(true);
    expect(controller.signal.aborted).toBe(true);
  });
});
