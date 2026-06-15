const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const root = path.resolve(__dirname, "..");
const manifestPath = path.join(root, "manifest.json");
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));

const requiredManifestFields = [
  "manifest_version",
  "name",
  "version",
  "action",
  "background",
  "content_scripts"
];

for (const field of requiredManifestFields) {
  if (!manifest[field]) fail(`manifest.json missing field: ${field}`);
}

if (manifest.manifest_version !== 3) {
  fail("manifest_version must be 3");
}

const referencedFiles = new Set([
  manifest.background?.service_worker,
  manifest.action?.default_popup,
  ...Object.values(manifest.icons || {}),
  ...Object.values(manifest.action?.default_icon || {}),
  manifest.side_panel?.default_path,
  ...(manifest.content_scripts || []).flatMap((script) => script.js || []),
  ...(manifest.content_scripts || []).flatMap((script) => script.css || [])
].filter(Boolean));

for (const file of referencedFiles) {
  assertFile(file, "manifest.json");
}

for (const htmlFile of [manifest.action?.default_popup, manifest.side_panel?.default_path].filter(Boolean)) {
  const htmlPath = path.join(root, htmlFile);
  const html = fs.readFileSync(htmlPath, "utf8");
  const htmlDir = path.dirname(htmlPath);

  for (const match of html.matchAll(/(?:src|href)="([^"]+)"/g)) {
    const ref = match[1];
    if (/^(https?:|data:|#)/.test(ref)) continue;
    const absolute = path.resolve(htmlDir, ref);
    if (!fs.existsSync(absolute)) {
      fail(`${path.relative(root, absolute)} referenced by ${htmlFile} does not exist`);
    }
  }
}

for (const jsFile of findFiles(root, ".js")) {
  execFileSync(process.execPath, ["--check", jsFile], { stdio: "inherit" });
}

console.log("Extension validation passed.");

function assertFile(file, source) {
  if (!fs.existsSync(path.join(root, file))) {
    fail(`${file} referenced by ${source} does not exist`);
  }
}

function findFiles(dir, extension) {
  const result = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === ".git") continue;
    const absolute = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      result.push(...findFiles(absolute, extension));
      continue;
    }
    if (entry.isFile() && entry.name.endsWith(extension)) {
      result.push(absolute);
    }
  }
  return result;
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
