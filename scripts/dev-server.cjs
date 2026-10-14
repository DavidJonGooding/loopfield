const http = require("node:http"),
  fs = require("node:fs"),
  path = require("node:path");
function serve(root, port = 4173) {
  const types = {
    ".html": "text/html",
    ".js": "application/javascript",
    ".css": "text/css",
    ".png": "image/png",
    ".webmanifest": "application/manifest+json",
  };
  const server = http.createServer((req, res) => {
    try {
      if (req.method !== "GET" && req.method !== "HEAD") {
        res.writeHead(405);
        return res.end();
      }
      let url = decodeURIComponent(
        new URL(req.url, "http://localhost").pathname,
      );
      if (url.endsWith("/")) url += "index.html";
      const file = path.resolve(root, "." + url);
      if (!file.startsWith(root + path.sep)) {
        res.writeHead(403);
        return res.end();
      }
      const data = fs.readFileSync(file);
      res.writeHead(200, {
        "Content-Type": types[path.extname(file)] || "application/octet-stream",
        "Cache-Control": "no-cache",
        "X-Content-Type-Options": "nosniff",
      });
      res.end(req.method === "HEAD" ? undefined : data);
    } catch {
      res.writeHead(404);
      res.end("Not found");
    }
  });
  return server.listen(port, "127.0.0.1");
}
module.exports = { serve };
if (require.main === module) {
  const root = path.resolve("dist/web");
  if (!fs.existsSync(path.join(root, "index.html"))) require("./build-web.cjs");
  serve(root, +process.env.PORT || 4173).on("listening", () =>
    console.log(`Local: http://127.0.0.1:${+process.env.PORT || 4173}`),
  );
}
