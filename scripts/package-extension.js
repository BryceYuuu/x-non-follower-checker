const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const root = path.resolve(__dirname, "..");
const dist = path.join(root, "dist");
const manifest = JSON.parse(fs.readFileSync(path.join(root, "manifest.json"), "utf8"));
const packageName = `x-non-follower-checker-${manifest.version}.zip`;
const output = path.join(dist, packageName);

fs.mkdirSync(dist, { recursive: true });
if (fs.existsSync(output)) fs.unlinkSync(output);

const files = [
  "manifest.json",
  "popup/popup.html",
  "src/background.js",
  "src/panel-view.js",
  "src/content.js",
  "src/ui.js",
  "assets/icon16.png",
  "assets/icon32.png",
  "assets/icon48.png",
  "assets/icon128.png",
  "_locales"
];

for (const file of files) {
  if (!fs.existsSync(path.join(root, file))) {
    console.error(`Missing package file: ${file}`);
    process.exit(1);
  }
}

execFileSync("zip", ["-q", "-r", output, ...files], { cwd: root, stdio: "inherit" });
console.log(path.relative(root, output));
