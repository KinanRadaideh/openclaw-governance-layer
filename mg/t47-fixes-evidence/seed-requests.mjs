// Files two rule requests as the User of the isolated T47 fixture, so the Administrator's queue has
// rows to look at (2026-11-24, layout check of the Note box, T47 6i.18).
// node seed-requests.mjs <fixtureDir> <port>
import fs from "node:fs";

const [fx, port = "18847"] = process.argv.slice(2);
const acc = JSON.parse(fs.readFileSync(`${fx}/accounts.json`, "utf8"));
const base = `http://127.0.0.1:${port}/control-ui/governance`;
const origin = `http://127.0.0.1:${port}`;

const login = await fetch(`${base}/login`, {
  method: "POST",
  headers: {
    authorization: `Bearer ${acc.token}`,
    "content-type": "application/json",
    origin,
  },
  body: JSON.stringify({ username: acc.user.u, password: acc.user.p }),
});
const cookie = (login.headers.get("set-cookie") ?? "").split(";")[0];
for (const [pattern, reason] of [
  ["^/tmp/t47-a\\.txt$", "Layout check A"],
  ["^/tmp/t47-b\\.txt$", "Layout check B"],
]) {
  const res = await fetch(`${base}/rule-requests`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${acc.token}`,
      cookie,
      origin,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      resourceKind: "path",
      pattern,
      reason,
      access: "read",
      agentId: "zebra-quill",
    }),
  });
  console.log(res.status, (await res.text()).slice(0, 200));
}
