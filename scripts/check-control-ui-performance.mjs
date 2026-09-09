#!/usr/bin/env node
// Reports and enforces compressed Control UI asset budgets after a production build.
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const KIB = 1024;
const STARTUP_JS_BASELINE_RATCHET_BYTES = 4096;
const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_STARTUP_BUDGET_BASELINE_PATH = path.resolve(
  SCRIPT_DIR,
  "../config/control-ui-startup-budget-baseline.json",
);

// This absorbs measured local-to-Linux gzip variance, but landed changes can
// still consume the tolerance. Local zlib emits smaller streams than CI's Linux
// builder, so baseline updates must use CI bytes via --startup-js-bytes. The
// fixed JS ceiling bounds cumulative creep.
export const CONTROL_UI_STARTUP_JS_GZIP_TOLERANCE_BYTES = 1024;

// Small, explicit headroom over the optimized baseline. Budget changes should
// accompany an intentional loading or chunking decision.
export const CONTROL_UI_PERFORMANCE_BUDGETS = Object.freeze({
  startupJsRequests: 18,
  startupCssRequests: 1,
  // 317 KiB preserved headroom after the device-auth upgrade hook and sidebar
  // session-render extraction (2026-07); the migration UI itself remains lazy.
  //
  // **Raised to 318 KiB on 2026-09-08 (finding 321), and the reason is the
  // whole of the intentional decision this comment asks for.**
  //
  // The governance layer's operator-facing text was deliberately expanded
  // across findings 296-320, because *unclear text was itself the defect class
  // being fixed*: a hint that told a User with no agents "You manage every
  // agent" (303), a permission whose state was invisible (304), a panel naming
  // a command line deleted the day before (320). Those sentences are the
  // product, not decoration.
  //
  // They land in **startup** JS because `ui/src/i18n/locales/en.ts` is loaded
  // up front, while the governance *page* is lazy.
  //
  // **Corrected 2026-09-09, finding 342.** What stood here said the cost was
  // "multiplied across the locale set", and the sentence was repeated into
  // `mg/HANDOFF.md` and the sweep backlog from this file. It is false, and it
  // overstates the cost by a factor of twenty: `registry.ts` dynamic-imports
  // all twenty non-English locales (`LAZY_LOCALE_REGISTRY`), and this build
  // emits each of them as its own chunk — `ar`, `fa`, `hi`, `ja-JP`, `ru`,
  // `th`, `uk`, `vi` and the rest are in the asset list and in none of the
  // twelve startup requests. **Only English is charged here, once.**
  //
  // The correction cuts both ways and the second half is the useful one. A
  // sentence costs a twentieth of what this comment claimed, so the ceiling
  // raise below bought more than it looked like — and the *fix* is worth far
  // more than it looked like too. The governance block is lines 3482-4156 of
  // `en.ts`, ~32 KB of strings, **~10.5 KB gzipped**. Moving it off the
  // startup path frees about 170 times the headroom that remains (60 B,
  // measured on this tree 2026-09-09), which is the difference between
  // rationing sentences and not thinking about them again.
  //
  // Measured on this tree, three points:
  //
  //     HEAD                             324522 B   passes, 86 B of headroom
  //     + findings 296-304 (dashboard)   325138 B   over by 530 B
  //     + findings 305-320 (this pass)   325241 B   over by 633 B
  //
  // **The build had been failing since the first of those and nobody had run
  // it** — `node scripts/build-all.mjs` is in the handoff's verification list
  // precisely because "check the build, not just the source" (finding 284), and
  // every source-level check stayed green throughout.
  //
  // 318 KiB restores about the headroom that existed before (391 B). That is
  // deliberately not generous: raising this a kilobyte per sentence is not a
  // strategy, and **the real answer is to stop charging page-specific strings
  // to startup** — split the locale module so a page's text loads with the
  // page, as the page's own code already does. That is a structural change to
  // upstream's i18n loading and is recorded as a decision (T64) rather than
  // taken here in passing.
  //
  // **What T64 actually costs, established 2026-09-09 so the decision is taken
  // on facts.** The runtime edge is a single line — `translate.ts` statically
  // imports `en` — and the twenty lazy locales are the pattern to copy. The
  // obstacle is not the runtime: `scripts/control-ui-i18n.ts` hashes the raw
  // **text** of `locales/en.ts` (`sourceHash = sha256(sourceRaw)`) and that
  // hash feeds the locale metadata and raw-copy baseline the i18n gate
  // compares. Splitting the file changes it, so the split cannot land as a
  // quiet refactor: it goes through the locale-refresh flow `ui/AGENTS.md`
  // describes, which is upstream's and which CI would normally drive.
  //
  // **Measured headroom on this tree, 2026-09-09: 67 B** (325565 B against a
  // 325632 B ceiling). One short sentence, for the whole product. It was 60 B
  // before that day's repairs, and they *added* an operator-facing sentence:
  // reusing a string the page already ships costs nothing and can pay.
  startupJsGzipBytes: 318 * KIB,
  // 45 KiB CSS ceilings maintainer-approved 2026-07 alongside the interleaved
  // sidebar zone styling; headroom over the ~36.5 KiB post-diet baseline.
  startupCssGzipBytes: 45 * KIB,
  largestJsGzipBytes: 215 * KIB,
  largestCssGzipBytes: 45 * KIB,
});

