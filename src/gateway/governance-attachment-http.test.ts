// T14's remaining two surfaces, end to end through the HTTP layer an operator
// actually reaches (upload) and the one the dashboard sends prompts through.
//
// **Why this file exists beside `attachment-store.test.ts`.** That suite tests
// the store: the size cap biting mid-stream, the per-account quota, sniffed
// types, content addressing, the agent being unable to read the directory. All
// true, and all measured one layer below anything an operator touches. The
// project's three-surface rule is a claim about the *feature*, and the feature
// is "an operator attaches a file to a prompt and the ledger records what it
// was", which runs through a role check, an agent-scope check, a raw-body
// read, the store, then a second request that resolves hashes back to facts.
//
// The most important assertion in the file is the one about **whose facts get
// recorded**: the client names a hash, and every number and string that reaches
// the ledger is read from the store's own index rather than from the request.
// Without that, the audit trail would be transcribing a claim while reading
// like an observation.
import { mkdtemp, rm } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { clearAgentRunner, registerAgentRunner } from "../governance/agent-runner.js";
import { listAttachments, MAX_ATTACHMENT_BYTES } from "../governance/attachment-store.js";
import { tailLedger } from "../governance/audit-ledger.js";
import { resetLedgerKeyCacheForTests } from "../governance/ledger-key.js";
import { savePolicy } from "../governance/policy-store.js";
import { defaultPolicyDocument } from "../governance/policy-types.js";
import type { GovernanceRole } from "../governance/roles.js";
import type { GovernanceSession } from "../governance/session-tokens.js";
import { seedGroupWithAgents } from "../governance/test-group.js";
import { handleGovernanceApiRequest } from "./governance-dashboard-api.js";

let dir: string;

/** The organisation this suite's agents belong to (M5). Per-group storage means
 * every call names a group, and mandatory registration means the gate refuses an
 * agent it has no record of, so the fixture creates a real one. */
let TEST_GROUP: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "governance-attach-http-"));
  process.env.OPENCLAW_GOVERNANCE_DIR = dir;
  TEST_GROUP = await seedGroupWithAgents(["agent-a"]);
  resetLedgerKeyCacheForTests();
  await savePolicy(TEST_GROUP, { ...defaultPolicyDocument(), mode: "enforce" });
  registerAgentRunner(async () => ({ ok: true, reply: "done", ending: "completed" }));
});

afterEach(async () => {
  delete process.env.OPENCLAW_GOVERNANCE_DIR;
  resetLedgerKeyCacheForTests();
  clearAgentRunner();
  await rm(dir, { recursive: true, force: true });
});

function session(
  role: GovernanceRole,
  username: string = role,
  assignedAgents: string[] = [],
): GovernanceSession {
  return {
    token: `token-${username}`,
    userId: `id-${username}`,
    username,
    role,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
    assignedAgents,
    groupId: TEST_GROUP,
  };
}

type Reply = { status: number; body: any };

function collect(): { res: ServerResponse; read: () => Reply } {
  let status = 0;
  let text = "";
  const res = {
    statusCode: 200,
    setHeader() {},
    getHeader() {
      return undefined;
    },
    writeHead(code: number) {
      status = code;
      return this;
    },
    end(chunk?: unknown) {
      if (typeof chunk === "string") {
        text += chunk;
      } else if (chunk instanceof Uint8Array) {
        text += Buffer.from(chunk).toString("utf8");
      } else if (chunk !== undefined && chunk !== null) {
        text += JSON.stringify(chunk);
      }
      return this;
    },
    write(chunk?: unknown) {
      if (typeof chunk === "string") {
        text += chunk;
      } else if (chunk instanceof Uint8Array) {
        text += Buffer.from(chunk).toString("utf8");
      } else if (chunk !== undefined && chunk !== null) {
        text += JSON.stringify(chunk);
      }
      return true;
    },
  } as unknown as ServerResponse;
  return {
    res,
    read: () => {
      let parsed: unknown;
      try {
        parsed = text ? JSON.parse(text) : undefined;
      } catch {
        parsed = text;
      }
      return { status: status || (res as { statusCode: number }).statusCode, body: parsed };
    },
  };
}

