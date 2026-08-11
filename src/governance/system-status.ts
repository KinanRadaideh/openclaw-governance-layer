// System resource snapshot for the Viewer tier.
//
// Design doc §1.6 gives Viewers the ability to "monitor active agent
// operations, view system resource states (e.g., VPS CPU/RAM usage)". This is
// the resource-state half of that: a read-only snapshot an oversight role can
// watch without holding any permission to change the system.
//
// Built entirely on Node's `os` module — no dependency, and no shell-out,
// which matters because the governance layer must not itself be a way to
// execute commands on the host.
import { cpus, freemem, loadavg, platform, totalmem, uptime } from "node:os";

export type SystemStatus = {
  platform: string;
  cpuCount: number;
  /**
   * 1/5/15-minute load averages. Always [0,0,0] on Windows, where the OS
   * exposes no equivalent — reported honestly rather than faked, and the
   * dashboard hides the row when unsupported.
   */
  loadAverage: [number, number, number];
  loadAverageSupported: boolean;
  totalMemoryBytes: number;
  freeMemoryBytes: number;
  usedMemoryPercent: number;
  /** Host uptime in seconds. */
  uptimeSeconds: number;
  /** This Gateway process's uptime in seconds. */
  processUptimeSeconds: number;
  /** Resident set size of the Gateway process, in bytes. */
  processMemoryBytes: number;
  sampledAt: string;
};

export function readSystemStatus(): SystemStatus {
  const total = totalmem();
  const free = freemem();
  const [one = 0, five = 0, fifteen = 0] = loadavg();
  const isWindows = platform() === "win32";
  return {
    platform: platform(),
    cpuCount: cpus().length,
    loadAverage: [one, five, fifteen],
    // os.loadavg() returns zeros on Windows rather than throwing, so a raw
    // reading would look like a perfectly idle machine instead of "unknown".
    loadAverageSupported: !isWindows,
    totalMemoryBytes: total,
    freeMemoryBytes: free,
    usedMemoryPercent: total > 0 ? Math.round(((total - free) / total) * 1000) / 10 : 0,
    uptimeSeconds: Math.round(uptime()),
    processUptimeSeconds: Math.round(process.uptime()),
    processMemoryBytes: process.memoryUsage().rss,
    sampledAt: new Date().toISOString(),
  };
}
