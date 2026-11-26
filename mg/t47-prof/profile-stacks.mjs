// Heaviest call paths in a wall-clock window of a V8 .cpuprofile (T47 3.2.2e, 2026-11-26).
// Usage: node profile-stacks.mjs <file> <startHH:MM:SS> <fromHH:MM:SS> <toHH:MM:SS> [focusFunctionName]
// Prints the top call paths (leaf first) by time. With a focus name, only samples whose
// stack contains that function, and the path is cut at it, so you see who calls it.
import fs from "node:fs";
const [file, startArg, fromArg, toArg, focus] = process.argv.slice(2);
const secs = (x) => {
  const [h, m, s] = x.split(":").map(Number);
  return h * 3600 + m * 60 + s;
};
const p = JSON.parse(fs.readFileSync(file, "utf8"));
const byId = new Map(p.nodes.map((n) => [n.id, n]));
const parent = new Map();
for (const n of p.nodes) {
  for (const c of n.children ?? []) {
    parent.set(c, n.id);
  }
}
const name = (n) => {
  const f = n.callFrame;
  const u = (f.url || "").replace(/^.*\//, "");
  return `${f.functionName || "(anon)"}${u ? "@" + u.replace(/-[A-Za-z0-9_]{8}\.js$/, "") + ":" + (f.lineNumber + 1) : ""}`;
};
const SKIP = new Set([
  "(root)",
  "processTicksAndRejections",
  "runMicrotasks",
  "(idle)",
  "(program)",
]);
const start = secs(startArg),
  from = secs(fromArg),
  to = secs(toArg);
let t = p.startTime;
const paths = new Map();
let total = 0;
for (let i = 0; i < p.samples.length; i++) {
  t += p.timeDeltas[i] ?? 0;
  const wall = start + (t - p.startTime) / 1e6;
  if (wall < from || wall >= to) {
    continue;
  }
  const dt = (p.timeDeltas[i + 1] ?? 0) / 1000;
  const leaf = byId.get(p.samples[i]);
  if (["(idle)", "(program)"].includes(leaf.callFrame.functionName)) {
    continue;
  }
  const chain = [];
  for (let id = p.samples[i]; id !== undefined; id = parent.get(id)) {
    const n = byId.get(id);
    if (!SKIP.has(n.callFrame.functionName)) {
      chain.push(name(n));
    }
  }
  let shown;
  if (focus) {
    const at = chain.findIndex((c) => c.startsWith(focus + "@") || c === focus);
    if (at < 0) {
      continue;
    }
    shown = chain.slice(at, at + 16);
  } else {
    shown = chain.slice(0, 16);
  }
  total += dt;
  const key = shown.join("\n      < ");
  paths.set(key, (paths.get(key) ?? 0) + dt);
}
console.log(
  `window ${fromArg}-${toArg}${focus ? `, focus ${focus}` : ""}: ${total.toFixed(0)} ms counted`,
);
for (const [k, v] of [...paths].toSorted((a, b) => b[1] - a[1]).slice(0, 12)) {
  console.log(`\n${v.toFixed(0).padStart(6)}ms  ${k}`);
}
