// The checkId contract between the deployment report and the host's own
// security audit — the most important test in backlog item A7.
//
// `deployment-status.ts` holds `EXPECTED_ABSENT_GATEWAY_CHECKS`, a list of
// `checkId` strings transcribed by hand from
// `src/security/audit-gateway-config.ts`. Absence of a finding with one of
// those ids is reported to Root as a **pass**, which is what turns a one-way
// detector into a verification report.
//
// That creates one failure mode, and it is the worst one available to a feature
// like this: if an id is renamed upstream, the entry here stops matching, the
// finding is never looked for, and the check becomes a permanent silent green.
// A report that is confidently clean because the detector was disconnected is
// worse than no report at all — an operator would act on it.
//
// Nothing else in the design catches that. These tests do, by driving the
// **real** `collectGatewayConfigFindings` through the seam and asserting the
// ids actually fire. A rename upstream breaks a test here rather than a promise
// on somebody's dashboard.
import { describe, expect, it } from "vitest";
import type { OpenClawConfig } from "../config/types.js";
import { readDeploymentStatus } from "../governance/deployment-status.js";
import { resolveDeploymentEnvironmentInput } from "./governance-deployment-input.js";

/**
 * The organisation this report is about (M5).
 *
 * A fixed name rather than a seeded organisation: this suite exercises the
 * deployment *checks* — bind address, tunnel, origin wildcard — none of which
 * depend on an agent existing. `loadPolicy` creates the group's directory on
 * demand, so naming one is all the report needs.
 */
const TEST_GROUP = "group-deployment-input";

function configWith(gateway: Record<string, unknown>): OpenClawConfig {
  return { gateway } as unknown as OpenClawConfig;
}

async function statusFor(gateway: Record<string, unknown>, env: NodeJS.ProcessEnv = {}) {
  const cfg = configWith(gateway);
  const input = resolveDeploymentEnvironmentInput({ cfg, sourceConfig: cfg, env });
  return readDeploymentStatus(TEST_GROUP, input, {
    env,
    platform: "linux",
    totalMemoryBytes: 16 * 1000 ** 3,
    readDiskSpace: () => ({ availableBytes: 50 * 1000 ** 3, totalBytes: 100 * 1000 ** 3 }),
    statPath: async () => ({ exists: false, mode: null }),
  });
}

function statusOfCheck(
  status: Awaited<ReturnType<typeof readDeploymentStatus>>,
  id: string,
): string | undefined {
  return status.checks.find((entry) => entry.id === id)?.status;
}

describe("A7 — the ids the report expects are the ids the audit emits", () => {
  it("sees gateway.bind_no_auth fire on an exposed bind with no credential", async () => {
    const status = await statusFor({ bind: "lan" });
    expect(statusOfCheck(status, "gateway.bind_no_auth")).toBe("fail");
  });

  it("reports the same id as a pass when the audit is silent about it", async () => {
    // The other half of the contract. If this said `undefined` instead of
    // "pass", the expectation list and the audit would have drifted apart in
    // the direction that hides problems.
    const status = await statusFor({ bind: "loopback", auth: { token: "a".repeat(40) } });
    expect(statusOfCheck(status, "gateway.bind_no_auth")).toBe("pass");
  });

  it("sees the control-UI origin wildcard check fire", async () => {
    const status = await statusFor({
      bind: "lan",
      auth: { token: "a".repeat(40) },
      controlUi: { enabled: true, allowedOrigins: ["*"] },
    });
    expect(statusOfCheck(status, "gateway.control_ui.allowed_origins_wildcard")).not.toBe("pass");
  });

  it("sees the real-IP fallback check fire", async () => {
    const status = await statusFor({
      bind: "lan",
      auth: { token: "a".repeat(40) },
      allowRealIpFallback: true,
    });
    expect(statusOfCheck(status, "gateway.real_ip_fallback_enabled")).not.toBe("pass");
  });

  it("still reports every expected id, whatever the audit said", async () => {
    // Guards the transcription as a whole rather than one id at a time: each
    // expected check must appear in the output under *some* status. An id that
    // silently vanished would fail here even if no individual test covered it.
    const status = await statusFor({ bind: "loopback", auth: { token: "a".repeat(40) } });
    for (const id of [
      "gateway.bind_no_auth",
      "gateway.loopback_no_auth",
      "gateway.control_ui.allowed_origins_wildcard",
      "gateway.control_ui.host_header_origin_fallback",
      "gateway.real_ip_fallback_enabled",
      "gateway.tailscale_funnel",
      "gateway.token_too_short",
    ]) {
      expect(statusOfCheck(status, id), id).toBeDefined();
    }
  });
});

describe("A7 — the seam does not carry secrets across", () => {
  /**
   * `resolveGatewayAuth` returns the plaintext token and password on the same
   * object as the mode, and this seam is one careless spread away from putting
   * them into an HTTP response. Root is the governance owner, which is not the
   * same thing as a licence to print the host's credentials.
   */
  it("reports the auth mode and never the credential", async () => {
    const token = "super-secret-token-value-that-must-not-appear";
    const cfg = configWith({ bind: "loopback", auth: { token } });
    const input = resolveDeploymentEnvironmentInput({ cfg, sourceConfig: cfg, env: {} });

    expect(JSON.stringify(input)).not.toContain(token);
    expect(input.authSecretConfigured).toBe(true);
    expect(input.authMode).toBe("token");

    const status = await statusFor({ bind: "loopback", auth: { token } });
    expect(JSON.stringify(status)).not.toContain(token);
  });
});

describe("A7 — one bind value, both consumers", () => {
  /**
   * The audit resolves `bind` as
   * `typeof cfg.gateway?.bind === "string" ? cfg.gateway.bind : "loopback"`.
   * The seam uses the identical expression rather than `defaultGatewayBindMode()`,
   * which returns "auto" inside a container — if the two disagreed, the panel
   * would report one bind mode while the folded findings reasoned about another,
   * and both would look right in isolation.
   */
  it("reports the same bind the audit reasoned about", async () => {
    const cfg = configWith({ bind: "lan" });
    const input = resolveDeploymentEnvironmentInput({ cfg, sourceConfig: cfg, env: {} });
    expect(input.bind).toBe("lan");
    // And the audit agreed, which is why a bind_no_auth finding exists at all.
    expect(input.gatewayFindings.some((f) => f.checkId === "gateway.bind_no_auth")).toBe(true);
  });

  it("defaults an unset bind to loopback, as the audit does", async () => {
    const cfg = configWith({});
    expect(resolveDeploymentEnvironmentInput({ cfg, sourceConfig: cfg, env: {} }).bind).toBe(
      "loopback",
    );
  });
});
