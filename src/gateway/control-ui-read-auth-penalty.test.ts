// Finding 406: a valid paired-device token must not pay the shared-secret
// failure penalty on Control UI read routes.
//
// The Control UI sends its paired-device token as the Bearer credential
// (`resolveControlUiAuthToken` prefers it over the shared token).
// `authorizeControlUiReadRequest` tried that token as the shared secret first,
// and a shared-secret mismatch from loopback sleeps 250 ms doubling to 5 s
// (`recordFailureAndDelay`) before the device-token check accepted it. The
// governance dashboard makes about twelve such reads every refresh, so the
// penalty never decayed: measured live on 2026-10-07, every dashboard request
// took a constant ~5,030 ms inside the Gateway, and every press 10 to 20 s.
import fs from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { approveDevicePairing, requestDevicePairing } from "../infra/device-pairing.js";
import { withEnvAsync } from "../test-utils/env.js";
import {
  AUTH_RATE_LIMIT_SCOPE_DEVICE_TOKEN,
  AUTH_RATE_LIMIT_SCOPE_SHARED_SECRET,
  createAuthRateLimiter,
} from "./auth-rate-limit.js";
import type { ResolvedGatewayAuth } from "./auth.js";
import { authorizeControlUiReadRequest } from "./control-ui.js";
import { makeMockHttpResponse } from "./test-http-response.js";

const AUTH: ResolvedGatewayAuth = { mode: "token", token: "shared-token", allowTailscale: false };

function readRequest(bearer: string): IncomingMessage {
  return {
    url: "/control-ui/governance/system",
    method: "GET",
    headers: { authorization: `Bearer ${bearer}` },
    headersDistinct: { authorization: [`Bearer ${bearer}`] },
    socket: { remoteAddress: "127.0.0.1" },
  } as unknown as IncomingMessage;
}

async function withPairedOperatorDeviceToken<T>(fn: (token: string) => Promise<T>): Promise<T> {
  const tempHome = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-ui-read-penalty-"));
  try {
    return await withEnvAsync({ OPENCLAW_HOME: tempHome }, async () => {
      const requested = await requestDevicePairing({
        deviceId: "control-ui-device",
        publicKey: "test-public-key",
        role: "operator",
        scopes: ["operator.read"],
      });
      const approved = await approveDevicePairing(requested.request.requestId, {
        callerScopes: ["operator.read"],
      });
      const token =
        approved?.status === "approved" ? approved.device.tokens?.operator?.token : undefined;
      expect(typeof token).toBe("string");
      return await fn(token ?? "");
    });
  } finally {
    await fs.rm(tempHome, { recursive: true, force: true });
  }
}

describe("authorizeControlUiReadRequest and the loopback failure penalty", () => {
  it("accepts a paired device token without recording a failure or sleeping", async () => {
    await withPairedOperatorDeviceToken(async (deviceToken) => {
      const rateLimiter = createAuthRateLimiter();
      const delay = vi.spyOn(rateLimiter, "recordFailureAndDelay");
      const failure = vi.spyOn(rateLimiter, "recordFailure");
      try {
        for (let i = 0; i < 4; i++) {
          const { res } = makeMockHttpResponse();
          const ok = await authorizeControlUiReadRequest(
            readRequest(deviceToken),
            res as unknown as ServerResponse,
            { auth: AUTH, rateLimiter },
          );
          expect(ok).toBe(true);
        }
        expect(delay).not.toHaveBeenCalled();
        expect(failure).not.toHaveBeenCalled();
      } finally {
        rateLimiter.dispose();
      }
    });
  });

  it("still penalises a token that is neither the shared secret nor a device token", async () => {
    await withPairedOperatorDeviceToken(async () => {
      const rateLimiter = createAuthRateLimiter();
      // Resolve at once so the test does not wait out the real penalty.
      const delay = vi.spyOn(rateLimiter, "recordFailureAndDelay").mockResolvedValue(undefined);
      try {
        const { res } = makeMockHttpResponse();
        const ok = await authorizeControlUiReadRequest(
          readRequest("not-a-valid-token"),
          res as unknown as ServerResponse,
          { auth: AUTH, rateLimiter },
        );
        expect(ok).toBe(false);
        expect(delay).toHaveBeenCalledWith("127.0.0.1", AUTH_RATE_LIMIT_SCOPE_SHARED_SECRET);
        expect(delay).toHaveBeenCalledWith("127.0.0.1", AUTH_RATE_LIMIT_SCOPE_DEVICE_TOKEN);
      } finally {
        rateLimiter.dispose();
      }
    });
  });

  // Lockout is per scope: a device token is refused while the device-token
  // scope is locked, whatever the shared-secret scope says.
  it("still refuses a device token while the device-token scope is locked out", async () => {
    await withPairedOperatorDeviceToken(async (deviceToken) => {
      const rateLimiter = createAuthRateLimiter({ exemptLoopback: false, maxAttempts: 1 });
      try {
        rateLimiter.recordFailure("127.0.0.1", AUTH_RATE_LIMIT_SCOPE_DEVICE_TOKEN);
        const { res } = makeMockHttpResponse();
        const ok = await authorizeControlUiReadRequest(
          readRequest(deviceToken),
          res as unknown as ServerResponse,
          { auth: AUTH, rateLimiter },
        );
        expect(ok).toBe(false);
      } finally {
        rateLimiter.dispose();
      }
    });
  });
});
