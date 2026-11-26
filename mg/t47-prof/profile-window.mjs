// Summarise a V8 .cpuprofile for one wall-clock window (T47 3.2.2e, 2026-11-26).
// Usage: node profile-window.mjs <file.cpuprofile> <startHH:MM:SS> [fromHH:MM:SS toHH:MM:SS]
//   startHH:MM:SS = the wall time the profile began (from the file name, CPU.YYYYMMDD.HHMMSS...).
// Without a window: prints busy milliseconds per second for the whole profile.
// With a window: prints the top self and inclusive frames inside it.
import fs from "node:fs";

const [file, startArg, fromArg, toArg] = process.argv.slice(2);
if (!file || !startArg) {
  console.error("usage: node profile-window.mjs <file> <startHH:MM:SS> [from to]");
  process.exit(1);
}
const secs = (hms) => {
  const [h, m, s] = hms.split(":").map(Number);
  return h * 3600 + m * 60 + s;
};
const hms = (t) => {
  const s = Math.floor(t) % 86400;
  return [Math.floor(s / 3600), Math.floor((s % 3600) / 60), s % 60]
    .map((n) => String(n).padStart(2, "0"))
    .join(":");
};
const profile = JSON.parse(fs.readFileSync(file, "utf8"));
const byId = new Map(profile.nodes.map((n) => [n.id, n]));
const parent = new Map();
for (const n of profile.nodes) {
  for (const c of n.children ?? []) {
    parent.set(c, n.id);
  }
}
const label = (n) => {
  const f = n.callFrame;
  const url = (f.url || "").replace(/^.*\/(dist|node_modules|src)\//, "$1/");
  return `${f.functionName || "(anonymous)"}  ${url || "(native)"}${f.url ? ":" + (f.lineNumber + 1) : ""}`;
};
const IDLE = new Set(["(idle)", "(program)"]);
const start = secs(startArg);
let t = profile.startTime;
const samples = [];
for (let i = 0; i < profile.samples.length; i++) {
  t += profile.timeDeltas[i] ?? 0;
  const dt = (profile.timeDeltas[i + 1] ?? 0) / 1000; // ms this sample stands for
  samples.push({ wall: start + (t - profile.startTime) / 1e6, id: profile.samples[i], dt });
}
if (!fromArg) {
  const busy = new Map();
  for (const s of samples) {
    const name = byId.get(s.id).callFrame.functionName;
    if (IDLE.has(name)) {
      continue;
    }
    const k = Math.floor(s.wall);
    busy.set(k, (busy.get(k) ?? 0) + s.dt);
  }
  console.log("busy ms per second (main thread):");
  for (const [k, ms] of [...busy].toSorted((a, b) => a[0] - b[0])) {
    console.log(`${hms(k)}  ${ms.toFixed(0).padStart(5)}  ${"#".repeat(Math.round(ms / 50))}`);
  }
  process.exit(0);
}
const from = secs(fromArg);
const to = secs(toArg);
const self = new Map();
const incl = new Map();
let total = 0;
let idle = 0;
for (const s of samples) {
  if (s.wall < from || s.wall >= to) {
    continue;
  }
  const node = byId.get(s.id);
  if (IDLE.has(node.callFrame.functionName)) {
    idle += s.dt;
    continue;
  }
  total += s.dt;
  const key = label(node);
  self.set(key, (self.get(key) ?? 0) + s.dt);
  const seen = new Set();
  for (let id = s.id; id !== undefined; id = parent.get(id)) {
    const k = label(byId.get(id));
    if (seen.has(k)) {
      continue;
    }
    seen.add(k);
    incl.set(k, (incl.get(k) ?? 0) + s.dt);
  }
}
const top = (m, n) =>
  [...m]
    .toSorted((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([k, v]) => `${v.toFixed(0).padStart(7)}ms  ${k}`);
console.log(`window ${fromArg}-${toArg}: busy ${total.toFixed(0)} ms, idle ${idle.toFixed(0)} ms`);
console.log("\ntop SELF frames:");
console.log(top(self, 30).join("\n"));
console.log("\ntop INCLUSIVE frames (where the time was spent, callers included):");
console.log(top(incl, 45).join("\n"));
