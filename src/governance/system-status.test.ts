import { platform } from "node:os";
import { describe, expect, it } from "vitest";
import { readSystemStatus } from "./system-status.js";

describe("system status snapshot", () => {
  it("reports plausible resource figures", () => {
    const status = readSystemStatus();
    expect(status.cpuCount).toBeGreaterThan(0);
    expect(status.totalMemoryBytes).toBeGreaterThan(0);
    expect(status.freeMemoryBytes).toBeGreaterThanOrEqual(0);
    expect(status.freeMemoryBytes).toBeLessThanOrEqual(status.totalMemoryBytes);
    expect(status.usedMemoryPercent).toBeGreaterThanOrEqual(0);
    expect(status.usedMemoryPercent).toBeLessThanOrEqual(100);
    expect(status.uptimeSeconds).toBeGreaterThan(0);
    expect(status.processUptimeSeconds).toBeGreaterThanOrEqual(0);
    expect(status.processMemoryBytes).toBeGreaterThan(0);
    expect(Number.isNaN(Date.parse(status.sampledAt))).toBe(false);
  });

  it("marks load average unsupported on Windows rather than reporting a fake idle machine", () => {
    const status = readSystemStatus();
    expect(status.loadAverageSupported).toBe(platform() !== "win32");
    expect(status.loadAverage).toHaveLength(3);
  });

  it("exposes no host paths, credentials, or command output", () => {
    // A Viewer is the least-privileged tier; this snapshot must not become a
    // side channel for information they are not entitled to.
    const serialized = JSON.stringify(readSystemStatus());
    expect(serialized).not.toMatch(/[A-Za-z]:\\\\|\/home\/|\/Users\//);
    expect(Object.keys(readSystemStatus()).sort()).toEqual([
      "cpuCount",
      "freeMemoryBytes",
      "loadAverage",
      "loadAverageSupported",
      "platform",
      "processMemoryBytes",
      "processUptimeSeconds",
      "sampledAt",
      "totalMemoryBytes",
      "uptimeSeconds",
      "usedMemoryPercent",
    ]);
  });
});