function controlUiAssetPathFromUrl(value) {
  const normalized = value.split(/[?#]/u, 1)[0]?.replace(/\\/gu, "/") ?? "";
  const markerIndex = normalized.lastIndexOf("assets/");
  if (markerIndex === -1) {
    return null;
  }
  const assetPath = normalized.slice(markerIndex);
  if (assetPath.includes("../") || !/\.(?:css|js)$/u.test(assetPath)) {
    return null;
  }
  return assetPath;
}

export function extractControlUiStartupAssetPaths(html) {
  const assets = new Set();
  for (const tag of html.matchAll(/<(?:link|script)\b[^>]*>/giu)) {
    const attribute = tag[0].match(/\s(?:href|src)\s*=\s*["']([^"']+)["']/iu);
    const assetPath = attribute ? controlUiAssetPathFromUrl(attribute[1]) : null;
    if (assetPath) {
      assets.add(assetPath);
    }
  }
  return [...assets].toSorted((left, right) => left.localeCompare(right));
}

function readAssetMetrics(assetsDir, entry) {
  const file = `assets/${entry.name}`;
  const sourcePath = path.join(assetsDir, entry.name);
  const gzipPath = `${sourcePath}.gz`;
  const brotliPath = `${sourcePath}.br`;
  for (const sidecarPath of [gzipPath, brotliPath]) {
    if (!fs.existsSync(sidecarPath)) {
      throw new Error(`Control UI performance check missing ${path.basename(sidecarPath)}`);
    }
  }
  return {
    file,
    type: entry.name.endsWith(".js") ? "js" : "css",
    rawBytes: fs.statSync(sourcePath).size,
    gzipBytes: fs.statSync(gzipPath).size,
    brotliBytes: fs.statSync(brotliPath).size,
  };
}

function summarizeAssets(assets) {
  return assets.reduce(
    (summary, asset) => ({
      requests: summary.requests + 1,
      rawBytes: summary.rawBytes + asset.rawBytes,
      gzipBytes: summary.gzipBytes + asset.gzipBytes,
      brotliBytes: summary.brotliBytes + asset.brotliBytes,
    }),
    { requests: 0, rawBytes: 0, gzipBytes: 0, brotliBytes: 0 },
  );
}

function largestAsset(assets) {
  return assets.toSorted(
    (left, right) => right.gzipBytes - left.gzipBytes || left.file.localeCompare(right.file),
  )[0];
}

export function collectControlUiPerformanceMetrics(distDir) {
  const assetsDir = path.join(distDir, "assets");
  const html = fs.readFileSync(path.join(distDir, "index.html"), "utf8");
  const assets = fs
    .readdirSync(assetsDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && /\.(?:css|js)$/u.test(entry.name))
    .map((entry) => readAssetMetrics(assetsDir, entry));
  const assetsByFile = new Map(assets.map((asset) => [asset.file, asset]));
  const startup = extractControlUiStartupAssetPaths(html).map((file) => {
    const asset = assetsByFile.get(file);
    if (!asset) {
      throw new Error(`Control UI performance check cannot find startup asset ${file}`);
    }
    return asset;
  });
  const jsAssets = assets.filter((asset) => asset.type === "js");
  const cssAssets = assets.filter((asset) => asset.type === "css");
  if (jsAssets.length === 0 || cssAssets.length === 0 || startup.length === 0) {
    throw new Error("Control UI performance check found an incomplete production bundle");
  }
  return {
    schemaVersion: 1,
    startup: {
      js: summarizeAssets(startup.filter((asset) => asset.type === "js")),
      css: summarizeAssets(startup.filter((asset) => asset.type === "css")),
      assets: startup,
    },
    total: {
      js: summarizeAssets(jsAssets),
      css: summarizeAssets(cssAssets),
    },
    largest: {
      js: largestAsset(jsAssets),
      css: largestAsset(cssAssets),
    },
  };
}

export function evaluateControlUiPerformanceBudgets(
  metrics,
  budgets = CONTROL_UI_PERFORMANCE_BUDGETS,
  startupBudgetBaseline = null,
  startupJsTolerance = CONTROL_UI_STARTUP_JS_GZIP_TOLERANCE_BYTES,
) {
  const checks = [
    ["startup JS requests", metrics.startup.js.requests, budgets.startupJsRequests, "count"],
    ["startup CSS requests", metrics.startup.css.requests, budgets.startupCssRequests, "count"],
    ["startup JS gzip", metrics.startup.js.gzipBytes, budgets.startupJsGzipBytes, "bytes"],
    ["startup CSS gzip", metrics.startup.css.gzipBytes, budgets.startupCssGzipBytes, "bytes"],
    ["largest JS gzip", metrics.largest.js.gzipBytes, budgets.largestJsGzipBytes, "bytes"],
    ["largest CSS gzip", metrics.largest.css.gzipBytes, budgets.largestCssGzipBytes, "bytes"],
  ];
  const violations = checks.flatMap(([metric, actual, limit, unit]) =>
    actual > limit ? [{ metric, actual, limit, unit }] : [],
  );
  if (
    startupBudgetBaseline &&
    metrics.startup.js.gzipBytes > startupBudgetBaseline.startupJsGzipBytes + startupJsTolerance
  ) {
    violations.push({
      metric: "startup JS gzip vs baseline",
      actual: metrics.startup.js.gzipBytes,
      limit: startupBudgetBaseline.startupJsGzipBytes + startupJsTolerance,
      unit: "bytes",
      baseline: startupBudgetBaseline.startupJsGzipBytes,
      tolerance: startupJsTolerance,
    });
  }
  return violations;
}

export function formatControlUiPerformanceBytes(bytes) {
  return bytes < KIB ? `${bytes} B` : `${(bytes / KIB).toFixed(1)} KiB`;
}

function formatRequestCount(count) {
  return `${count} ${count === 1 ? "request" : "requests"}`;
}

function formatAssetSummary(summary) {
  return `${formatRequestCount(summary.requests)}, ${formatControlUiPerformanceBytes(summary.gzipBytes)} gzip, ${formatControlUiPerformanceBytes(summary.brotliBytes)} br`;
}

function formatViolation(violation) {
  if (violation.baseline !== undefined && violation.tolerance !== undefined) {
    return `${violation.metric}: ${violation.actual} B exceeds baseline ${violation.baseline} B + tolerance ${violation.tolerance} B (limit ${violation.limit} B); intentionally raise the baseline with node scripts/check-control-ui-performance.mjs --update-baseline --startup-js-bytes ${violation.actual} --reason "<reason>"`;
  }
  const actual =
    violation.unit === "bytes"
      ? formatControlUiPerformanceBytes(violation.actual)
      : String(violation.actual);
  const limit =
    violation.unit === "bytes"
      ? formatControlUiPerformanceBytes(violation.limit)
      : String(violation.limit);
  const exactBytes =
    violation.unit === "bytes" && actual === limit
      ? ` (${violation.actual} B vs ${violation.limit} B)`
      : "";
  return `${violation.metric}: ${actual} exceeds ${limit}${exactBytes}`;
}

export function formatControlUiPerformanceReport(
  metrics,
  budgets = CONTROL_UI_PERFORMANCE_BUDGETS,
  startupBudgetBaseline = null,
  startupJsTolerance = CONTROL_UI_STARTUP_JS_GZIP_TOLERANCE_BYTES,
) {
  const violations = evaluateControlUiPerformanceBudgets(
    metrics,
    budgets,
    startupBudgetBaseline,
    startupJsTolerance,
  );
  const lines = [
    "Control UI performance:",
    `  startup JS: ${formatAssetSummary(metrics.startup.js)} (limits: ${formatRequestCount(budgets.startupJsRequests)}, ${formatControlUiPerformanceBytes(budgets.startupJsGzipBytes)} gzip)`,
  ];
  if (startupBudgetBaseline) {
    lines.push(
      `  startup JS gzip vs baseline: ${metrics.startup.js.gzipBytes} B (baseline ${startupBudgetBaseline.startupJsGzipBytes} B + tolerance ${startupJsTolerance} B, ceiling ${budgets.startupJsGzipBytes} B)`,
    );
  }
  lines.push(
    `  startup CSS: ${formatAssetSummary(metrics.startup.css)} (limits: ${formatRequestCount(budgets.startupCssRequests)}, ${formatControlUiPerformanceBytes(budgets.startupCssGzipBytes)} gzip)`,
    `  largest JS: ${metrics.largest.js.file}, ${formatControlUiPerformanceBytes(metrics.largest.js.gzipBytes)} gzip (limit: ${formatControlUiPerformanceBytes(budgets.largestJsGzipBytes)})`,
    `  largest CSS: ${metrics.largest.css.file}, ${formatControlUiPerformanceBytes(metrics.largest.css.gzipBytes)} gzip (limit: ${formatControlUiPerformanceBytes(budgets.largestCssGzipBytes)})`,
    `  all JS: ${formatAssetSummary(metrics.total.js)}`,
    `  all CSS: ${formatAssetSummary(metrics.total.css)}`,
  );
  if (
    startupBudgetBaseline &&
    metrics.startup.js.gzipBytes + STARTUP_JS_BASELINE_RATCHET_BYTES <
      startupBudgetBaseline.startupJsGzipBytes
  ) {
    lines.push(
      `  hint: startup JS gzip is more than ${STARTUP_JS_BASELINE_RATCHET_BYTES} B below the ${startupBudgetBaseline.startupJsGzipBytes} B baseline; lower it with node scripts/check-control-ui-performance.mjs --update-baseline --reason "<reason>"`,
    );
  }
  if (violations.length > 0) {
    lines.push(
      "  violations:",
      ...violations.map((violation) => `    - ${formatViolation(violation)}`),
    );
  }
  return lines.join("\n");
}

function baselineUpdateCommand() {
  return 'node scripts/check-control-ui-performance.mjs --update-baseline --reason "<reason>"';
}

function isIsoDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(value)) {
    return false;
  }
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}

