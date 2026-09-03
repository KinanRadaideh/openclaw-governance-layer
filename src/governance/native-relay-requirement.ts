// Whether the host must route native-harness tool calls back through the
// governance gate.
//
// ## The gap this closes (B1)
//
// OpenClaw can run an agent inside a separate helper process. The "native
// harness", used by the Codex app-server backend. That process does not call
// `runBeforeToolCallHook` itself; the host installs a *relay* hook into the
// harness's own configuration, and the harness calls back out for each tool
// call. Whether that relay is installed at all was decided by one predicate,
// `hasBeforeToolCallPolicy()`, which counts **plugin** before-tool-call
// policies and trusted tool policies.
//
// This governance layer is not a plugin. It is compiled into the fork,
// deliberately, so that no configuration file can remove it. So the predicate
// answered "nothing is installed", the relay was omitted from the harness
// configuration, and every tool call in that configuration ran without a policy
// check, without a ledger entry, and outside the reach of the kill switch.
//
// The relay layer therefore has to know about governance as a signal in its own
// right, separate from plugin policies. That is what this module supplies.
//
// ## Why this is not conditioned on the current posture
//
// The obvious refinement is to relay only when governance would actually act,
// skip it when the installation's mode is `off`. It was rejected, twice over:
//
//   1. **It is a cache, and a cache can be stale in the direction that reopens
//      the hole.** The relay configuration is written once, when a harness
//      session starts. An operator who turns governance back on from the CLI or
//      the dashboard changes `policy.json` in a different process; the running
//      session's harness config is already written, so it would stay ungoverned
//      until it ended. Governance that is on but not consulted is the exact
//      failure this module exists to remove.
//   2. **The saving is not where it looks.** `shouldRelayEvent` is consulted
//      when the harness session is configured, not per tool call, so the cost of
//      answering "yes" unconditionally is one relay hook in a config file. With
//      the posture at `off` the relay still fires per tool call, but the gate it
//      reaches returns immediately without evaluating rules or writing to the
//      ledger. The cost is a subprocess, not a policy decision.
//
// So the answer is yes for every installation. The one case that is not an
// installation is below.
import { isUnconfiguredTestRun } from "./paths.js";

/**
 * True when governance needs the host's native harness to relay tool calls.
 *
 * Yes for every installation. No for a test process that never asked for a
 * governance directory: and that exception is not a special case invented
 * here, which is the whole point of writing it this way.
 *
 * `loadPolicy` already creates the policy for such a process with `mode: "off"`
 * (see `paths.ts`, `isUnconfiguredTestRun`, and QA finding 46): OpenClaw's own
 * harness suite predates governance, drives synthetic tool calls through the
 * hook, and has no operator, no policy and no approver, so it is not an
 * installation and is not governed. Relaying for it would mean spawning relay
 * processes to reach a gate that is switched off.
 *
 * The reason this reads the *same* predicate rather than restating the
 * condition is the failure mode this project has hit more than any other: two
 * parts of the system that must agree, each correct alone, disagreeing because
 * nothing forced them to be derived from one source. If the relay requirement
 * carried its own copy of "is this a real installation?", the copy could drift
 * from the posture rule: and drift in one direction is a governed installation
 * whose harness sessions are silently ungoverned. `qa-round15.test.ts` asserts
 * the agreement directly, on a fresh policy, in both environments.
 */
export function governanceRequiresNativeToolRelay(): boolean {
  return !isUnconfiguredTestRun();
}
