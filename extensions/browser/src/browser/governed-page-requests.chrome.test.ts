// T94: a governed agent's pages, in a real Chrome, against a local server that logs every
// request it receives. The verdict is stubbed here (core's `judgeFollowOnRequest` is tested in
// `src/governance/follow-on-requests.test.ts`); what this file proves is the interception: which
// requests are put to the judge, as which class, and that a refused one never reaches the
// server. Skipped where no Chrome or Edge is installed.
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import http from "node:http";
import { createRequire } from "node:module";
import type { AddressInfo } from "node:net";
import { tmpdir, userInfo } from "node:os";
import { join } from "node:path";
import type { Browser, BrowserContext, Page } from "playwright-core";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

type Via = "redirect" | "navigation" | "page";
type Judged = { url: string; via: Via; agentId?: string };

const judged: Judged[] = [];
let refuse: (url: string, via: Via) => boolean = () => false;
let activeCall:
  | {
      agentId?: string;
      sessionKey?: string;
      toolName: string;
      names: (url: string) => boolean;
      isRunning: () => boolean;
    }
  | undefined;

vi.mock("../sdk-security-runtime.js", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  currentGovernedCall: () => activeCall,
  judgeFollowOnRequest: async (call: { agentId?: string }, request: { url: string; via: Via }) => {
    judged.push({ url: request.url, via: request.via, agentId: call.agentId });
    return refuse(request.url, request.via)
      ? { allowed: false, reason: `governance: refused ${request.url} (test)` }
      : { allowed: true };
  },
}));

const { bindGovernedPage } = await import("./governed-page-requests.js");
const { gotoPageWithNavigationGuard } = await import("./pw-session-navigation.js");

const CHROME = [
  process.env.OPENCLAW_TEST_CHROME,
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
].find((candidate): candidate is string => Boolean(candidate && existsSync(candidate)));

const received: string[] = [];
let server: http.Server;
let other: http.Server;
let base = "";
let otherBase = "";

function htmlPage(body: string): string {
  return `<!doctype html><html><body>${body}</body></html>`;
}

function handler(prefix: string) {
  return (req: http.IncomingMessage, res: http.ServerResponse) => {
    const url = req.url ?? "";
    received.push(`${prefix}${url}`);
    const send = (type: string, body: string) => {
      res.writeHead(200, { "content-type": type });
      res.end(body);
    };
    if (url === "/r1") {
      res.writeHead(302, { location: "/r2" });
      res.end();
    } else if (url === "/r2") {
      res.writeHead(302, { location: `${otherBase}/final` });
      res.end();
    } else if (url === "/links") {
      send(
        "text/html",
        htmlPage(
          `<a id="off" href="${otherBase}/clicked">off</a>` +
            `<a id="pop" target="_blank" href="${otherBase}/popup">pop</a>` +
            `<a id="same" href="/ok">same</a>`,
        ),
      );
    } else if (url === "/scripts") {
      send(
        "text/html",
        htmlPage(
          `<img src="${otherBase}/img.png">` +
            `<script>fetch('${otherBase}/script-fetch').catch(()=>{});` +
            `fetch('/same-fetch').catch(()=>{});` +
            `new Worker('/worker.js');</script>`,
        ),
      );
    } else if (url === "/worker.js") {
      send("text/javascript", `fetch('${otherBase}/from-worker').catch(()=>{});`);
    } else if (url === "/socket") {
      send(
        "text/html",
        htmlPage(
          `<script>window.result='pending';const ws=new WebSocket('${otherBase.replace("http", "ws")}/ws');` +
            `ws.onopen=()=>window.result='open';ws.onclose=()=>{if(window.result==='pending')window.result='closed'};` +
            `ws.onerror=()=>{window.result='closed'};</script>`,
        ),
      );
    } else {
      send("text/html", htmlPage(`page ${url}`));
    }
  };
}

function chromeEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env, USERPROFILE: userInfo().homedir };
  delete env.CHROME_CRASHPAD_PIPE_NAME;
  return env;
}

async function listen(target: http.Server): Promise<string> {
  await new Promise<void>((resolve) => {
    target.listen(0, "127.0.0.1", resolve);
  });
  return `http://127.0.0.1:${(target.address() as AddressInfo).port}`;
}

