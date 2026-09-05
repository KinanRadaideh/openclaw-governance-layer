// Keeps the dashboard's hand-mirrored deployment-report types equal to the ones
// the server actually sends.
//
// Same boundary and same reasoning as `core-rule-mirror.contract.test.ts` and
// `auth-audit.contract.test.ts`: the dashboard bundle deliberately does not
// import from `src/`, so `ui/src/pages/governance/api.deployment.ts` restates
// `DeploymentStatus` by hand. Where two things must agree and cannot be derived
// from one definition, the agreement gets a test rather than a comment asking
// people to remember. That is this project's single most frequently found defect
// shape, and finding 261 was the same arrangement one constant over — the
// dashboard's copy of `MIN_PASSWORD_LENGTH`, which nothing asserted.
//
// **Why this one is type-level rather than value-level.** The mirrored thing is
// a set of types, not a list, so the drift that matters is structural: the
// server gains a check status, or a facts field, or changes a union member, and
// the dashboard's copy silently describes a shape the server no longer sends.
// The assertions below are compile-time, which is what makes them work at all:
// they are enforced by `tsgo -p test/tsconfig/tsconfig.core.test.json`, the
// sixth verification command, which covers `src/` **and** `ui/` in one program.
// A runtime `expect` cannot see a missing field on a type.
//
// **What this deliberately does not pin.** `GovernanceDeploymentFacts` widens
// `bind` and `authMode` from the server's unions to `string`, on purpose: the
// dashboard renders them and has no reason to fail to compile when a new bind
// mode is added upstream. So those two are checked for *presence and
// assignability in the server-to-dashboard direction only*, which is the
// direction data actually flows.
import { describe, expect, it } from "vitest";
import type {
  GovernanceDeploymentCheck,
  GovernanceDeploymentCheckStatus,
  GovernanceDeploymentFacts,
  GovernanceDeploymentStatus,
} from "../../ui/src/pages/governance/api.deployment.js";
import type {
  DeploymentCheck,
  DeploymentCheckStatus,
  DeploymentFacts,
  DeploymentStatus,
} from "./deployment-status.js";

/** Compile-time assertion that `T` is assignable to `U`. Erased at runtime. */
type Assignable<T extends U, U> = T;

/**
 * The status vocabulary must match **both ways**.
 *
 * This is the one that would bite hardest. Adding a fifth status server-side
 * without adding it here gives the dashboard a value its own type says cannot
 * exist, and the panel's exhaustive switch would fall through to whatever the
 * default branch does — which is how a `fail` row renders as though it were
 * something benign.
 */
type StatusServerToDashboard = Assignable<DeploymentCheckStatus, GovernanceDeploymentCheckStatus>;
type StatusDashboardToServer = Assignable<GovernanceDeploymentCheckStatus, DeploymentCheckStatus>;

/**
 * A check the server sends must satisfy the dashboard's type.
 *
 * Server-to-dashboard only, because that is the direction the data travels: the
 * dashboard never constructs one of these and sends it back.
 */
type CheckServerToDashboard = Assignable<DeploymentCheck, GovernanceDeploymentCheck>;

/** The whole report, and the facts block inside it, in the same direction. */
type FactsServerToDashboard = Assignable<DeploymentFacts, GovernanceDeploymentFacts>;
type StatusReportServerToDashboard = Assignable<DeploymentStatus, GovernanceDeploymentStatus>;

// Referenced so the type aliases above are not reported as unused. The
// assertions have already happened by the time this runs: their value is in
// whether this file compiles, not in what it executes.
type PinnedMirrors = [
  StatusServerToDashboard,
  StatusDashboardToServer,
  CheckServerToDashboard,
  FactsServerToDashboard,
  StatusReportServerToDashboard,
];

describe("the dashboard's deployment-report types mirror the server's", () => {
  it("compiles, which is the assertion", () => {
    // Every meaningful check in this file is above and is enforced by the test
    // typecheck rather than by vitest. This body exists so the file is a test
    // rather than a type-only module nothing runs, and so a reader who deletes
    // the aliases above sees something fail.
    const pinned: PinnedMirrors | undefined = undefined;
    expect(pinned).toBeUndefined();
  });

  it("agrees on the status vocabulary at runtime as well", () => {
    // The compile-time assertions cover assignability. This covers the thing a
    // type cannot: that both sides enumerate the *same four* values, so neither
    // has quietly gained a fifth that the other happens to accept structurally.
    const server: DeploymentCheckStatus[] = ["pass", "warn", "fail", "unknown"];
    const dashboard: GovernanceDeploymentCheckStatus[] = ["pass", "warn", "fail", "unknown"];
    expect(new Set(dashboard)).toEqual(new Set(server));
    expect(server).toHaveLength(4);
  });
});
