import { cpSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const dist = resolve(root, "dist");
const apiBaseUrl = process.env.BHUMIVAULT_API_BASE_URL || process.env.VITE_API_BASE_URL || "http://localhost:5000/api";

mkdirSync(dist, { recursive: true });
cpSync(resolve(root, "index.html"), resolve(dist, "index.html"));
cpSync(resolve(root, "src", "styles.css"), resolve(dist, "styles.css"));
writeFileSync(
  resolve(dist, "env.js"),
  `window.BHUMIVAULT_CONFIG = ${JSON.stringify({ API_BASE_URL: apiBaseUrl }, null, 2)};\n`
);
