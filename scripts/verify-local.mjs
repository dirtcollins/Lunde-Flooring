import fs from "node:fs";
import { spawnSync } from "node:child_process";

const baseUrl = process.env.BASE_URL || "http://localhost:3003";
const htmlFiles = fs.readdirSync(".").filter((file) => file.endsWith(".html")).sort();
const pages = ["/", ...htmlFiles.map((file) => `/${file}`), "/health", "/api/settings"];
const failures = [];

function fail(message) {
  failures.push(message);
  console.error(`FAIL ${message}`);
}

function pass(message) {
  console.log(`OK   ${message}`);
}

for (const file of fs.readdirSync(".").filter((name) => name.endsWith(".js")).sort()) {
  const result = spawnSync(process.execPath, ["--check", file], { encoding: "utf8" });
  if (result.status !== 0) fail(`${file} failed JavaScript syntax check\n${result.stderr || result.stdout}`);
}
pass("JavaScript syntax checks complete");

for (const page of pages) {
  try {
    const response = await fetch(`${baseUrl}${page}`);
    if (!response.ok) fail(`${page} returned HTTP ${response.status}`);
    else pass(`${page} returned HTTP ${response.status}`);
  } catch (error) {
    fail(`${page} could not be reached at ${baseUrl}: ${error.message}`);
  }
}

const routeAliases = new Set([
  "account",
  "account/login",
  "account/register",
  "account/reset",
  "account/verify",
  "admin",
  "admin/login",
  "admin/reset"
]);

const refs = new Set();
for (const file of htmlFiles) {
  const html = fs.readFileSync(file, "utf8");
  for (const match of html.matchAll(/(?:src|href)=["']([^"']+)["']/g)) {
    const ref = match[1];
    if (/^(https?:|mailto:|tel:|#|data:)/.test(ref)) continue;
    if (ref.startsWith("/api/")) continue;
    const clean = ref.split(/[?#]/)[0].replace(/^\.\//, "").replace(/^\//, "");
    if (!clean || clean.endsWith("/") || routeAliases.has(clean)) continue;
    refs.add(clean);
  }
}

for (const ref of [...refs].sort()) {
  if (!fs.existsSync(ref)) fail(`missing static reference ${ref}`);
}
pass("HTML static references checked");

if (fs.existsSync("data.js")) {
  const data = fs.readFileSync("data.js", "utf8");
  const imageRefs = [...data.matchAll(/"(?:mainImage|roomImage)":\s*"([^"]+)"/g)]
    .map((match) => match[1].replace(/^\.\//, ""));
  for (const image of imageRefs) {
    if (!fs.existsSync(image)) fail(`missing product image ${image}`);
  }
  pass(`product image references checked (${imageRefs.length})`);
}

if (failures.length) {
  console.error(`\n${failures.length} verification failure(s).`);
  process.exit(1);
}

console.log("\nVerification passed.");
