// Runs an expression in the mock X page inside headless Chrome and prints the JSON result.
// Usage: node test/mock-x/run-headless.mjs "<url>" "<expression>" [screenshot.png]
// Needs the mock server running: python3 test/mock-x/server.py 8765 <old-content-dir>
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, readFileSync, existsSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const [url, expression, screenshotPath] = process.argv.slice(2);
const profile = mkdtempSync(join(tmpdir(), "xnf-chrome-"));
const chrome = spawn(CHROME, [
  "--headless=new",
  `--user-data-dir=${profile}`,
  "--remote-debugging-port=0",
  "--window-size=1280,900",
  "--no-first-run",
  "--no-default-browser-check",
  "about:blank"
], { stdio: "ignore" });

const cleanup = () => {
  try { chrome.kill("SIGKILL"); } catch {}
  try { rmSync(profile, { recursive: true, force: true }); } catch {}
};
process.on("exit", cleanup);
process.on("SIGINT", () => process.exit(130));

try {
  const portFile = join(profile, "DevToolsActivePort");
  for (let i = 0; i < 100 && !existsSync(portFile); i += 1) await sleep(100);
  const port = readFileSync(portFile, "utf8").split("\n")[0];
  const target = await (await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent(url)}`, { method: "PUT" })).json();
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve) => ws.addEventListener("open", resolve, { once: true }));

  let nextId = 0;
  const pending = new Map();
  ws.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) {
      pending.get(message.id)(message);
      pending.delete(message.id);
    }
  });
  const send = (method, params = {}) => new Promise((resolve) => {
    nextId += 1;
    pending.set(nextId, resolve);
    ws.send(JSON.stringify({ id: nextId, method, params }));
  });

  await send("Emulation.setFocusEmulationEnabled", { enabled: true });
  await sleep(1500);
  const result = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (result.result?.exceptionDetails) {
    console.log(JSON.stringify({ error: result.result.exceptionDetails.exception?.description || result.result.exceptionDetails.text }));
  } else {
    console.log(JSON.stringify(result.result?.result?.value ?? null));
  }

  if (screenshotPath) {
    const shot = await send("Page.captureScreenshot", { format: "png" });
    writeFileSync(screenshotPath, Buffer.from(shot.result.data, "base64"));
  }
  ws.close();
} finally {
  cleanup();
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
