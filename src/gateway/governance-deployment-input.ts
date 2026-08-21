import { resolveGatewayPort } from "../config/paths.js";
// The seam between the Gateway's configuration and the governance layer's
// deployment report (backlog item A7).
//
// **This file exists to be the only one that needs to.** `src/governance/`
// imports from `node:*`, `../infra/`, `../agents/`, `../sessions/`,
// `../routing/` and `../logging/` — and from nothing else. That invariant is
// deliberate: `agent-runner.ts` and `agent-terminator.ts` both use a
// registration seam because the governance layer is exercised by the CLI and by
// unit tests with no Gateway running.
//
// `readDeploymentStatus` needs facts that live above that line — the resolved
// bind mode, the port, the gateway auth mode, and the findings from
// `collectGatewayConfigFindings` (which itself imports `./auth-resolve.js`).
// Rather than let governance reach up for them, this module reaches down and
// hands over plain data. Governance stays a pure function of its inputs; this
// file is the single place where a careless import would break the layering,
// which makes it the single place to look.
//
// **Secrets stop here.** `resolveGatewayAuth` returns the plaintext token and
// password on the same object as the mode. Only the mode and a presence boolean
// leave this function. Root is the governance owner, which is not the same thing
// as a licence to print the host's credentials into an HTTP response.
import type { OpenClawConfig } from "../config/types.js";
import type {
  DeploymentEnvironmentInput,
  GatewayAuthMode,
} from "../governance/deployment-status.js";
import { collectGatewayConfigFindings } from "../security/audit-gateway-config.js";
import { resolveGatewayAuth } from "./auth-resolve.js";

/**
 * True for a trusted-proxy entry that is not strictly loopback.
 *
 * A loopback proxy entry is the ordinary local reverse-proxy case and does not
 * create a route in from another host; anything else does.
 */
function hasNonLoopbackTrustedProxy(entries: readonly unknown[]): boolean {
  return entries.some((entry) => {
    if (typeof entry !== "string") {
      return true;
    }
    const value = entry.trim();
    return !(
      value === "127.0.0.1" ||
      value === "::1" ||
      value === "localhost" ||
      value.startsWith("127.")
    );
  });
}

export function resolveDeploymentEnvironmentInput(params: {
  cfg: OpenClawConfig;
  sourceConfig: OpenClawConfig;
  env?: NodeJS.ProcessEnv;
}): DeploymentEnvironmentInput {
  const { cfg, sourceConfig } = params;
  const env = params.env ?? process.env;

  // Resolved **once**, with the same expression `collectGatewayConfigFindings`
  // uses (`audit-gateway-config.ts`). Using `defaultGatewayBindMode()` here
  // instead would disagree with the audit inside a container — that helper
  // returns "auto" there — and the panel would report one bind while the folded
  // findings reasoned about another. One value, both consumers.
  const bind = typeof cfg.gateway?.bind === "string" ? cfg.gateway.bind : "loopback";
  const tailscaleMode = cfg.gateway?.tailscale?.mode ?? "off";
  const auth = resolveGatewayAuth({
    authConfig: cfg.gateway?.auth,
    tailscaleMode,
    env,
  });
  const trustedProxies = Array.isArray(cfg.gateway?.trustedProxies)
    ? cfg.gateway.trustedProxies
    : [];

  return {
    bind,
    port: resolveGatewayPort(cfg, env),
    authMode: auth.mode as GatewayAuthMode,
    // Presence, never the value.
    authSecretConfigured: Boolean(auth.token?.trim() || auth.password?.trim()),
    tailscaleMode,
    controlUiEnabled: cfg.gateway?.controlUi?.enabled !== false,
    hasNonLoopbackTrustedProxy: hasNonLoopbackTrustedProxy(trustedProxies),
    tlsEnabled: Boolean(cfg.gateway?.tls),
    gatewayFindings: collectGatewayConfigFindings(cfg, sourceConfig, env),
  };
}
