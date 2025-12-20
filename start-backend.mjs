import { createServer } from "node:http";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

function resolvePort() {
  const candidates = [
    process.env.PORT,
    process.env.RAILWAY_PORT,
    process.env.RAILWAY_TCP_PROXY_PORT,
    process.env.NIXPACKS_PORT,
    process.env.APP_PORT,
  ].filter(Boolean);

  for (const raw of candidates) {
    const n = Number.parseInt(String(raw), 10);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return 8080;
}

function startFallbackServer({ status, error }) {
  const port = resolvePort();

  const server = createServer((req, res) => {
    const url = req.url || "/";
    if (url.startsWith("/api/health")) {
      const body = JSON.stringify(
        {
          status,
          timestamp: new Date().toISOString(),
          error,
        },
        null,
        2,
      );
      res.writeHead(500, {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-store",
      });
      res.end(body);
      return;
    }

    res.writeHead(503, {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "no-store",
    });
    res.end("Backend is not running. Try /api/health\n");
  });

  server.listen(port, "0.0.0.0", () => {
    // eslint-disable-next-line no-console
    console.error(`[startup] fallback server listening on 0.0.0.0:${port} (${status})`);
  });
}

const entry = resolve("apps/backend/dist/index.js");

if (!existsSync(entry)) {
  startFallbackServer({
    status: "backend_missing_dist",
    error: `Missing ${entry}`,
  });
} else {
  try {
    await import(pathToFileURL(entry).href);
  } catch (e) {
    startFallbackServer({
      status: "backend_import_failed",
      error: e instanceof Error ? e.stack || e.message : String(e),
    });
  }
}
