// Atomic load/save for the governance policy document. Core-owned version of
// what started as extensions/governance/src/policy-store.ts before this
// project moved from a plugin to a direct fork (this file now uses core's
// own JSON helpers, ../infra/json-files.js, instead of the plugin SDK facade
// that wrapped them).
import { mkdir } from "node:fs/promises";
import { readJsonIfExists, writeJsonAtomic } from "../infra/json-files.js";
import { withFileLock } from "./file-lock.js";
import { governanceHomeDir, policyFilePath } from "./paths.js";
import {
  defaultPolicyDocument,
  pruneExpiredRules,
  type PolicyDocument,
  type PolicyRule,
} from "./policy-types.js";

async function ensureHomeDir(): Promise<void> {
  await mkdir(governanceHomeDir(), { recursive: true, mode: 0o700 });
}

/**
 * Coerces one loaded field to the shape the rest of the code assumes.
 *
 * The merge below is shallow, so a field present but of the wrong type
 * (hand-edited file, truncated write, older format) survives it and then throws
 * somewhere far away — `doc.rules.filter is not a function` inside the policy
 * engine. Because the tool-call hook treats a governance throw as a block, that
 * turns one malformed field into "every tool call fails", with a stack trace
 * that points nowhere useful. Falling back to the safe default keeps the gate
 * closed in the way it is meant to be closed: default-deny, not broken.
 */
function coerce<T>(value: unknown, isValid: (candidate: unknown) => boolean, fallback: T): T {
  return isValid(value) ? (value as T) : fallback;
}

export async function loadPolicy(): Promise<PolicyDocument> {
  await ensureHomeDir();
  const existing = await readJsonIfExists<PolicyDocument>(policyFilePath());
  const defaults = defaultPolicyDocument();
  if (!existing || typeof existing !== "object") {
    return defaults;
  }
  // Defensive merge against a policy.json written by an older version of this
  // file that predates a given field, or corrupted since.
  const merged = { ...defaults, ...existing };
  return {
    ...merged,
    mode: coerce(
      merged.mode,
      (v) => v === "enforce" || v === "monitor" || v === "off",
      defaults.mode,
    ),
    ask: coerce(merged.ask, (v) => v === "off" || v === "on-miss", defaults.ask),
    rules: coerce(merged.rules, Array.isArray, defaults.rules).filter(
      (rule) => typeof rule?.pattern === "string" && typeof rule?.resourceKind === "string",
    ),
    lockedAgents: coerce(merged.lockedAgents, Array.isArray, defaults.lockedAgents).filter(
      (id) => typeof id === "string",
    ),
    agentAsk: coerce(
      merged.agentAsk,
      (v) => typeof v === "object" && v !== null && !Array.isArray(v),
      defaults.agentAsk,
    ),
    hitlTimeoutSeconds: coerce(
      merged.hitlTimeoutSeconds,
      (v) => typeof v === "number" && Number.isFinite(v) && v > 0,
      defaults.hitlTimeoutSeconds,
    ),
  };
}

export async function savePolicy(doc: PolicyDocument): Promise<void> {
  await ensureHomeDir();
  await writeJsonAtomic(policyFilePath(), doc, { mode: 0o600 });
}

/**
 * Read-modify-write under a cross-process lock. The governance CLI and the
 * Gateway are separate processes that both edit this document, so an
 * in-process mutex alone would still lose updates (e.g. a rule added from the
 * CLI vanishing because the Gateway wrote a stale copy back).
 */
export async function updatePolicy(
  mutate: (doc: PolicyDocument) => PolicyDocument | void,
): Promise<PolicyDocument> {
  await ensureHomeDir();
  return withFileLock(policyFilePath(), async () => {
    const current = await loadPolicy();
    const next = mutate(current) ?? current;
    await savePolicy(next);
    return next;
  });
}

/**
 * Prunes long-expired rules. Called when rules are added so the document does
 * not accumulate dead entries indefinitely, without needing a background job.
 */
export async function pruneExpiredPolicyRules(): Promise<number> {
  let removed = 0;
  await updatePolicy((doc) => {
    const before = doc.rules.length;
    doc.rules = pruneExpiredRules(doc.rules, Date.now());
    removed = before - doc.rules.length;
  });
  return removed;
}

export async function addRule(
  rule: Omit<PolicyRule, "id" | "createdAt"> & { id?: string },
): Promise<PolicyRule> {
  // Spread first, then the generated fields. The other order let a caller
  // passing an explicit `id: undefined` overwrite the generated id with
  // undefined, producing a rule that could never be removed by id.
  const full: PolicyRule = {
    ...rule,
    id: rule.id ?? `${rule.resourceKind}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: new Date().toISOString(),
  };
  await updatePolicy((doc) => {
    // Opportunistic cleanup: piggy-backing on a write the operator already
    // triggered avoids a scheduler, and keeps the document from growing
    // without bound as short-lived grants come and go.
    doc.rules = pruneExpiredRules(doc.rules, Date.now());
    doc.rules.push(full);
  });
  return full;
}

export async function removeRule(ruleId: string): Promise<boolean> {
  let removed = false;
  await updatePolicy((doc) => {
    const before = doc.rules.length;
    doc.rules = doc.rules.filter((r) => r.id !== ruleId);
    removed = doc.rules.length < before;
  });
  return removed;
}

export async function setMode(mode: PolicyDocument["mode"]): Promise<void> {
  await updatePolicy((doc) => {
    doc.mode = mode;
  });
}

/**
 * Sets or clears an agent's HITL override. Passing `undefined` removes the
 * override so the agent falls back to the installation default, which is
 * different from pinning it to the same value: a later change to the default
 * should follow for agents that never opted out.
 */
export async function setAgentAskMode(
  agentId: string,
  ask: PolicyDocument["ask"] | undefined,
): Promise<void> {
  await updatePolicy((doc) => {
    if (ask === undefined) {
      delete doc.agentAsk[agentId];
      return;
    }
    doc.agentAsk[agentId] = ask;
  });
}

export async function lockAgent(agentId: string): Promise<void> {
  await updatePolicy((doc) => {
    if (!doc.lockedAgents.includes(agentId)) {
      doc.lockedAgents.push(agentId);
    }
  });
}

export async function unlockAgent(agentId: string): Promise<void> {
  await updatePolicy((doc) => {
    doc.lockedAgents = doc.lockedAgents.filter((id) => id !== agentId);
  });
}
