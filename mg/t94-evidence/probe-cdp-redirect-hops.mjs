// T94 probe 2: can a CDP Fetch session see redirect hops, alongside Playwright routes,
// in a browser reached over connectOverCDP (as OpenClaw reaches it)?
import { spawn } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";

const repo = process.argv[2];
const require = createRequire(path.join(repo, "package.json"));
const { chromium } = require("playwright-core");

const hits = [];
const server = http.createServer((req, res) => {
  hits.push(req.url);
  if (req.url === "/r1") {
    res.writeHead(302, { location: "/r2" });
    return res.end();
  }
  if (req.url === "/r2") {
    res.writeHead(302, { location: "http://localhost:18952/final" });
    return res.end();
  }
  if (req.url === "/jsr") {
    res.writeHead(200, { "content-type": "text/html" });
    return res.end(
      `<script>fetch('/r1').then(r=>r.text()).then(t=>document.title=t).catch(e=>document.title='err')</script>`,
    );
  }
  res.writeHead(200, { "content-type": "text/html" });
  res.end(`page ${req.url}`);
});
await new Promise((r) => {
  server.listen(18951, "127.0.0.1", r);
});
const server2 = http.createServer((req, res) => {
  hits.push(`2:${req.url}`);
  res.end("two");
});
await new Promise((r) => {
  server2.listen(18952, "127.0.0.1", r);
});

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "t94-chrome-"));
const chrome = spawn(
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  ["--headless=new", "--remote-debugging-port=18953", `--user-data-dir=${dir}`, "about:blank"],
  { stdio: "ignore" },
);
await new Promise((r) => {
  setTimeout(r, 2500);
});
const browser = await chromium.connectOverCDP("http://127.0.0.1:18953");
const context = browser.contexts()[0];
const routed = [];
await context.route("**", async (route, request) => {
  routed.push(`${request.resourceType()} ${request.url()}`);
  await route.fallback();
});
const page = context.pages()[0] ?? (await context.newPage());
const cdp = await context.newCDPSession(page);
const paused = [];
cdp.on("Fetch.requestPaused", async (e) => {
  paused.push(
    `${e.resourceType} ${e.request.url} redirectedFrom=${e.redirectedRequestId ?? "-"} status=${e.responseStatusCode ?? "-"}`,
  );
  if (e.request.url.endsWith("/final") && process.argv[3] === "block") {
    await cdp
      .send("Fetch.failRequest", { requestId: e.requestId, errorReason: "BlockedByClient" })
      .catch((x) => paused.push("fail err " + x.message));
    return;
  }
  await cdp
    .send("Fetch.continueRequest", { requestId: e.requestId })
    .catch((x) => paused.push("cont err " + x.message));
});
await cdp.send("Fetch.enable", { patterns: [{ urlPattern: "*", requestStage: "Request" }] });
await page
  .goto("http://127.0.0.1:18951/r1")
  .catch((e) => routed.push("goto err " + e.message.split("\n")[0]));
await page
  .goto("http://127.0.0.1:18951/jsr")
  .catch((e) => routed.push("goto err " + e.message.split("\n")[0]));
await page.waitForTimeout(1000);
console.log("title:", await page.title());
console.log("PW ROUTED:\n  " + routed.join("\n  "));
console.log("CDP PAUSED:\n  " + paused.join("\n  "));
console.log("HITS:", hits.join(" "));
await browser.close().catch(() => {});
chrome.kill();
server.close();
server2.close();
