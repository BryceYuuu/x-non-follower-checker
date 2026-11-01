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

validateLocales();

for (const jsFile of findFiles(root, ".js")) {
  execFileSync(process.execPath, ["--check", jsFile], { stdio: "inherit" });
}

console.log("Extension validation passed.");

function validateLocales() {
  const localesDir = path.join(root, "_locales");
  if (!manifest.default_locale) fail("manifest.json missing default_locale");
  const locales = fs.readdirSync(localesDir).filter((name) => fs.statSync(path.join(localesDir, name)).isDirectory());
  if (!locales.includes(manifest.default_locale)) fail(`_locales/${manifest.default_locale} does not exist`);

  const catalogs = {};
  for (const locale of locales) {
    try {
      catalogs[locale] = JSON.parse(fs.readFileSync(path.join(localesDir, locale, "messages.json"), "utf8"));
    } catch (error) {
      fail(`_locales/${locale}/messages.json is invalid: ${error.message}`);
    }
  }

  const reference = catalogs[manifest.default_locale];
  const referenceKeys = Object.keys(reference).sort();
  for (const [locale, catalog] of Object.entries(catalogs)) {
    const keys = Object.keys(catalog).sort();
    const missing = referenceKeys.filter((key) => !catalog[key]);
    const extra = keys.filter((key) => !reference[key]);
    if (missing.length || extra.length) {
      fail(`_locales/${locale} differs from ${manifest.default_locale}: missing [${missing}] extra [${extra}]`);
    }
    for (const key of keys) {
      const placeholders = (catalog[key].message.match(/\$[A-Za-z0-9_]+\$/g) || []).sort().join();
      const expected = (reference[key].message.match(/\$[A-Za-z0-9_]+\$/g) || []).sort().join();
      if (placeholders !== expected) fail(`_locales/${locale} key ${key} placeholders ${placeholders} != ${expected}`);
    }
  }

  const manifestText = fs.readFileSync(manifestPath, "utf8");
  const used = new Set([...manifestText.matchAll(/__MSG_([A-Za-z0-9_]+)__/g)].map((match) => match[1]));
  for (const file of findFiles(path.join(root, "src"), ".js")) {
    const source = fs.readFileSync(file, "utf8");
    for (const match of source.matchAll(/\b(?:t|getMessage)\("([A-Za-z0-9_]+)"/g)) used.add(match[1]);
  }
  for (const key of used) {
    if (!reference[key]) fail(`message key "${key}" is used but missing from _locales/${manifest.default_locale}`);
  }
  const unused = referenceKeys.filter((key) => !used.has(key));
  if (unused.length) console.warn(`Unused message keys: ${unused.join(", ")}`);
}

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