function callFor(agentId: string, named: string[] = []) {
  let running = true;
  return {
    call: {
      agentId,
      sessionKey: `agent:${agentId}:main`,
      toolName: "browser",
      names: (url: string) => named.includes(url),
      isRunning: () => running,
    },
    end: () => {
      running = false;
    },
  };
}

describe.skipIf(!CHROME)("a governed agent's pages in a real Chrome (T94)", () => {
  let browser: Browser | undefined;
  let chrome: ChildProcess | undefined;
  let profileDir = "";
  let context: BrowserContext;

  beforeAll(async () => {
    server = http.createServer(handler(""));
    other = http.createServer(handler("other:"));
    // WebSocket upgrades reach the server only when the socket was let through.
    other.on("upgrade", (req, socket) => {
      received.push(`other:${req.url} (upgrade)`);
      socket.destroy();
    });
    base = await listen(server);
    otherBase = (await listen(other)).replace("127.0.0.1", "localhost");
    // Started with a debugging port and reached over CDP, as OpenClaw reaches its browser.
    profileDir = mkdtempSync(join(tmpdir(), "t94-chrome-"));
    const port = 19_000 + Math.floor(Math.random() * 1000);
    chrome = spawn(
      CHROME!,
      [
        "--headless=new",
        `--remote-debugging-port=${port}`,
        `--user-data-dir=${profileDir}`,
        "--no-first-run",
        "about:blank",
      ],
      {
        stdio: ["ignore", "ignore", "pipe"],
        // The suite points the home folder at a test directory; Chrome then cannot tell its
        // default profile from --user-data-dir and refuses remote debugging. It gets the real
        // user profile (from the OS, not the environment), and no inherited crashpad pipe.
        env: chromeEnv(),
      },
    );
    let chromeErrors = "";
    chrome.stderr?.on("data", (chunk: Buffer) => {
      chromeErrors += chunk.toString();
    });
    const require = createRequire(import.meta.url);
    const { chromium } = require("playwright-core") as typeof import("playwright-core");
    for (let attempt = 0; attempt < 40 && !browser; attempt += 1) {
      browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`).catch(async () => {
        await new Promise((resolve) => {
          setTimeout(resolve, 250);
        });
        return undefined as unknown as Browser;
      });
    }
    if (!browser) {
      throw new Error(`Chrome did not start (${profileDir}): ${chromeErrors.slice(-600)}`);
    }
  }, 60_000);

  afterAll(async () => {
    await browser?.close().catch(() => undefined);
    chrome?.kill();
    await new Promise((resolve) => {
      setTimeout(resolve, 500);
    });
    rmSync(profileDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
    await new Promise<void>((resolve) => {
      other.close(() => resolve());
    });
  });

  beforeEach(async () => {
    context = await browser!.newContext();
    received.length = 0;
    judged.length = 0;
    refuse = () => false;
    activeCall = undefined;
  });

  afterEach(async () => {
    await context.close();
  });

  async function boundPage(agentId = "demo", named: string[] = []) {
    const page = await context.newPage();
    const { call, end } = callFor(agentId, named);
    activeCall = call;
    await bindGovernedPage(page);
    activeCall = undefined;
    return { page, end };
  }

  async function settle(target: Page, ms = 600): Promise<void> {
    await target.waitForLoadState().catch(() => undefined);
    await target.waitForTimeout(ms);
  }

  it("does not judge the address the running call named (D3), and judges its redirect hops", async () => {
    const { page } = await boundPage("demo", [`${base}/r1`]);
    refuse = (url) => url.endsWith("/final");
    const response = await page.goto(`${base}/r1`);
    expect(response?.status()).toBe(403);
    expect(await page.textContent("body")).toContain("Refused by governance");
    expect(received).toEqual(["/r1", "/r2"]);
    expect(judged.map((entry) => `${entry.via} ${entry.url}`)).toEqual([
      `redirect ${base}/r2`,
      `redirect ${otherBase}/final`,
    ]);
  });

  it("judges the named address once its call has ended", async () => {
    const { page, end } = await boundPage("demo", [`${base}/ok`]);
    end();
    await page.goto(`${base}/ok`);
    expect(judged).toEqual([{ url: `${base}/ok`, via: "navigation", agentId: "demo" }]);
  });

  it("answers a refused clicked link with the refusal page; the server never sees it", async () => {
    const { page } = await boundPage();
    await page.goto(`${base}/links`);
    refuse = (url, via) => via === "navigation" && url.includes("/clicked");
    await page.click("#off");
    await settle(page);
    expect(await page.textContent("body")).toContain(`refused ${otherBase}/clicked`);
    expect(received).not.toContain("other:/clicked");
    expect(judged).toContainEqual({
      url: `${otherBase}/clicked`,
      via: "navigation",
      agentId: "demo",
    });
  });

  it("lets an allowed clicked link load", async () => {
    const { page } = await boundPage();
    await page.goto(`${base}/links`);
    await page.click("#same");
    await settle(page);
    expect(received).toContain("/ok");
  });

  it("judges a page's own requests as page requests and stops the refused ones", async () => {
    const { page } = await boundPage();
    refuse = (url, via) => via === "page" && url.startsWith(otherBase);
    await page.goto(`${base}/scripts`);
    await settle(page, 1200);
    expect(received).toContain("/same-fetch");
    expect(received).toContain("/worker.js");
    for (const path of ["/img.png", "/script-fetch", "/from-worker"]) {
      expect(received).not.toContain(`other:${path}`);
      expect(judged).toContainEqual({ url: `${otherBase}${path}`, via: "page", agentId: "demo" });
    }
  });

  it("closes a refused WebSocket before it connects, and lets an allowed one through", async () => {
    const { page } = await boundPage();
    refuse = (url) => url.startsWith("ws://");
    await page.goto(`${base}/socket`);
    await page.waitForFunction(() => (window as { result?: string }).result !== "pending");
    expect(received.some((entry) => entry.includes("upgrade"))).toBe(false);
    expect(judged.some((entry) => entry.via === "page" && entry.url.startsWith("ws://"))).toBe(
      true,
    );

    refuse = () => false;
    received.length = 0;
    await page.goto(`${base}/socket`);
    await settle(page, 800);
    expect(received.some((entry) => entry.includes("upgrade"))).toBe(true);
  });

  it("judges a popup's document for the opener's agent and refuses it unsent", async () => {
    const { page } = await boundPage("opener-agent");
    await page.goto(`${base}/links`);
    refuse = (url) => url.includes("/popup");
    const popupEvent = context.waitForEvent("page");
    await page.click("#pop");
    const popup = await popupEvent;
    await settle(popup);
    expect(received).not.toContain("other:/popup");
    expect(judged).toContainEqual({
      url: `${otherBase}/popup`,
      via: "navigation",
      agentId: "opener-agent",
    });
  });

  it("binds the popup itself to the opener's agent, so the popup page's own requests are judged", async () => {
    const { page } = await boundPage("opener-agent");
    await page.goto(`${base}/links`);
    const popupEvent = context.waitForEvent("page");
    await page.evaluate((url) => {
      window.open(url, "_blank");
    }, `${base}/scripts`);
    const popup = await popupEvent;
    await settle(popup, 1500);
    expect(judged).toContainEqual({
      url: `${otherBase}/script-fetch`,
      via: "page",
      agentId: "opener-agent",
    });
  });

  it("leaves a page no governed call has touched alone", async () => {
    await boundPage();
    const untouched = await context.newPage();
    judged.length = 0;
    await untouched.goto(`${base}/scripts`);
    await settle(untouched, 800);
    expect(judged).toEqual([]);
    expect(received).toContain("other:/script-fetch");
  });

  it("does nothing outside a governed call", async () => {
    const page = await context.newPage();
    await bindGovernedPage(page);
    await page.goto(`${base}/r1`);
    expect(judged).toEqual([]);
    expect(received).toEqual(["/r1", "/r2", "other:/final"]);
  });

  it("still sees a page's requests while the upstream navigate guard is installed", async () => {
    const { page } = await boundPage("demo", [`${base}/scripts`]);
    refuse = (url, via) => via === "page" && url.startsWith(otherBase);
    await gotoPageWithNavigationGuard({
      cdpUrl: "http://127.0.0.1:9",
      page,
      url: `${base}/scripts`,
      timeoutMs: 10_000,
      ssrfPolicy: { dangerouslyAllowPrivateNetwork: true },
    });
    await settle(page, 1200);
    expect(received).not.toContain("other:/script-fetch");
    expect(judged).toContainEqual({
      url: `${otherBase}/script-fetch`,
      via: "page",
      agentId: "demo",
    });
  });
});