/** Posts a JSON body to a route, for the release endpoint. */
async function postJson(
  actor: GovernanceSession | undefined,
  route: string,
  body: unknown,
): Promise<Reply> {
  const req = Readable.from([Buffer.from(JSON.stringify(body))]) as unknown as IncomingMessage;
  Object.assign(req, {
    method: "POST",
    url: `/control-ui/governance/${route}`,
    headers: { "content-type": "application/json" },
  });
  const { res, read } = collect();
  const handled = await handleGovernanceApiRequest(
    req,
    res,
    `/control-ui/governance/${route}`,
    actor,
  );
  return handled ? read() : { status: 599, body: undefined };
}

/** Uploads with a raw, unencoded name header, to exercise the validator. */
async function uploadWithRawName(
  actor: GovernanceSession,
  agentId: string,
  rawHeader: string | string[],
): Promise<Reply> {
  const req = Readable.from([Buffer.from(PNG)]) as unknown as IncomingMessage;
  Object.assign(req, {
    method: "POST",
    url: "/control-ui/governance/agent/attachment",
    headers: { "x-agent-id": agentId, "x-attachment-name": rawHeader },
  });
  const { res, read } = collect();
  const handled = await handleGovernanceApiRequest(
    req,
    res,
    "/control-ui/governance/agent/attachment",
    actor,
  );
  return handled ? read() : { status: 599, body: undefined };
}

/** Uploads raw bytes exactly as the browser does: body is the file, name in a header. */
async function upload(
  actor: GovernanceSession | undefined,
  agentId: string,
  name: string,
  bytes: Uint8Array,
  chunks = 1,
): Promise<Reply> {
  // Split across chunks so the stream really is a stream. A single-chunk body
  // would let a "read it all then check" implementation pass.
  const size = Math.ceil(bytes.byteLength / chunks) || 1;
  const parts: Buffer[] = [];
  for (let at = 0; at < bytes.byteLength; at += size) {
    parts.push(Buffer.from(bytes.slice(at, at + size)));
  }
  const req = Readable.from(
    parts.length > 0 ? parts : [Buffer.alloc(0)],
  ) as unknown as IncomingMessage;
  Object.assign(req, {
    method: "POST",
    url: "/control-ui/governance/agent/attachment",
    headers: {
      "content-type": "application/octet-stream",
      "x-agent-id": agentId,
      "x-attachment-name": Buffer.from(name, "utf8").toString("base64"),
    },
  });
  const { res, read } = collect();
  const handled = await handleGovernanceApiRequest(
    req,
    res,
    "/control-ui/governance/agent/attachment",
    actor,
  );
  return handled ? read() : { status: 599, body: undefined };
}

async function prompt(actor: GovernanceSession | undefined, body: unknown): Promise<Reply> {
  const req = Readable.from([Buffer.from(JSON.stringify(body))]) as unknown as IncomingMessage;
  Object.assign(req, {
    method: "POST",
    url: "/control-ui/governance/agent/prompt",
    headers: { "content-type": "application/json" },
  });
  const { res, read } = collect();
  const handled = await handleGovernanceApiRequest(
    req,
    res,
    "/control-ui/governance/agent/prompt",
    actor,
  );
  return handled ? read() : { status: 599, body: undefined };
}

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);

