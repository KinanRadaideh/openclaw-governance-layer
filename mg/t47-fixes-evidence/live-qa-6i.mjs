// Live QA of the 2026-11-24 fixes against the isolated fixture Gateway.
// node live-qa-6i.mjs <fixtureDir> <port>
import fs from "node:fs";

const [fx, port = "18847"] = process.argv.slice(2);
const acc = JSON.parse(fs.readFileSync(`${fx}/accounts.json`, "utf8"));
const base = `http://127.0.0.1:${port}/control-ui/governance`;
const origin = `http://127.0.0.1:${port}`;

async function login(who) {
  const a = acc[who];
  const r = await fetch(`${base}/login`, {
    method: "POST",
    headers: { authorization: `Bearer ${acc.token}`, "content-type": "application/json", origin },
    body: JSON.stringify({ username: a.u, password: a.p }),
  });
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
    try {
      return { status: res.status, body: JSON.parse(text) };
    } catch {
      return { status: res.status, body: text };
    }
  };
}

const show = (label, v) => console.log(`${label}: ${JSON.stringify(v)}`);
const admin = await login("admin");

// 6i.16: a broken regular expression says what is wrong and what to check
const broken = await admin("POST", "policy/rules", {
  resourceKind: "command",
  pattern: "^(unclosed",
  description: "live QA 6i.16",
});
show("6i.16 broken regex", broken);

// 6i.17: a folder grant with an exception, then the exception removed
const grant = await admin("POST", "policy/folder-grant", {
  folder: "t47-qa",
  description: "live QA 6i.17",
  exceptions: ["t47-qa/secrets"],
});
show("6i.17 grant status", grant.status);
let policy = await admin("GET", "policy");
const titles = () =>
  policy.body.rules.filter((r) => /live QA 6i.17/.test(r.description)).map((r) => r.description);
show("6i.17 stored descriptions before", titles());
const exception = policy.body.rules.find((r) => /exception to the grant/.test(r.description));
if (exception) {
  const removed = await admin("DELETE", `policy/rules?id=${exception.id}`);
  show("6i.17 remove exception", removed.status);
}
policy = await admin("GET", "policy");
show("6i.17 stored descriptions after (stored text is unchanged)", titles());

// 6i.10: the same rule twice, the second one's conflict names the earlier rule's id
const first = await admin("POST", "policy/rules", {
  resourceKind: "command",
  pattern: "^qa-dup$",
  description: "live QA 6i.10 first",
});
show("6i.10 first", first.status);
const second = await admin("POST", "policy/rules", {
  resourceKind: "command",
  pattern: "^qa-dup$",
  description: "live QA 6i.10 second",
});
show("6i.10 second conflicts", second.body?.conflicts ?? second.body);
