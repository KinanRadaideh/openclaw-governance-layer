// T94. Requests the agent did not name: redirect hops, page navigations, a page's own requests.
//
// The gate judges the address the agent names (`web_fetch`'s `url`, a browser `navigate`). Until
// T94 everything that address led to was unjudged: a 302 to a forbidden host, a clicked link, a
// script's `fetch`. Design and decisions: `mg/T94-FOLLOW-ON-REQUESTS-DESIGN.md` (D1 to D12).
//
// ## Two halves
//
// **The scope.** `runWithinGovernedCall` wraps a governed tool's execution (the four in-process
// sites that run a tool after the gate). It carries the agent, session and tool, and the canonical
// addresses the call named, to wherever the tool's requests are made: `fetchWithSsrFGuard`'s
// redirect loop, or the browser plugin's page binding. It is a global singleton so core and the
// plugin SDK bundle share one store (the `gateway-request-scope.ts` pattern). Plugins read it
// through `openclaw/plugin-sdk/security-runtime`; they cannot set one.
//
// **The judgement.** `judgeFollowOnRequest` puts the request through `evaluateGovernancePolicy` as
// a part of the call (the T86 D2-A shape: a miss is refused, not asked), so lockdown, the
// unknown-kind refusal, deny-wins and monitor behave exactly as for a named call, and the entry
// it records says how the request was reached (`via`). A page's own request is judged by denials
// only (D1, the T7 precedent).
import { AsyncLocalStorage } from "node:async_hooks";
import { resolveGlobalSingleton } from "../shared/global-singleton.js";
import type { LedgerVia } from "./audit-ledger.js";
import { evaluateGovernancePolicy } from "./policy-engine.js";
import { extractNetworkUrl, followOnNetworkSpec, namedNetworkUrls } from "./resource-extraction.js";
import { maskUrlForRecord } from "./url-rules.js";

type GovernedCallScope = {
  readonly agentId?: string;
  readonly sessionKey?: string;
  readonly cwd?: string;
  readonly toolName: string;
  /** Canonical addresses the call named, which the gate has already judged (D3). */
  readonly named: ReadonlySet<string>;
  running: boolean;
};

/** A governed tool call, as the code making its requests sees it. */
export type GovernedNetworkCall = {
  readonly agentId?: string;
  readonly sessionKey?: string;
  readonly toolName: string;
  /** Whether `url` is an address this call named (and the gate judged), compared canonically. */
  names(url: string): boolean;
  /** Whether the call is still running. A page outlives the call that opened it. */
  isRunning(): boolean;
};

export type FollowOnVia = LedgerVia;

export type FollowOnVerdict = { allowed: true } | { allowed: false; reason: string };

const GOVERNED_CALL_SCOPE_KEY: unique symbol = Symbol.for("openclaw.governance.governedCallScope");

const governedCallScope = resolveGlobalSingleton<AsyncLocalStorage<GovernedCallScope>>(
  GOVERNED_CALL_SCOPE_KEY,
  () => new AsyncLocalStorage<GovernedCallScope>(),
);

function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
  return (
    (typeof value === "object" || typeof value === "function") &&
    value !== null &&
    "then" in value &&
    typeof value.then === "function"
  );
}

/**
 * Run a governed tool's execution inside its call scope, so the requests it leads to can be
 * judged for its agent (T94). Called only after the gate has allowed the call.
 */
export function runWithinGovernedCall<T>(
  call: {
    toolName: string;
    params: unknown;
    agentId?: string;
    sessionKey?: string;
    cwd?: string;
  },
  run: () => T,
): T {
  const params =
    typeof call.params === "object" && call.params !== null && !Array.isArray(call.params)
      ? (call.params as Record<string, unknown>)
      : {};
  const scope: GovernedCallScope = {
    ...(call.agentId ? { agentId: call.agentId } : {}),
    ...(call.sessionKey ? { sessionKey: call.sessionKey } : {}),
    ...(call.cwd ? { cwd: call.cwd } : {}),
    toolName: call.toolName,
    named: new Set(namedNetworkUrls(call.toolName, params)),
    running: true,
  };
  try {
    const result = governedCallScope.run(scope, run);
    if (isPromiseLike(result)) {
      return Promise.resolve(result).finally(() => {
        scope.running = false;
      }) as T;
    }
    scope.running = false;
    return result;
  } catch (error) {
    scope.running = false;
    throw error;
  }
}

/** The governed call whose execution is running here, if any. */
export function currentGovernedCall(): GovernedNetworkCall | undefined {
  const scope = governedCallScope.getStore();
  if (!scope) {
    return undefined;
  }
  return {
    ...(scope.agentId ? { agentId: scope.agentId } : {}),
    ...(scope.sessionKey ? { sessionKey: scope.sessionKey } : {}),
    toolName: scope.toolName,
    names: (url) => {
      const canonical = extractNetworkUrl(url);
      return canonical !== undefined && scope.named.has(canonical);
    },
    isRunning: () => scope.running,
  };
}

/** A request refused by governance; its message is the refusal the agent reads. */
export class FollowOnRequestRefusedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FollowOnRequestRefusedError";
  }
}

/**
 * The hop judge for a redirect chain that starts at `startUrl`, when the running call named that
 * address; `undefined` otherwise (no governed call here, or a request the call did not name, such
 * as a fetch provider's API address). Each hop is judged in full before it is requested (D1, D2);
 * a refusal throws `FollowOnRequestRefusedError`.
 */
