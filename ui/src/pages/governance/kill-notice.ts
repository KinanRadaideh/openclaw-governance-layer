import { includesAgentId } from "./agent-directory.ts";
import type { GovernanceKillResult, GovernancePolicyDocument } from "./api.ts";

/**
 * The emergency stop's outcome, and which agent it was about.
 *
 * Its own module for the reason `refusal-focus.ts` is: the page holds state and
 * effects, and these rules took it over the 700-line limit T16 set.
 */
export type KillNotice = { agentId: string; result: GovernanceKillResult };

/**
 * The notice a refresh leaves standing.
 *
 * A stop notice reports a lockdown in force. Once its agent is released, here or
 * by another operator, the notice is history rather than status and the refresh
 * retires it. It had stayed on screen after Release, saying "Lockdown engaged"
 * about an agent that was running again.
 *
 * **Only the notice the refresh started with.** A stop that lands while a
 * refresh is in the air is newer than the policy that refresh is reading, which
 * still shows the agent unlocked, and retiring it would erase the outcome of the
 * stop the operator just pressed.
 */
export function keptKillNotice(
  current: KillNotice | null,
  atRefreshStart: KillNotice | null,
  policy: GovernancePolicyDocument,
): KillNotice | null {
  if (current === null || current !== atRefreshStart) {
    return current;
  }
  return includesAgentId(policy.lockedAgents ?? [], current.agentId) ? current : null;
}

/**
 * Brings the stop's outcome into view once it has rendered.
 *
 * The notice band is at the top of the page and the controls that stop an agent
 * are thousands of pixels below it: an outcome off-screen is one the operator
 * never reads.
 */
export async function revealKillNotice(
  host: HTMLElement & { updateComplete: Promise<unknown> },
): Promise<void> {
  await host.updateComplete;
  const notice = host.querySelector("#governance-kill-notice");
  // Guarded: jsdom has no scrollIntoView (see scrollRefusalIntoView).
  if (typeof notice?.scrollIntoView === "function") {
    notice.scrollIntoView({ block: "nearest" });
  }
}