function readControlUiStartupBudgetBaseline(baselinePath) {
  try {
    const parsed = JSON.parse(fs.readFileSync(baselinePath, "utf8"));
    if (
      !parsed ||
      typeof parsed !== "object" ||
      !Number.isSafeInteger(parsed.startupJsGzipBytes) ||
      parsed.startupJsGzipBytes < 0 ||
      typeof parsed.reason !== "string" ||
      parsed.reason.trim().length === 0 ||
      typeof parsed.updatedAt !== "string" ||
      !isIsoDate(parsed.updatedAt)
    ) {
      throw new Error("expected startupJsGzipBytes, non-empty reason, and YYYY-MM-DD updatedAt");
    }
    return {
      startupJsGzipBytes: parsed.startupJsGzipBytes,
      reason: parsed.reason,
      updatedAt: parsed.updatedAt,
    };
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Cannot read Control UI startup budget baseline ${baselinePath}: ${detail}. Regenerate it with ${baselineUpdateCommand()}.`,
      { cause: error },
    );
  }
}

function writeControlUiStartupBudgetBaseline(baselinePath, startupJsGzipBytes, reason) {
  const baseline = {
    startupJsGzipBytes,
    reason,
    updatedAt: new Date().toISOString().slice(0, 10),
  };
  fs.writeFileSync(baselinePath, `${JSON.stringify(baseline, null, 2)}\n`);
  return baseline;
}

function validateExplicitStartupJsBytes(startupJsBytes, currentBaseline) {
  const delta = Math.abs(startupJsBytes - currentBaseline.startupJsGzipBytes);
  if (delta > STARTUP_JS_BASELINE_RATCHET_BYTES) {
    throw new Error(
      `startup JS gzip baseline update: ${startupJsBytes} B differs from current baseline ${currentBaseline.startupJsGzipBytes} B by ${delta} B, exceeding the ${STARTUP_JS_BASELINE_RATCHET_BYTES} B ratchet`,
    );
  }
}

export function runControlUiPerformanceCheck(
  distDir,
  budgets = CONTROL_UI_PERFORMANCE_BUDGETS,
  baselinePath = DEFAULT_STARTUP_BUDGET_BASELINE_PATH,
) {
  const startupBudgetBaseline = readControlUiStartupBudgetBaseline(baselinePath);
  const metrics = collectControlUiPerformanceMetrics(distDir);
  const violations = evaluateControlUiPerformanceBudgets(metrics, budgets, startupBudgetBaseline);
  const report = formatControlUiPerformanceReport(metrics, budgets, startupBudgetBaseline);
  return {
    metrics,
    budgets,
    startupBudgetBaseline,
    startupJsTolerance: CONTROL_UI_STARTUP_JS_GZIP_TOLERANCE_BYTES,
    violations,
    report,
  };
}

function main(argv = process.argv.slice(2)) {
  let json = false;
  let updateBaseline = false;
  let reason;
  let startupJsBytes;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--json") {
      json = true;
    } else if (arg === "--update-baseline") {
      updateBaseline = true;
    } else if (arg === "--reason") {
      reason = argv[index + 1];
      if (!reason || reason.trim().length === 0 || reason.startsWith("--")) {
        throw new Error("--reason requires a non-empty value");
      }
      index += 1;
    } else if (arg === "--startup-js-bytes") {
      const value = argv[index + 1];
      if (!value || !/^[1-9]\d*$/u.test(value)) {
        throw new Error("--startup-js-bytes requires a positive integer");
      }
      startupJsBytes = Number(value);
      if (!Number.isSafeInteger(startupJsBytes)) {
        throw new Error("--startup-js-bytes requires a positive integer");
      }
      index += 1;
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }
  if (reason !== undefined && !updateBaseline) {
    throw new Error("--reason requires --update-baseline");
  }
  if (startupJsBytes !== undefined && !updateBaseline) {
    throw new Error("--startup-js-bytes requires --update-baseline");
  }
  if (json && updateBaseline) {
    throw new Error("--json cannot be combined with --update-baseline");
  }
  const distDir = path.resolve(SCRIPT_DIR, "../dist/control-ui");
  if (updateBaseline) {
    if (startupJsBytes !== undefined) {
      const currentBaseline = readControlUiStartupBudgetBaseline(
        DEFAULT_STARTUP_BUDGET_BASELINE_PATH,
      );
      validateExplicitStartupJsBytes(startupJsBytes, currentBaseline);
    }
    const nextStartupJsBytes =
      startupJsBytes ?? collectControlUiPerformanceMetrics(distDir).startup.js.gzipBytes;
    const baseline = writeControlUiStartupBudgetBaseline(
      DEFAULT_STARTUP_BUDGET_BASELINE_PATH,
      nextStartupJsBytes,
      reason ?? "manual baseline update",
    );
    process.stdout.write(
      `Updated config/control-ui-startup-budget-baseline.json to ${baseline.startupJsGzipBytes} B (${baseline.reason}).\n`,
    );
    return;
  }
  const result = runControlUiPerformanceCheck(distDir);
  if (json) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } else {
    process.stdout.write(`${result.report}\n`);
  }
  if (result.violations.length > 0) {
    process.exitCode = 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
