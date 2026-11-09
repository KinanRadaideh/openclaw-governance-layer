// T94 probe: what does Playwright's context.route see in real Chrome?
// Usage: node probe.mjs <repo root>
import http from "node:http";
import { createRequire } from "node:module";
import path from "node:path";

const repo = process.argv[2];
const require = createRequire(path.join(repo, "package.json"));
const { chromium } = require("playwright-core");

const hits = [];
function serve(port) {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      hits.push(`${port}${req.url}`);
      const u = req.url;
      if (u === "/r1") {
        res.writeHead(302, { location: "/r2" });
        return res.end();
      }
      if (u === "/r2") {
        res.writeHead(302, { location: `http://127.0.0.1:${port + 1}/final` });
        return res.end();
      }
      if (u === "/sw.js") {
        res.writeHead(200, { "content-type": "text/javascript" });
        return res.end(
          `self.addEventListener('install',e=>self.skipWaiting());self.addEventListener('activate',e=>e.waitUntil(clients.claim()));self.addEventListener('fetch',e=>{ if(e.request.url.includes('/via-sw')) e.respondWith(fetch('http://127.0.0.1:${port + 1}/sw-made')); });`,
        );
      }
      if (u === "/worker.js") {
        res.writeHead(200, { "content-type": "text/javascript" });
        return res.end(
          `fetch('http://127.0.0.1:${port + 1}/from-worker').catch(()=>{}); postMessage('ok');`,
        );
      }
      if (u === "/page") {
        res.writeHead(200, { "content-type": "text/html" });
        return res.end(`<html><body><a id=l href="http://127.0.0.1:${port + 1}/clicked">x</a>
<a id=pop target=_blank href="http://127.0.0.1:${port + 1}/popup">p</a>
<iframe src="http://127.0.0.1:${port + 1}/frame"></iframe>
<img src="http://127.0.0.1:${port + 1}/img.png">
<script>
fetch('http://127.0.0.1:${port + 1}/script-fetch').catch(()=>{});
new Worker('/worker.js');
navigator.sendBeacon('http://127.0.0.1:${port + 1}/beacon','x');
try{ const ws=new WebSocket('ws://127.0.0.1:${port + 1}/ws'); ws.onerror=()=>{}; }catch(e){}
navigator.serviceWorker && navigator.serviceWorker.register('/sw.js').then(()=>navigator.serviceWorker.ready).then(()=>setTimeout(()=>fetch('/via-sw').catch(()=>{}),300));
</script></body></html>`);
      }
      res.writeHead(200, { "content-type": "text/html" });
      res.end(`<html><body>${u}</body></html>`);
    });
    server.on("upgrade", (req, socket) => {
      hits.push(`${port}${req.url} (ws upgrade)`);
      socket.destroy();
    });
    server.listen(port, "127.0.0.1", () => resolve(server));
  });
}

const s1 = await serve(18941);
const s2 = await serve(18942);
const browser = await chromium.launch({
  executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
  headless: true,
});
const context = await browser.newContext();
const routed = [];
await context.route("**", async (route, request) => {
  let kind;
  try {
    kind = request.serviceWorker()
      ? "sw"
      : request.frame()
        ? request.frame() === request.frame().page().mainFrame()
          ? "main"
          : "subframe"
        : "noframe";
  } catch {
    kind = `frame-throws`;
  }
  routed.push(
    `${request.resourceType()} ${kind} nav=${request.isNavigationRequest()} ${request.url()}`,
  );
  await route.fallback();
});
const wsRouted = [];
await context.routeWebSocket(/.*/, (ws) => {
  wsRouted.push(ws.url());
  ws.close();
});
const page = await context.newPage();
await page.goto("http://127.0.0.1:18941/r1");
await page.goto("http://127.0.0.1:18941/page");
await page.waitForTimeout(1500);
await page.reload();
await page.waitForTimeout(1500);
const popupP = context.waitForEvent("page");
await page.click("#pop");
const popup = await popupP;
await popup.waitForLoadState().catch(() => {});
await page.click("#l");
await page.waitForTimeout(500);
await page.evaluate(() => {
  location.href = "/r1";
});
await page.waitForTimeout(800);
console.log("ROUTED:\n  " + routed.join("\n  "));
console.log("WS ROUTED:", wsRouted);
console.log("SERVER HITS:\n  " + hits.join("\n  "));
await browser.close();
s1.close();
s2.close();
