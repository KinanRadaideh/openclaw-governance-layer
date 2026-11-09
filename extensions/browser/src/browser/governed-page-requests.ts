/**
 * Governance of the requests a page makes once an agent drives it (T94).
 *
 * The gate judges the address the agent names in `open` or `navigate`. A page then goes on to
 * request things the agent never named: redirect hops, links it follows, forms, popups, and the
 * page's own scripts, images, frames, workers and sockets. Each of those is judged here, before it
 * is sent, for the agent whose governed call last drove the page (design:
 * `mg/T94-FOLLOW-ON-REQUESTS-DESIGN.md`, D1 to D12; the verdict comes from core through
 * `judgeFollowOnRequest`).
 *
 * Three mechanisms, because no one of them sees everything (measured, design §2):
 * - **a context route**: every request a page, a frame, a worker, a service worker or a popup
 *   starts. Main-frame documents are judged in full (`navigation`); the rest by denials only
 *   (`page`).
 * - **a CDP `Fetch` session per page**: redirect hops, which Playwright continues without routing.
 *   A main-frame document hop is judged in full (`redirect`); any other hop by denials only.
 * - **a page WebSocket route**: WebSockets, which neither of the above sees (`page`).
 *
 * A page no governed call has touched is not judged: it is not an agent's (an operator's own tab).
 */
import type {
  BrowserContext,
  CDPSession,
  Page,
  Request,
  Route,
  WebSocketRoute,
} from "playwright-core";
import {
  currentGovernedCall,
  judgeFollowOnRequest,
  type FollowOnVerdict,
  type FollowOnVia,
  type GovernedNetworkCall,
} from "../sdk-security-runtime.js";

/** The governed call that last drove a page (D4). */
const pageOwners = new WeakMap<Page, GovernedNetworkCall>();
/** Pages whose agent is known, per context: what an unattributable request is judged for (D4). */
const contextPages = new WeakMap<BrowserContext, Set<Page>>();
const guardedContexts = new WeakMap<BrowserContext, Promise<void>>();
const guardedPages = new WeakMap<Page, Promise<void>>();

/**
 * Bind `page` to the governed call running here, if any, and make sure its requests are judged.
 * Called wherever a browser call resolves or creates a page. Outside a governed call (the CLI,
 * the operator's own use of the browser) it does nothing.
 */
export async function bindGovernedPage(page: Page): Promise<void> {
  const call = currentGovernedCall();
  if (!call) {
    return;
  }
  adopt(page, call);
  await guardContext(page.context());
  await guardPage(page);
}

function adopt(page: Page, call: GovernedNetworkCall): void {
  pageOwners.set(page, call);
  const context = page.context();
  let pages = contextPages.get(context);
  if (!pages) {
    pages = new Set();
    contextPages.set(context, pages);
  }
  pages.add(page);
  page.once("close", () => pages?.delete(page));
}

/**
 * A page not yet bound may be a popup whose opener is: adopt it now, on its own request, so no
 * request of the popup's can slip past while the `page` event's adoption is still on its way.
 */
async function adoptFromOpener(page: Page | undefined): Promise<void> {
  if (!page || pageOwners.has(page)) {
    return;
  }
  const opener = await page.opener().catch(() => null);
  const owner = opener ? pageOwners.get(opener) : undefined;
  if (owner) {
    adopt(page, owner);
    void guardPage(page);
  }
}

/** The calls a request is judged for: its page's agent, or every agent in the context (D4). */
function ownersFor(context: BrowserContext, page: Page | undefined): GovernedNetworkCall[] {
  const own = page ? pageOwners.get(page) : undefined;
  if (own) {
    return [own];
  }
  if (page) {
    // A page no governed call has touched, and no opener that was: not an agent's.
    return [];
  }
  const owners = new Map<string, GovernedNetworkCall>();
  for (const candidate of contextPages.get(context) ?? []) {
    const owner = pageOwners.get(candidate);
    if (owner) {
      owners.set(`${owner.agentId ?? ""}\u0000${owner.sessionKey ?? ""}`, owner);
    }
  }
  return [...owners.values()];
}

/** Judged for every owner; the first refusal stands (D4). */
async function judgeForAll(
  owners: readonly GovernedNetworkCall[],
  url: string,
  via: FollowOnVia,
): Promise<FollowOnVerdict> {
  const verdicts = await Promise.all(
    owners.map((owner) =>
      judgeFollowOnRequest(
        {
          ...(owner.agentId ? { agentId: owner.agentId } : {}),
          ...(owner.sessionKey ? { sessionKey: owner.sessionKey } : {}),
          toolName: owner.toolName,
        },
        { url, via },
      ),
    ),
  );
  return verdicts.find((verdict) => !verdict.allowed) ?? { allowed: true };
}

function escapeHtml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

/**
 * The page a refused document is answered with, locally: nothing is sent to the destination, and
 * the agent's next snapshot says why (D7).
 */
export function governanceRefusalPage(reason: string): string {
  return (
    '<!doctype html><html><head><meta charset="utf-8"><title>Refused by governance</title>' +
    "</head><body><h1>Refused by governance</h1>" +
    `<p>${escapeHtml(reason)}</p>` +
    "<p>Nothing was sent to this address.</p></body></html>"
  );
}

function pageOfRequest(request: Request): Page | undefined {
  try {
    return request.frame().page();
  } catch {
    // A service worker's request, or a popup's first document before Playwright names its
    // frame: unattributable, judged for every agent in the context (D4).
    return undefined;
  }
}

