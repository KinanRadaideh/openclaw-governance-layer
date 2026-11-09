// Two loopback sites for the 2026-11-09 live check: 127.0.0.2 (forbidden by a network rule) and
// 127.0.0.3 (allowed; /start redirects to /admin, which a url rule forbids). Every request is
// appended to the log file given, so a refused fetch is proven by its absence there.
// Usage: node sites.mjs <log file>
import { appendFileSync } from "node:fs";
import { createServer } from "node:http";

const log = process.argv[2];
for (const host of ["127.0.0.2", "127.0.0.3"]) {
  createServer((req, res) => {
    appendFileSync(
      log,
      `${new Date().toISOString()} ${host} ${req.method} ${req.url?.slice(0, 120)}\n`,
    );
    if (req.url === "/start") {
      res.writeHead(302, { location: "/admin/panel" });
      res.end();
      return;
    }
    res.writeHead(200, { "content-type": "text/plain" });
    res.end(`hello from ${host}${req.url}\n`);
  }).listen(18898, host, () => console.log(`listening ${host}:18898`));
}
