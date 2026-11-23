// Live probe of the T47 fixes against the isolated fixture Gateway (2026-11-23).
// node live-probe.mjs <fixtureDir> <port>
import fs from "node:fs";

const [fx, port = "18847"] = process.argv.slice(2);
const acc = JSON.parse(fs.readFileSync(`${fx}/accounts.json`, "utf8"));
const base = `http://127.0.0.1:${port}/control-ui/governance`;
const origin = `http://127.0.0.1:${port}`;

async function login(who) {
  const a = acc[who];
  const r = await fetch(`${base}/login`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${acc.token}`,
      "content-type": "application/json",
      origin,
    },
    body: JSON.stringify({ username: a.u, password: a.p }),
  });
  if (r.status !== 200) {
    throw new Error(`login ${who}: ${r.status} ${await r.text()}`);
  }
  const cookie = (r.headers.get("set-cookie") ?? "").split(";")[0];
  return async (method, route, body) => {
    const res = await fetch(`${base}/${route}`, {
      method,
      headers: {
        authorization: `Bearer ${acc.token}`,
        cookie,
        origin,
        "content-type": "application/json",
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const text = await res.text();
    let json;
    try {
      json = JSON.parse(text);
    } catch {
      json = text;
    }
    return { status: res.status, body: json };
  };
}

const show = (label, v) => console.log(`${label}:`, JSON.stringify(v));
const admin = await login("admin");

// 2.4.6: a global rule names the registered agents although none has a rule or a session
const added = await admin("POST", "policy/rules", {
  resourceKind: "command",
  pattern: "^ls$",
  description: "live probe global",
});
show("add global rule", added.status);
const policy = await admin("GET", "policy");
const globalRule = (policy.body.rules ?? []).find((r) => r.pattern === "^ls$");
const who = await admin("GET", `policy/rule-agents?ruleId=${globalRule.id}`);
show("2.4.6 rule-agents", {
  status: who.status,
  agentIds: who.body.agentIds,
  scope: who.body.scope,
});

// 2.7.10: a read rule and a write rule on one path are different grants
const readRule = await admin("POST", "policy/rules", {
  resourceKind: "path",
  access: "read",
  pattern: "^/tmp/probe$",
  description: "live probe read",
  agentId: "zebra-quill",
  ttlMinutes: 60,
});
show("add read rule", readRule.status);
const writeCheck = await admin("POST", "policy/rules", {
  resourceKind: "path",
  access: "write",
  pattern: "^/tmp/probe$",
  description: "live probe write",
  agentId: "zebra-quill",
  ttlMinutes: 120,
  dryRun: true,
});
show("2.7.10 write vs read (expect no conflicts)", writeCheck.body.conflicts);
const readAgain = await admin("POST", "policy/rules", {
  resourceKind: "path",
  access: "read",
  pattern: "^/tmp/probe$",
  description: "live probe read again",
  agentId: "zebra-quill",
  ttlMinutes: 120,
  dryRun: true,
});
show(
  "same direction (expect an extension warning)",
  readAgain.body.conflicts?.map((c) => c.kind),
);

// 2.6.7: an unknown id is refused by the server, as the new advisory now says
const unknown = await admin("POST", "kill", { agentId: "nobody-here", locked: true });
show("2.6.7 kill unknown id", { status: unknown.status, msg: unknown.body?.error?.message });

// 2.6.4: the refusal for a locked agent names who can release it. The check runs before any model.
const lock = await admin("POST", "kill", { agentId: "ZEBRA-QUILL", locked: true });
show("2.6.5 lock typed in capitals", { status: lock.status, agentId: lock.body?.agentId });
const prompt = await admin("POST", "agent/prompt", { agentId: "zebra-quill", message: "hello" });
show("2.6.4 prompt a locked agent", {
  status: prompt.status,
  error: prompt.body?.error ?? prompt.body?.error?.message,
});
const release = await admin("POST", "kill", { agentId: "zebra-quill", locked: false });
show("release", release.status);
