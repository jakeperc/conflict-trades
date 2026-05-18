const http = require("http");
const fs = require("fs");
const path = require("path");

const { loadConfig } = require("./lib/config");
const { buildPayload } = require("./lib/scenarios");

const PORT = process.env.PORT || 8787;
const PUBLIC_DIR = path.join(__dirname, "public");

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml"
};

function getJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  res.end(JSON.stringify(payload, null, 2));
}

function serveStatic(req, res) {
  const safePath = path.normalize(req.url === "/" ? "/index.html" : req.url).replace(/^(\.\.[/\\])+/, "");
  const filePath = path.join(PUBLIC_DIR, safePath);

  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  fs.readFile(filePath, (error, content) => {
    if (error) {
      res.writeHead(error.code === "ENOENT" ? 404 : 500);
      res.end(error.code === "ENOENT" ? "Not found" : "Server error");
      return;
    }

    const extension = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      "Content-Type": mimeTypes[extension] || "application/octet-stream",
      "Cache-Control": "no-store"
    });
    res.end(content);
  });
}

const server = http.createServer(async (req, res) => {
  if (!req.url) {
    res.writeHead(400);
    res.end("Bad request");
    return;
  }

  if (req.url.startsWith("/api/refresh")) {
    try {
      const { scenarios, fallbackQuotes } = loadConfig();
      const payload = await buildPayload(scenarios, fallbackQuotes);
      getJson(res, 200, payload);
    } catch (error) {
      getJson(res, 500, {
        error: "Failed to refresh live data.",
        detail: error.message
      });
    }
    return;
  }

  if (req.url.startsWith("/api/config")) {
    try {
      getJson(res, 200, loadConfig());
    } catch (error) {
      getJson(res, 500, { error: "Failed to load config.", detail: error.message });
    }
    return;
  }

  serveStatic(req, res);
});

module.exports = { server };

if (require.main === module) {
  server.listen(PORT, "127.0.0.1", () => {
    console.log(`Scenario dashboard running at http://127.0.0.1:${PORT}`);
  });
}
