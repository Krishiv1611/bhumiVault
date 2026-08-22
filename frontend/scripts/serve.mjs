import { createServer } from "node:http";
import { createReadStream, existsSync } from "node:fs";
import { extname, join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..", "dist");
const port = Number(process.env.FRONTEND_PORT || 5173);
const types = new Map([
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".json", "application/json; charset=utf-8"]
]);

createServer((req, res) => {
  const url = new URL(req.url || "/", `http://localhost:${port}`);
  const requested = url.pathname === "/" ? "/index.html" : url.pathname;
  const file = join(root, requested);
  const fallback = join(root, "index.html");
  const target = existsSync(file) ? file : fallback;
  res.setHeader("Content-Type", types.get(extname(target)) || "application/octet-stream");
  createReadStream(target).pipe(res);
}).listen(port, () => {
  console.log(`BhumiVault frontend: http://localhost:${port}`);
});
