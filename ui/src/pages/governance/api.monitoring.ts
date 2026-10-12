// What the dashboard reads to watch the installation: the agent runs in flight and the
// host's resources.
//
// Split out of `api.ts` on the rule `api.rule-requests.ts` set, when T86 D5's lifetime
// arguments took `api.ts` past its 700-line limit: move a subject out whole rather than
// suppress the count. **Types only**; the client methods stay in `api.ts`.

export type GovernanceActiveSession = {
  runId: string;
  agentId: string;
  sessionKey: string;
  startedAtMs: number;
  expiresAtMs?: number;
  runningForSeconds: number;
  lockedDown: boolean;
};

export type GovernanceActiveSessionsView = {
  supported: boolean;
  sessions: GovernanceActiveSession[];
  sampledAt: string;
};

export type GovernanceSystemStatus = {
  platform: string;
  cpuCount: number;
  loadAverage: [number, number, number];
  loadAverageSupported: boolean;
  totalMemoryBytes: number;
  freeMemoryBytes: number;
  usedMemoryPercent: number;
  uptimeSeconds: number;
  processUptimeSeconds: number;
  processMemoryBytes: number;
  sampledAt: string;
};
