// The governance client's error, and what it says when the Gateway cannot be reached.
//
// Split out of `api.ts` because guarding its requests against a Gateway that
// is not there pushed that file past the 700-line limit the pre-commit gate
// enforces. The seam is the one T16 used throughout: move a subject out whole
// rather than suppress the rule. `api.ts` re-exports both, so every importer
// still reads them from there.

/**
 * What an operator is told when a request never reached the Gateway.
 *
 * The browser's own words for that are "Failed to fetch" or "Load failed": the
 * mechanism rather than the situation, and nothing about what to do. This is the
 * page read during an incident, which is when the Gateway is likeliest to be the
 * thing that went away.
 */
export const GOVERNANCE_UNREACHABLE_MESSAGE =
  "Could not reach the Gateway. Check that it is running, then try again.";

/**
 * What replaces that message once every panel has reloaded.
 *
 * Every "could not reach" error on the page comes from something the operator
 * pressed. Clearing it when the Gateway came back erased the only sign that the
 * press may never have landed: a lockdown sent during a restart left no notice and
 * no error. By then "unreachable" is false, and "it failed" may be too if the
 * connection dropped after the Gateway acted, so it says exactly what is known.
 */
export const GOVERNANCE_RECONNECTED_MESSAGE =
  "The Gateway is reachable again, but it could not be reached when you last pressed a button, so that action may not have taken effect. Check the page, and try again if it did not.";

export class GovernanceApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    /**
     * Whether the call that failed was itself an attempt to authenticate (T61).
     *
     * **A 401 means two different things and the page could not tell them
     * apart.** Everywhere else on this API it means *the session you had has
     * gone* — expired, revoked, or signed out in another tab — and the right
     * response is to clear the screen so nobody acts on stale data. On `login`
     * and `bootstrap-root` it means *those credentials are wrong*, and there was
     * no session to lose. `isSessionLost` matched on the status alone, so
     * mistyping a password produced **"Your session ended, so the page was
     * cleared rather than left showing out-of-date information."** — telling the
     * operator to do the thing they were already doing, and never showing them
     * the server's own answer, which is the plain "Invalid credentials".
     *
     * Carried on the error rather than inferred from the path, because a path
     * test here would be a second copy of a rule that lives in the two methods
     * below — the shape this project keeps finding on the wrong side of a
     * defect. It is set where the error is constructed, from what the caller
     * declared it was doing.
     *
     * It is also mildly security-relevant in the reporting direction: an
     * operator told "your session ended" may reasonably conclude the system
     * logged them out rather than that they mistyped, which is the wrong mental
     * model to carry into an incident.
     */
    readonly authenticating = false,
  ) {
    super(message);
    this.name = "GovernanceApiError";
  }
}
