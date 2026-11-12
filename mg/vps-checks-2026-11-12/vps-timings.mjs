// Chapter 4 timings on a running Gateway: dashboard reads, agent creation (and how long the
// Gateway stops answering meanwhile), and the kill switch on an idle and on a running agent.
//
// Run from the repository root on the server, as the account that runs the Gateway:
//   GOV_USER=<root account> GOV_PASS=<password> OUT_DIR=<folder> node mg/vps-checks-2026-11-12/vps-timings.mjs
// Optional: GATEWAY_PORT, OPENCLAW_GATEWAY_TOKEN, CREATE_RUNS (3), IDLE_KILLS (5),
// RUNNING_KILLS (3), RUN_WARMUP_S (15).
//
// It creates one probe agent per creation run and deletes each one (OpenClaw's full delete, its
// folder to the trash). Every write goes through the same dashboard routes the page uses, so each
// one is in the ledger like any operator action.

import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { performance } from "node:perf_hooks";
import JSON5 from "json5";

const env = process.env;
const outDir = env.OUT_DIR || ".";
const createRuns = Number(env.CREATE_RUNS || 3);
const idleKills = Number(env.IDLE_KILLS || 5);
const runningKills = Number(env.RUNNING_KILLS || 3);
const runWarmupS = Number(env.RUN_WARMUP_S || 15);

function readConfig() {
  const file = path.join(
    env.OPENCLAW_STATE_DIR || path.join(os.homedir(), ".openclaw"),
    "openclaw.json",
  );
  try {
    return JSON5.parse(fs.readFileSync(file, "utf8"));
  } catch (err) {
    console.error(`Could not read ${file}: ${err.message}`);
    return {};
  }
}

const config = readConfig();
const port = Number(env.GATEWAY_PORT || config.gateway?.port || 18789);
const token = env.OPENCLAW_GATEWAY_TOKEN || config.gateway?.auth?.token;
const origin = `http://127.0.0.1:${port}`;
const base = `${origin}/control-ui/governance`;
if (!token) {
  console.error(
    "No Gateway token: set OPENCLAW_GATEWAY_TOKEN or check gateway.auth.token in openclaw.json.",
  );
  process.exit(2);
}
if (!env.GOV_USER || !env.GOV_PASS) {
  console.error("Set GOV_USER and GOV_PASS (the Root account).");
  process.exit(2);
}

const results = { startedAt: new Date().toISOString(), port, notes: [] };
const log = (line) => {
  console.log(line);
  fs.appendFileSync(path.join(outDir, "timings.txt"), `${line}\n`);
};
const ms = (n) => `${Math.round(n * 10) / 10} ms`;
const stats = (xs) => {
  const s = xs.toSorted((a, b) => a - b);
  const median = s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
  return { n: s.length, min: s[0], median, max: s[s.length - 1] };
};
const sleep = (t) =>
  new Promise((r) => {
    setTimeout(r, t);
  });