function isMainFrameDocument(request: Request, page: Page | undefined): boolean {
  let navigation: boolean;
  try {
    navigation = request.isNavigationRequest() || request.resourceType() === "document";
  } catch {
    return false;
  }
  if (!navigation) {
    return false;
  }
  if (!page) {
    // A popup's first document is the only unattributable navigation; judge it as one.
    try {
      return request.serviceWorker() === null;
    } catch {
      return true;
    }
  }
  try {
    return request.frame() === page.mainFrame();
  } catch {
    return true;
  }
}

async function settle(action: Promise<unknown>): Promise<void> {
  // The request may be gone (page closed, navigation superseded): nothing left to decide.
  await action.catch(() => undefined);
}

function guardContext(context: BrowserContext): Promise<void> {
  const existing = guardedContexts.get(context);
  if (existing) {
    return existing;
  }
  const installing = (async () => {
    // A popup belongs to the agent that drove its opener (D4).
    context.on("page", (popup) => {
      void popup
        .opener()
        .then(async (opener) => {
          const owner = opener ? pageOwners.get(opener) : undefined;
          if (owner) {
            adopt(popup, owner);
            await guardPage(popup);
          }
        })
        .catch(() => undefined);
    });
    await context.route("**", (route, request) => handleRoute(context, route, request));
  })();
  guardedContexts.set(context, installing);
  return installing;
}

async function handleRoute(context: BrowserContext, route: Route, request: Request): Promise<void> {
  const page = pageOfRequest(request);
  await adoptFromOpener(page);
  const owners = ownersFor(context, page);
  if (owners.length === 0) {
    await settle(route.fallback());
    return;
  }
  const url = request.url();
  const via: FollowOnVia = isMainFrameDocument(request, page) ? "navigation" : "page";
  // The address the running call named was judged by the gate, perhaps allowed by a person;
  // it is not judged a second time (D3). Its redirects still are.
  if (via === "navigation" && owners.every((owner) => owner.isRunning() && owner.names(url))) {
    await settle(route.fallback());
    return;
  }
  const verdict = await judgeForAll(owners, url, via);
  if (verdict.allowed) {
    await settle(route.fallback());
  } else if (via === "navigation") {
    await settle(
      route.fulfill({
        status: 403,
        contentType: "text/html; charset=utf-8",
        body: governanceRefusalPage(verdict.reason),
      }),
    );
  } else {
    await settle(route.abort("blockedbyclient"));
  }
}

function guardPage(page: Page): Promise<void> {
  const existing = guardedPages.get(page);
  if (existing) {
    return existing;
  }
  const installing = (async () => {
    await page.routeWebSocket(/.*/, (socket) => handleWebSocket(page, socket));
    await guardRedirects(page);
  })().catch(() => {
    // A page closed while it was being bound has nothing left to guard.
  });
  guardedPages.set(page, installing);
  return installing;
}

async function handleWebSocket(page: Page, socket: WebSocketRoute): Promise<void> {
  const owners = ownersFor(page.context(), page);
  const verdict =
    owners.length === 0
      ? { allowed: true as const }
      : await judgeForAll(owners, socket.url(), "page");
  if (verdict.allowed) {
    socket.connectToServer();
    return;
  }
  await settle(socket.close({ code: 1008, reason: "Refused by governance" }));
}

type RequestPausedEvent = {
  requestId: string;
  request: { url: string };
  frameId: string;
  resourceType: string;
  redirectedRequestId?: string;
};

/**
 * Redirect hops, through the DevTools protocol: Playwright continues a hop without routing it
 * (measured, design §2). Every request pauses here; one that is not a hop continues at once.
 */
async function guardRedirects(page: Page): Promise<void> {
  const session: CDPSession = await page.context().newCDPSession(page);
  const tree = (await session.send("Page.getFrameTree")) as {
    frameTree: { frame: { id: string } };
  };
  const mainFrameId = tree.frameTree.frame.id;
  session.on("Fetch.requestPaused", (event: RequestPausedEvent) => {
    void handlePaused(page, session, mainFrameId, event);
  });
  await session.send("Fetch.enable", { patterns: [{ urlPattern: "*", requestStage: "Request" }] });
}

async function handlePaused(
  page: Page,
  session: CDPSession,
  mainFrameId: string,
  event: RequestPausedEvent,
): Promise<void> {
  const owners = event.redirectedRequestId ? ownersFor(page.context(), page) : [];
  if (owners.length === 0) {
    await settle(session.send("Fetch.continueRequest", { requestId: event.requestId }));
    return;
  }
  const document = event.resourceType === "Document" && event.frameId === mainFrameId;
  const verdict = await judgeForAll(owners, event.request.url, document ? "redirect" : "page");
  if (verdict.allowed) {
    await settle(session.send("Fetch.continueRequest", { requestId: event.requestId }));
  } else if (document) {
    await settle(
      session.send("Fetch.fulfillRequest", {
        requestId: event.requestId,
        responseCode: 403,
        responseHeaders: [{ name: "Content-Type", value: "text/html; charset=utf-8" }],
        body: Buffer.from(governanceRefusalPage(verdict.reason), "utf8").toString("base64"),
      }),
    );
  } else {
    await settle(
      session.send("Fetch.failRequest", {
        requestId: event.requestId,
        errorReason: "BlockedByClient",
      }),
    );
  }
}
