// Seeds two folder grants on one folder with different purposes, for the live check that an
// exception removed from the older grant no longer shows in its title (2026-11-24).
// node live-qa-grants.mjs <fixtureDir> <port>
import fs from "node:fs";

const [fx, port = "18847"] = process.argv.slice(2);
const acc = JSON.parse(fs.readFileSync(`${fx}/accounts.json`, "utf8"));
const base = `http://127.0.0.1:${port}/control-ui/governance`;
const origin = `http://127.0.0.1:${port}`;
const login = await fetch(`${base}/login`, {
  method: "POST",
  headers: { authorization: `Bearer ${acc.token}`, "content-type": "application/json", origin },
  body: JSON.stringify({ username: acc.admin.u, password: acc.admin.p }),
});
const cookie = (login.headers.get("set-cookie") ?? "").split(";")[0];
for (const description of ["QA older purpose", "QA newer purpose"]) {
  const res = await fetch(`${base}/policy/folder-grant`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${acc.token}`,
      cookie,
      origin,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      folder: "qa-two",
      description,
      exceptions: ["qa-two/secrets"],
    }),
  });
  console.log(description, res.status);
}
