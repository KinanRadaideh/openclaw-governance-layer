// The Root-tier deployment report's shapes (backlog item A7).
//
// Split out of `api.ts` for the reason `api.policy-writes.ts` records: adding
// the per-agent escalation timeout method pushed that file past the 700-line
// limit the lint gate enforces, and T16's answer to that limit is to move a
// subject out whole rather than suppress the rule. **Types before behaviour**,
// again: the client methods stay with their siblings so there is still one
// place to look for "what can this dashboard call".
//
// Mirrored by hand from `src/governance/deployment-status.ts`, like every other
// type in `api.ts`: the dashboard bundle does not import from `src/`.
export type GovernanceDeploymentCheckStatus = "pass" | "warn" | "fail" | "unknown";

export type GovernanceDeploymentCheck = {
  id: string;
  title: string;
  status: GovernanceDeploymentCheckStatus;
  detail: string;
  remediation?: string;
  /** `gateway-audit` rows carry the host security audit's own wording. */
  source: "governance" | "gateway-audit";
};

export type GovernanceDeploymentFacts = {
  platform: string;
  totalMemoryBytes: number;
  bind: string;
  port: number;
  authMode: string;
  tailscaleMode: string;
  governanceDir: string;
  governanceDirRelocated: boolean;
  gatewayNotes: string[];
};

export type GovernanceDeploymentStatus = {
  /** Null when the Gateway configuration could not be read at all. */
  facts: GovernanceDeploymentFacts | null;
  checks: GovernanceDeploymentCheck[];
  summary: { pass: number; warn: number; fail: number; unknown: number };
  overall: "pass" | "warn" | "fail";
  sampledAt: string;
};