describe("uploading an attachment over HTTP", () => {
  it("stores the file and returns what the ledger will record", async () => {
    const reply = await upload(session("user", "kinan", ["agent-a"]), "agent-a", "shot.png", PNG);
    expect(reply.status).toBe(200);
    expect(reply.body.attachment.bytes).toBe(PNG.byteLength);
    // Sniffed, not taken from the Content-Type the caller sent, which was
    // application/octet-stream.
    expect(reply.body.attachment.mimeType).toBe("image/png");
    expect(reply.body.attachment.declaredName).toBe("shot.png");
    expect(reply.body.attachment.sha256).toMatch(/^[0-9a-f]{64}$/);
    // Never the content, on any surface.
    expect(JSON.stringify(reply.body)).not.toContain("data:");
    expect(reply.body.attachment.content).toBeUndefined();
  });

  it("keeps a non-ASCII filename intact, which is why the header is base64", async () => {
    // A header cannot carry arbitrary UTF-8. Sending this name raw would have
    // been mangled or rejected by the HTTP layer before the route saw it, and
    // most of the world's filenames look like this one.
    const reply = await upload(
      session("user", "kinan", ["agent-a"]),
      "agent-a",
      "تقرير-الربع.png",
      PNG,
    );
    expect(reply.status).toBe(200);
    expect(reply.body.attachment.declaredName).toBe("تقرير-الربع.png");
  });

  it("refuses a Viewer, who may watch and change nothing", async () => {
    const reply = await upload(session("viewer", "val", ["agent-a"]), "agent-a", "x.png", PNG);
    expect(reply.status).toBe(403);
    expect(await listAttachments(TEST_GROUP)).toHaveLength(0);
  });

  it("refuses an agent the caller does not manage", async () => {
    const reply = await upload(session("user", "kinan", ["agent-a"]), "agent-b", "x.png", PNG);
    expect(reply.status).toBe(403);
    expect(await listAttachments(TEST_GROUP)).toHaveLength(0);
  });

  it("requires the agent id, rather than defaulting to one", async () => {
    const req = Readable.from([Buffer.from(PNG)]) as unknown as IncomingMessage;
    Object.assign(req, {
      method: "POST",
      url: "/control-ui/governance/agent/attachment",
      headers: {},
    });
    const { res, read } = collect();
    await handleGovernanceApiRequest(
      req,
      res,
      "/control-ui/governance/agent/attachment",
      session("user", "kinan", ["agent-a"]),
    );
    expect(read().status).toBe(400);
  });

  it("refuses a file over the cap, and stores nothing", async () => {
    // Chunked, so this exercises the refusal happening *during* the read. The
    // store's cap exists to stop an uploader choosing how much memory the
    // process allocates, which a check after buffering would not do.
    const tooBig = new Uint8Array(MAX_ATTACHMENT_BYTES + 1024);
    const reply = await upload(
      session("user", "kinan", ["agent-a"]),
      "agent-a",
      "big.bin",
      tooBig,
      64,
    );
    expect(reply.status).toBe(413);
    expect(await listAttachments(TEST_GROUP)).toHaveLength(0);
  });
});