export function redirectJudgeFor(
  startUrl: string,
): ((nextUrl: string) => Promise<void>) | undefined {
  const scope = governedCallScope.getStore();
  const start = extractNetworkUrl(startUrl);
  if (!scope || start === undefined || !scope.named.has(start)) {
    return undefined;
  }
  const call = {
    ...(scope.agentId ? { agentId: scope.agentId } : {}),
    ...(scope.sessionKey ? { sessionKey: scope.sessionKey } : {}),
    toolName: scope.toolName,
  };
  const cwd = scope.cwd;
  return async (nextUrl) => {
    const verdict = await judgeFollowOnRequest(call, {
      url: nextUrl,
      via: "redirect",
      ...(cwd ? { cwd } : {}),
    });
    if (!verdict.allowed) {
      throw new FollowOnRequestRefusedError(verdict.reason);
    }
  };
}

/** The schemes that reach the network (D9). Anything else contacts nothing and is not judged. */
const NETWORK_SCHEMES = new Set(["http:", "https:", "ws:", "wss:"]);

function isNetworkAddress(url: string): boolean {
  try {
    return NETWORK_SCHEMES.has(new URL(url).protocol);
  } catch {
    // An address the parser cannot read is judged, as the gate governs an unreadable value
    // rather than waving it through (`extractNetworkResource`).
    return true;
  }
}

const VIA_PHRASE: Record<FollowOnVia, string> = {
  redirect: "a redirect",
  navigation: "a page navigation the agent did not name (a link, a form, a script or a popup)",
  page: "a request the page made by itself",
};

function shownAddress(url: string): string {
  const canonical = extractNetworkUrl(url);
  return canonical ? maskUrlForRecord(canonical) : url.slice(0, 200);
}

/**
 * A refusal repeated by a polling page is recorded once (D6): same agent, session, class and
 * address within this window. It is still refused every time; only the record is not repeated.
 * Allowed answers are never remembered, so a rule removed takes effect on the next request.
 */
const REPEAT_WINDOW_MS = 30_000;
const MAX_REMEMBERED_REFUSALS = 500;
const recentRefusals = new Map<string, { reason: string; until: number }>();

function rememberRefusal(key: string, reason: string, now: number): void {
  if (recentRefusals.size >= MAX_REMEMBERED_REFUSALS) {
    const oldest = recentRefusals.keys().next().value;
    if (oldest !== undefined) {
      recentRefusals.delete(oldest);
    }
  }
  recentRefusals.set(key, { reason, until: now + REPEAT_WINDOW_MS });
}

/** Forget remembered refusals (tests). */
export function resetFollowOnRequestStateForTest(): void {
  recentRefusals.clear();
}

/**
 * Judge a request `call` led to that the agent did not name (T94).
 *
 * - `redirect` and `navigation`: in full, as the named address was; an unlisted address is
 *   refused, not asked (D2), and every decision is recorded.
 * - `page`: by denials only (D1); only a refusal is recorded.
 *
 * A failure to judge refuses (D10).
 */
export async function judgeFollowOnRequest(
  call: Pick<GovernedNetworkCall, "agentId" | "sessionKey" | "toolName">,
  request: { url: string; via: FollowOnVia; cwd?: string },
): Promise<FollowOnVerdict> {
  if (!isNetworkAddress(request.url)) {
    return { allowed: true };
  }
  const now = Date.now();
  const repeatKey =
    request.via === "page"
      ? [call.agentId ?? "", call.sessionKey ?? "", request.via, request.url].join("\u0000")
      : undefined;
  if (repeatKey) {
    const remembered = recentRefusals.get(repeatKey);
    if (remembered && remembered.until > now) {
      return { allowed: false, reason: remembered.reason };
    }
    recentRefusals.delete(repeatKey);
  }
  const address = shownAddress(request.url);
  const reached = VIA_PHRASE[request.via];
  let decision: Awaited<ReturnType<typeof evaluateGovernancePolicy>>;
  try {
    decision = await evaluateGovernancePolicy(
      { toolName: call.toolName, params: { url: request.url } },
      {
        ...(call.agentId ? { agentId: call.agentId } : {}),
        ...(call.sessionKey ? { sessionKey: call.sessionKey } : {}),
        ...(request.cwd ? { cwd: request.cwd } : {}),
      },
      {
        spec: followOnNetworkSpec(request.url),
        via: request.via,
        ...(request.via === "page" ? { denialsOnly: true } : {}),
        refuseOnMiss: (host) =>
          `governance: ${reached} to network "${host}" (${address}) is not on the allowlist ` +
          "(default-deny), so it was refused before it was sent. To reach that address, name it " +
          "in a call of its own, which can be put to a person.",
      },
    );
  } catch (error) {
    // D10: an unreadable policy or an unwritable ledger refuses, as it does for a named call.
    const detail = error instanceof Error ? error.message : String(error);
    return {
      allowed: false,
      reason:
        `governance: ${reached} to ${address} could not be judged (${detail.slice(0, 200)}), ` +
        "so it was refused.",
    };
  }
  if (decision && "block" in decision && decision.block) {
    // The engine's own reason names the rule; say how the request was reached as well.
    const reason = decision.blockReason.includes(reached)
      ? decision.blockReason
      : `${decision.blockReason} (reached by ${reached}; refused before it was sent)`;
    if (repeatKey) {
      rememberRefusal(repeatKey, reason, now);
    }
    return { allowed: false, reason };
  }
  // A part never asks (`refuseOnMiss`), so anything else is an allowance.
  return { allowed: true };
}