let cookie = "";
async function api(method, route, body) {
  const t0 = performance.now();
  const res = await fetch(`${base}/${route}`, {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      origin,
      ...(cookie ? { cookie } : {}),
      ...(body ? { "content-type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  const took = performance.now() - t0;
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = text;
  }
  return { status: res.status, json, took, headers: res.headers };
}

async function healthOnce() {
  const t0 = performance.now();
  const res = await fetch(`${origin}/healthz`);
  await res.text();
  return performance.now() - t0;
}

// Polls /healthz every 100 ms; a request the Gateway cannot answer while blocked shows as a long one.
function startHealthPoller() {
  const samples = [];
  const state = { stop: false };
  const done = (async () => {
    while (!state.stop) {
      samples.push(await healthOnce().catch(() => Number.NaN));
      await sleep(100);
    }
  })();
  return async () => {
    state.stop = true;
    await done;
    return samples.filter((x) => !Number.isNaN(x));
  };
}

async function main() {
  log(
    `== Timings on ${os.hostname()} (${os.cpus().length} CPUs, ${Math.round(os.totalmem() / 2 ** 30)} GB), port ${port}, ${results.startedAt}`,
  );

  // Sign in.
  const login = await api("POST", "login", { username: env.GOV_USER, password: env.GOV_PASS });
  if (login.status !== 200) {
    log(`Sign-in failed: HTTP ${login.status} ${JSON.stringify(login.json)}`);
    process.exit(1);
  }
  cookie = (login.headers.get("set-cookie") ?? "").split(";")[0];
  log(`Signed in as ${env.GOV_USER} (${ms(login.took)}).`);

  // 1. Health probe and governance reads, idle.
  const health = [];
  for (let i = 0; i < 20; i += 1) {
    health.push(await healthOnce());
  }
  const reads = [];
  for (let i = 0; i < 20; i += 1) {
    const r = await api("GET", "agents");
    if (r.status !== 200) {
      throw new Error(`GET agents: HTTP ${r.status}`);
    }
    reads.push(r.took);
  }
  results.healthIdle = stats(health);
  results.governanceReads = stats(reads);
  log(
    `\n-- Idle: /healthz median ${ms(results.healthIdle.median)}, max ${ms(results.healthIdle.max)} (20)`,
  );
  log(
    `-- Governance read (GET agents): median ${ms(results.governanceReads.median)}, max ${ms(results.governanceReads.max)} (20)`,
  );

  // 2. Agent creation, with the Gateway's responsiveness while it runs.
  log(
    `\n-- Agent creation (${createRuns} runs; the first is the first since the Gateway started only if it was just restarted)`,
  );
  results.creation = [];
  const stamp = Date.now().toString(36);
  let keptAgent;
  for (let i = 1; i <= createRuns; i += 1) {
    const agentId = `timing-probe-${stamp}-${i}`;
    const stopPoller = startHealthPoller();
    await sleep(300);
    const r = await api("POST", "agents/provision", { displayName: `Timing probe ${i}`, agentId });
    await sleep(300);
    const samples = await stopPoller();
    if (r.status !== 200) {
      log(`  run ${i}: HTTP ${r.status} ${JSON.stringify(r.json)}`);
      results.creation.push({ run: i, status: r.status, error: r.json });
      continue;
    }
    const slowest = Math.max(...samples);
    results.creation.push({
      run: i,
      agentId: r.json.agent?.id ?? agentId,
      requestMs: r.took,
      slowestHealthzMs: slowest,
      healthSamples: samples.length,
      confirmed: r.json.confirmed,
      confirmWaitedMs: r.json.confirmWaitedMs,
    });
    log(
      `  run ${i}: creation request ${ms(r.took)}; slowest /healthz meanwhile ${ms(slowest)} (${samples.length} probes); confirmed ${r.json.confirmed}`,
    );
    if (i === createRuns) {
      keptAgent = r.json.agent?.id ?? agentId;
    } else {
      await removeAgent(r.json.agent?.id ?? agentId);
    }
  }
  if (!keptAgent) {
    log("No probe agent was created; kill-switch timings skipped.");
    return;
  }

  // 3. Kill switch with nothing running.
  log(`\n-- Kill switch, nothing running (agent ${keptAgent}, ${idleKills} times)`);
  results.killIdle = [];
  for (let i = 1; i <= idleKills; i += 1) {
    const k = await api("POST", "kill", { agentId: keptAgent, locked: true });
    const rel = await api("POST", "kill", { agentId: keptAgent, locked: false });
    results.killIdle.push({
      requestMs: k.took,
      ...k.json,
      releaseMs: rel.took,
      releaseStatus: rel.status,
    });
    log(
      `  ${i}: HTTP ${k.status}; request ${ms(k.took)}; signal ${k.json.dispatchMs} ms; confirmed ${k.json.stoppedConfirmed} after ${k.json.elapsedMs} ms; release ${ms(rel.took)}`,
    );
  }

  // 4. Kill switch on a running agent: a model run writing a long answer through the Gateway.
  log(
    `\n-- Kill switch, agent running (${runningKills} times; each run gets ${runWarmupS} s to start)`,
  );
  results.killRunning = [];
  for (let i = 1; i <= runningKills; i += 1) {
    const child = spawn(
      "openclaw",
      [
        "agent",
        "--agent",
        keptAgent,
        "--session-id",
        `timing-${stamp}-${i}`,
        "--message",
        "Write a 3000-word essay on the history of lighthouses, in full. Do not use any tools.",
      ],
      { stdio: ["ignore", "ignore", "pipe"] },
    );
    let childErr = "";
    child.stderr.on("data", (d) => (childErr += d));
    const childExit = new Promise((r) => {
      child.on("exit", (code) => r(code));
      child.on("error", (err) => {
        childErr += `could not start openclaw: ${err.message}`;
        r("did not start");
      });
    });
    await sleep(runWarmupS * 1000);
    const stillRunning = child.exitCode === null;
    const k = await api("POST", "kill", { agentId: keptAgent, locked: true });
    const exitCode = await Promise.race([
      childExit,
      sleep(15000).then(() => "still running 15 s later"),
    ]);
    if (child.exitCode === null) {
      child.kill();
    }
    const rel = await api("POST", "kill", { agentId: keptAgent, locked: false });
    const aborted = k.json.abortedRunIds?.length ?? 0;
    results.killRunning.push({
      requestMs: k.took,
      ...k.json,
      cliStillRunningAtKill: stillRunning,
      cliExit: exitCode,
      cliStderrTail: childErr.slice(-400),
      releaseStatus: rel.status,
    });
    log(
      `  ${i}: HTTP ${k.status}; runs stopped ${aborted}; signal ${k.json.dispatchMs} ms; confirmed ${k.json.stoppedConfirmed} after ${k.json.elapsedMs} ms; request ${ms(k.took)}; CLI ${stillRunning ? "was running" : "had already ended"}, exit ${exitCode}`,
    );
    if (aborted === 0) {
      log(
        "     (nothing was caught running: this sample is not a running-agent stop; see cliStderrTail in timings.json)",
      );
    }
    await sleep(2000);
  }

  await removeAgent(keptAgent);
}

async function removeAgent(agentId) {
  const r = await api("POST", "agents/deprovision", {
    agentId,
    deleteFromHost: true,
    hostDeletion: "full",
    nestedFolder: "trash",
  });
  log(
    `  removed ${agentId}: HTTP ${r.status}${r.status === 200 ? "" : ` ${JSON.stringify(r.json)}`}`,
  );
  if (r.status !== 200) {
    results.notes.push(`probe agent ${agentId} not removed: delete it on the dashboard`);
  }
}

try {
  await main();
} catch (err) {
  log(`Stopped on an error: ${err.stack || err}`);
  results.error = String(err);
  process.exitCode = 1;
} finally {
  results.finishedAt = new Date().toISOString();
  fs.writeFileSync(path.join(outDir, "timings.json"), `${JSON.stringify(results, null, 2)}\n`);
  for (const note of results.notes) {
    log(`NOTE: ${note}`);
  }
}