describe("sending a prompt that names attachments", () => {
  async function uploadOne(actor: GovernanceSession, name = "shot.png"): Promise<string> {
    const reply = await upload(actor, "agent-a", name, PNG);
    expect(reply.status).toBe(200);
    return reply.body.attachment.sha256 as string;
  }

  it("records the file against the prompt, by hash and never by content", async () => {
    const actor = session("user", "kinan", ["agent-a"]);
    const sha256 = await uploadOne(actor);
    const reply = await prompt(actor, {
      agentId: "agent-a",
      message: "look at this",
      attachments: [sha256],
    });
    expect(reply.status).toBe(200);
    const entries = await tailLedger(TEST_GROUP, 50);
    const promptEntry = entries.find((entry) => entry.resource?.includes("shot.png"));
    expect(promptEntry).toBeDefined();
    expect(promptEntry?.resource).toContain(sha256);
    expect(promptEntry?.resource).toContain("image/png");
  });

  it("reads the facts from the store, not from the request", async () => {
    // The security-relevant assertion. A caller who could declare the size and
    // type would be writing their own description into a tamper-evident log,
    // the trail would read like an observation and record an assertion.
    const actor = session("user", "kinan", ["agent-a"]);
    const sha256 = await uploadOne(actor);
    const reply = await prompt(actor, {
      agentId: "agent-a",
      message: "look at this",
      // A well-formed hash wrapped in lies about everything else.
      attachments: [sha256],
      attachmentBytes: 999_999_999,
      attachmentMime: "text/plain",
    });
    expect(reply.status).toBe(200);
    const entries = await tailLedger(TEST_GROUP, 50);
    const promptEntry = entries.find((entry) => entry.resource?.includes("shot.png"));
    expect(promptEntry?.resource).toContain(`${PNG.byteLength} bytes`);
    expect(promptEntry?.resource).toContain("image/png");
    expect(promptEntry?.resource).not.toContain("999999999");
    expect(promptEntry?.resource).not.toContain("text/plain");
  });

  it("refuses a hash the caller never uploaded", async () => {
    const actor = session("user", "kinan", ["agent-a"]);
    const reply = await prompt(actor, {
      agentId: "agent-a",
      message: "hi",
      attachments: ["a".repeat(64)],
    });
    expect(reply.status).toBe(404);
  });

  it("refuses another account's attachment, and says nothing about whether it exists", async () => {
    // Accepting any hash would make this route an existence oracle: for a known
    // file the hash is not a guess, so a caller could confirm whether anybody
    // had ever sent it. The same reasoning the login response uses.
    const owner = session("user", "kinan", ["agent-a"]);
    const other = session("user", "malek", ["agent-a"]);
    const sha256 = await uploadOne(owner);

    const mine = await prompt(other, {
      agentId: "agent-a",
      message: "hi",
      attachments: [sha256],
    });
    const invented = await prompt(other, {
      agentId: "agent-a",
      message: "hi",
      attachments: ["b".repeat(64)],
    });
    expect(mine.status).toBe(404);
    // Byte-identical replies for "exists but not yours" and "does not exist".
    expect(JSON.stringify(mine.body)).toBe(JSON.stringify(invented.body));
  });

  it("rejects a value that is not a SHA-256 string", async () => {
    const actor = session("user", "kinan", ["agent-a"]);
    for (const bad of ["../../etc/passwd", "", "Z".repeat(64), 42, null]) {
      const reply = await prompt(actor, {
        agentId: "agent-a",
        message: "hi",
        attachments: [bad],
      });
      expect(reply.status).toBe(400);
    }
  });

  it("rejects a non-array, rather than coercing it", async () => {
    const actor = session("user", "kinan", ["agent-a"]);
    const reply = await prompt(actor, {
      agentId: "agent-a",
      message: "hi",
      attachments: "a".repeat(64),
    });
    expect(reply.status).toBe(400);
  });

  it("bounds how many one prompt may name", async () => {
    const actor = session("user", "kinan", ["agent-a"]);
    const reply = await prompt(actor, {
      agentId: "agent-a",
      message: "hi",
      attachments: Array.from({ length: 11 }, () => "a".repeat(64)),
    });
    expect(reply.status).toBe(400);
  });

  it("still sends a prompt with no attachments at all", async () => {
    // The path everything else uses. If naming none is not identical to the
    // behaviour before this feature existed, the feature has cost something it
    // was not supposed to.
    const actor = session("user", "kinan", ["agent-a"]);
    const reply = await prompt(actor, { agentId: "agent-a", message: "hello" });
    expect(reply.status).toBe(200);
    expect(reply.body.ok).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// QA round seventeen. Regressions for what reviewing this feature found.
// ---------------------------------------------------------------------------

describe("round 17 regressions", () => {
  const actor = () => session("user", "kinan", ["agent-a"]);

  it("refuses a malformed name header instead of decoding it to mojibake (112)", async () => {
    // `Buffer.from(value, "base64")` never throws. It discards anything
    // outside the alphabet. The first version of this route wrapped it in a
    // try/catch, which read as validation and was unreachable code.
    const reply = await uploadWithRawName(actor(), "agent-a", "not!!base64");
    expect(reply.status).toBe(400);
    expect(await listAttachments(TEST_GROUP)).toHaveLength(0);
  });

  it("refuses a duplicated name header rather than picking one (112)", async () => {
    // Node hands a repeated header over as an array. Joined with ", " it used
    // to decode to a run of NUL bytes, because base64 discards both `,` and
    // the space. A filename of control characters, in a tamper-evident log.
    const reply = await uploadWithRawName(actor(), "agent-a", ["QQ==", "QQ=="]);
    expect(reply.status).toBe(400);
    expect(await listAttachments(TEST_GROUP)).toHaveLength(0);
  });

  it("refuses a name carrying control characters (112)", async () => {
    const evil = Buffer.from("report.pdf .exe", "utf8").toString("base64");
    const reply = await uploadWithRawName(actor(), "agent-a", evil);
    expect(reply.status).toBe(400);
  });

  it("still accepts every legitimately encoded name (112 did not overreach)", async () => {
    for (const name of ["a.png", "تقرير.png", "one two three.png", "ünïcödé.png"]) {
      const encoded = Buffer.from(name, "utf8").toString("base64");
      const reply = await uploadWithRawName(actor(), "agent-a", encoded);
      expect(reply.status, name).toBe(200);
      expect(reply.body.attachment.declaredName).toBe(name);
    }
  });

  it("bounds the agent id, which canManageAgent cannot do for an Administrator (115)", async () => {
    // An Administrator manages every agent by role, so the scope check cannot
    // reject an invented id, without a length rule the string lands in the
    // store index and from there in the ledger.
    const admin = session("administrator", "amina");
    const reply = await upload(admin, "a".repeat(500), "x.png", PNG);
    expect(reply.status).toBe(400);
    expect(await listAttachments(TEST_GROUP)).toHaveLength(0);
  });

  it("gives back the quota when an unsent upload is released (113)", async () => {
    const who = actor();
    const up = await upload(who, "agent-a", "wrong.png", PNG);
    expect(up.status).toBe(200);
    expect(await listAttachments(TEST_GROUP)).toHaveLength(1);

    const released = await postJson(who, "agent/attachment/release", {
      sha256: up.body.attachment.sha256,
    });
    expect(released.status).toBe(200);
    expect(await listAttachments(TEST_GROUP)).toHaveLength(0);
  });

  it("refuses to release an attachment a prompt already named (113)", async () => {
    // The safety argument for having a delete at all. Once a ledger entry
    // names the file, the store is the evidence behind that entry.
    const who = actor();
    const up = await upload(who, "agent-a", "sent.png", PNG);
    const sent = await prompt(who, {
      agentId: "agent-a",
      message: "here",
      attachments: [up.body.attachment.sha256],
    });
    expect(sent.status).toBe(200);

    const released = await postJson(who, "agent/attachment/release", {
      sha256: up.body.attachment.sha256,
    });
    expect(released.status).toBe(409);
    expect(await listAttachments(TEST_GROUP)).toHaveLength(1);
  });

  it("will not let one account release another's upload, or learn it exists (113)", async () => {
    const owner = actor();
    const other = session("user", "malek", ["agent-a"]);
    const up = await upload(owner, "agent-a", "theirs.png", PNG);

    const theirs = await postJson(other, "agent/attachment/release", {
      sha256: up.body.attachment.sha256,
    });
    const invented = await postJson(other, "agent/attachment/release", {
      sha256: "c".repeat(64),
    });
    expect(theirs.status).toBe(404);
    expect(JSON.stringify(theirs.body)).toBe(JSON.stringify(invented.body));
    expect(await listAttachments(TEST_GROUP)).toHaveLength(1);
  });

  it("counts the quota under one spelling of an account (114)", async () => {
    // `account-name.ts` states the rule: the canonical form anywhere an account
    // is a key. The store was the one module of nine that used the display
    // spelling, so a session under a different casing would have had its own
    // fresh quota and been unable to see its own uploads.
    const lower = session("user", "kinan", ["agent-a"]);
    const upper = session("user", "KINAN", ["agent-a"]);
    const up = await upload(lower, "agent-a", "mine.png", PNG);
    const released = await postJson(upper, "agent/attachment/release", {
      sha256: up.body.attachment.sha256,
    });
    expect(released.status).toBe(200);
  });
});
