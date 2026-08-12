// HTTP surface for the governance dashboard's login/RBAC layer: this is the
// "Administrative Access -> Web Dashboard -> Role-Based Access Control"
// gate from the design doc's Figure 1.1, sitting in front of the governance
// pages served by the Control UI. It is intentionally a second, independent
// gate layered on top of the Gateway's existing shared-secret/device auth
// (src/gateway/auth.ts) — reaching these routes at all already requires
// passing that gate (see the request-stage wiring in server-http.ts) — not a
// replacement for it. Named human accounts and roles do not exist anywhere
// else in OpenClaw; this file and src/governance/* are what add them.
import type { IncomingMessage, ServerResponse } from "node:http";
import {
  checkLoginAllowed,
  loginThrottleKey,
  recordLoginFailure,
  recordLoginSuccess,
} from "../governance/login-throttle.js";
import { isGovernanceRole } from "../governance/roles.js";
import { issueSession, revokeSession, verifySession } from "../governance/session-tokens.js";
import type { GovernanceSession } from "../governance/session-tokens.js";
import {
  AccountsAlreadyExistError,
  authenticate,
  countUsers,
  createUser,
} from "../governance/user-store.js";
import type { AuthRateLimiter } from "./auth-rate-limit.js";
import type { ResolvedGatewayAuth } from "./auth.js";
import { authorizeControlUiReadRequest } from "./control-ui.js";
import { readJsonBodyOrError, sendInvalidRequest, sendJson } from "./http-common.js";

export const GOVERNANCE_AUTH_PATH_PREFIX = "/control-ui/governance/";
const SESSION_COOKIE_NAME = "oc_gov_session";
const MAX_LOGIN_BODY_BYTES = 4096;

function readCookie(req: IncomingMessage, name: string): string | undefined {
  const header = req.headers.cookie;
  if (!header) {
    return undefined;
  }
  for (const part of header.split(";")) {
    const index = part.indexOf("=");
    if (index <= 0) {
      continue;
    }
    if (part.slice(0, index).trim() === name) {
      return decodeURIComponent(part.slice(index + 1).trim());
    }
  }
  return undefined;
}

function setSessionCookie(res: ServerResponse, token: string, maxAgeSeconds: number): void {
  // No `Secure` attribute: the Gateway's HTTP listener is loopback-only by
  // default (src/gateway/control-ui.ts network binding), and access from
  // another machine is expected to go through an SSH tunnel per the design
  // doc's architecture, not app-layer TLS — so requiring HTTPS here would
  // just break the common case without adding real protection.
  res.setHeader(
    "Set-Cookie",
    `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAgeSeconds}`,
  );
}

function clearSessionCookie(res: ServerResponse): void {
  res.setHeader("Set-Cookie", `${SESSION_COOKIE_NAME}=; Path=/; HttpOnly; Max-Age=0`);
}

/** Resolves the caller's governance session from the request cookie, if any and still valid. */
export async function resolveGovernanceSession(
  req: IncomingMessage,
): Promise<GovernanceSession | undefined> {
  const token = readCookie(req, SESSION_COOKIE_NAME);
  return token ? verifySession(token) : undefined;
}

export type GovernanceAuthRouteOptions = {
  auth?: ResolvedGatewayAuth;
  trustedProxies?: string[];
  allowRealIpFallback?: boolean;
  rateLimiter?: AuthRateLimiter;
};

/**
 * Handles `/control-ui/governance/*` requests. Returns true when handled
 * (matching the GatewayHttpRequestStage contract used in server-http.ts).
 *
 * Every route here first passes through `authorizeControlUiReadRequest` —
 * the same shared-secret/device-token/SSH-tunnel gate that already protects
 * the rest of the Control UI. The dashboard login below is a *second*,
 * independent gate stacked on top of that one (named account -> role),
 * matching the design doc's layered "SSH Tunnel -> Web Dashboard -> RBAC"
 * architecture — it deliberately does not replace the existing gate.
 */
