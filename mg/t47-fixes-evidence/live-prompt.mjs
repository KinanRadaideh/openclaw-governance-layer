// Sends one prompt to an agent of the isolated fixture as its Administrator and prints the reply.
// node live-prompt.mjs <fixtureDir> <port> <agentId>
import fs from "node:fs";

const [fx, port = "18847", agentId = "qa-fresh"] = process.argv.slice(2);
const acc = JSON.parse(fs.readFileSync(`${fx}/accounts.json`, "utf8"));
const base = `http://127.0.0.1:${port}/control-ui/governance`;
const origin = `http://127.0.0.1:${port}`;
const login = await fetch(`${base}/login`, {
  method: "POST",
  headers: { authorization: `Bearer ${acc.token}`, "content-type": "application/json", origin },
  body: JSON.stringify({ username: acc.admin.u, password: acc.admin.p }),
});
const cookie = (login.headers.get("set-cookie") ?? "").split(";")[0];
const res = await fetch(`${base}/agent/prompt`, {
  method: "POST",
  headers: {
    authorization: `Bearer ${acc.token}`,
    cookie,
    origin,
    "content-type": "application/json",
  },
  body: JSON.stringify({ agentId, message: "say hello" }),
  signal: AbortSignal.timeout(170000),
});
console.log(res.status, (await res.text()).slice(0, 500));
