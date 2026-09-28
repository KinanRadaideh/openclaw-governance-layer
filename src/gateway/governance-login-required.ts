/**
 * The `type` of a 401 that means the governance sign-in is gone, and only that (finding
 * 396). The Gateway's own credential gate answers 401 as well, and the dashboard must tell
 * the two apart: that one means the page is not connected, not that the operator was
 * signed out.
 *
 * A module of its own because both the auth routes and the lazily loaded API routes send
 * it, and the API routes must not import the module that loads them. Mirrored in
 * `ui/src/pages/governance/api.errors.ts`, which a test pins to this value.
 */
export const GOVERNANCE_LOGIN_REQUIRED_TYPE = "governance_login_required";