export async function handleGovernanceAuthRequest(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
  routeOptions: GovernanceAuthRouteOptions,
): Promise<boolean> {
  const authorized = await authorizeControlUiReadRequest(req, res, routeOptions);
  if (!authorized) {
    // authorizeControlUiReadRequest already wrote the 401/403 response.
    return true;
  }

  // Data + mutation routes are role-gated against the caller's named
  // governance account; the auth routes below establish that account.
  const { handleGovernanceApiRequest } = await import("./governance-dashboard-api.js");
  if (await handleGovernanceApiRequest(req, res, pathname, await resolveGovernanceSession(req))) {
    return true;
  }

  if (pathname === `${GOVERNANCE_AUTH_PATH_PREFIX}login` && req.method === "POST") {
    const body = await readJsonBodyOrError(req, res, MAX_LOGIN_BODY_BYTES);
    if (body === undefined) {
      return true;
    }
    const { username, password } = body as { username?: unknown; password?: unknown };
    if (typeof username !== "string" || typeof password !== "string" || !username || !password) {
      sendInvalidRequest(res, "username and password are required");
      return true;
    }
    // Throttle per username so guessing one account cannot be parallelised,
    // and a flood against many accounts cannot lock out a single victim.
    const throttleKey = loginThrottleKey(username);
    const throttle = checkLoginAllowed(throttleKey);
    if (!throttle.allowed) {
      if (throttle.retryAfterSeconds !== undefined) {
        res.setHeader("Retry-After", String(throttle.retryAfterSeconds));
      }
      sendJson(res, 429, {
        error: {
          message: "Too many failed login attempts. Try again later.",
          type: "rate_limited",
        },
      });
      return true;
    }
    const user = await authenticate(username, password);
    if (!user) {
      recordLoginFailure(throttleKey);
      sendJson(res, 401, { error: { message: "Invalid credentials", type: "unauthorized" } });
      return true;
    }
    recordLoginSuccess(throttleKey);
    const session = await issueSession(user);
    setSessionCookie(
      res,
      session.token,
      Math.floor((Date.parse(session.expiresAt) - Date.now()) / 1000),
    );
    sendJson(res, 200, { ok: true, username: user.username, role: user.role });
    return true;
  }

  if (pathname === `${GOVERNANCE_AUTH_PATH_PREFIX}logout` && req.method === "POST") {
    const token = readCookie(req, SESSION_COOKIE_NAME);
    if (token) {
      await revokeSession(token);
    }
    clearSessionCookie(res);
    sendJson(res, 200, { ok: true });
    return true;
  }

  if (pathname === `${GOVERNANCE_AUTH_PATH_PREFIX}whoami` && req.method === "GET") {
    const session = await resolveGovernanceSession(req);
    if (!session) {
      sendJson(res, 401, { error: { message: "Not logged in", type: "unauthorized" } });
      return true;
    }
    sendJson(res, 200, { username: session.username, role: session.role });
    return true;
  }

  // One-time bootstrap: create the first Root account. Refuses once any
  // account exists, so this cannot be used to mint a second privileged
  // account later — ordinary account creation after that point is an
  // administrator/root dashboard action (src/governance/user-store.ts
  // createUser), not this endpoint.
  if (pathname === `${GOVERNANCE_AUTH_PATH_PREFIX}bootstrap-root` && req.method === "POST") {
    // Cheap early rejection for the ordinary case. It is *not* the guard —
    // `onlyAsFirstAccount` below re-checks inside the write lock, because this
    // one cannot stop two simultaneous requests from both passing it.
    if ((await countUsers()) > 0) {
      sendJson(res, 409, {
        error: { message: "A governance account already exists", type: "already_bootstrapped" },
      });
      return true;
    }
    const body = await readJsonBodyOrError(req, res, MAX_LOGIN_BODY_BYTES);
    if (body === undefined) {
      return true;
    }
    const { username, password } = body as { username?: unknown; password?: unknown };
    if (typeof username !== "string" || typeof password !== "string" || !username || !password) {
      sendInvalidRequest(res, "username and password are required");
      return true;
    }
    // createUser enforces the password policy and username uniqueness by
    // throwing; surface that as a 400 rather than letting it escape as a 500.
    let user;
    try {
      user = await createUser({ username, password, role: "root", onlyAsFirstAccount: true });
    } catch (err) {
      if (err instanceof AccountsAlreadyExistError) {
        sendJson(res, 409, {
          error: { message: err.message, type: "already_bootstrapped" },
        });
        return true;
      }
      sendInvalidRequest(res, err instanceof Error ? err.message : "could not create account");
      return true;
    }
    const session = await issueSession(user);
    setSessionCookie(
      res,
      session.token,
      Math.floor((Date.parse(session.expiresAt) - Date.now()) / 1000),
    );
    sendJson(res, 200, { ok: true, username: user.username, role: user.role });
    return true;
  }

  return false;
}

export { isGovernanceRole };
