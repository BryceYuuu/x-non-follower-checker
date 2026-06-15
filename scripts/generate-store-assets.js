const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const root = path.resolve(__dirname, "..");
const outputDir = path.join(root, "store-assets");
const tmpDir = path.join(outputDir, ".tmp");
const chromePath = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

const sourceImages = [
  {
    title: "扫描结果",
    subtitle: "识别未回关用户，支持查看主页和一键取关",
    src: "/Users/bryce/Library/Containers/com.tencent.xinWeChat/Data/Documents/xwechat_files/wxid_jg4y4ud0202m12_1787/temp/RWTemp/2026-06/9e20f478899dc29eb19741386f9343c8/2ce638c6eaec279886cecb05478392bb.png",
    out: "screenshot-results-1280x800.png"
  },
  {
    title: "取关确认",
    subtitle: "执行前明确提示不可恢复，避免误操作",
    src: "/Users/bryce/Library/Containers/com.tencent.xinWeChat/Data/Documents/xwechat_files/wxid_jg4y4ud0202m12_1787/temp/RWTemp/2026-06/9e20f478899dc29eb19741386f9343c8/d93e24c852db3cb8af83479cdc72e3fa.png",
    out: "screenshot-confirm-1280x800.png"
  },
  {
    title: "轻量界面",
    subtitle: "打开 X 后点击开始检测，所有数据本地处理",
    src: "/Users/bryce/Library/Containers/com.tencent.xinWeChat/Data/Documents/xwechat_files/wxid_jg4y4ud0202m12_1787/temp/RWTemp/2026-06/9e20f478899dc29eb19741386f9343c8/e3caf0a910e0486fbd5b0f6e542e6f19.png",
    out: "screenshot-empty-1280x800.png"
  }
];

fs.mkdirSync(outputDir, { recursive: true });
fs.mkdirSync(tmpDir, { recursive: true });

for (const item of sourceImages) {
  assertFile(item.src);
  const html = renderScreenshotHtml(item);
  const htmlPath = path.join(tmpDir, `${item.out}.html`);
  fs.writeFileSync(htmlPath, html);
  screenshot(htmlPath, path.join(outputDir, item.out), 1280, 800);
}

const promoHtml = renderPromoHtml(sourceImages[0]);
const promoHtmlPath = path.join(tmpDir, "small-promo.html");
fs.writeFileSync(promoHtmlPath, promoHtml);
screenshot(promoHtmlPath, path.join(outputDir, "small-promo-440x280.png"), 440, 280);

const marqueeHtml = renderMarqueeHtml(sourceImages[0]);
const marqueeHtmlPath = path.join(tmpDir, "marquee-promo.html");
fs.writeFileSync(marqueeHtmlPath, marqueeHtml);
screenshot(marqueeHtmlPath, path.join(outputDir, "marquee-promo-1400x560.png"), 1400, 560);

console.log("Generated Chrome Web Store assets:");
for (const name of [
  "screenshot-results-1280x800.png",
  "screenshot-confirm-1280x800.png",
  "screenshot-empty-1280x800.png",
  "small-promo-440x280.png",
  "marquee-promo-1400x560.png"
]) {
  console.log(`- store-assets/${name}`);
}

function screenshot(htmlPath, outPath, width, height) {
  execFileSync(chromePath, [
    "--headless=new",
    "--disable-gpu",
    "--no-first-run",
    `--window-size=${width},${height}`,
    `--screenshot=${outPath}`,
    `file://${htmlPath}`
  ], { stdio: "ignore" });
}

function renderScreenshotHtml(item) {
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<style>
  * { box-sizing: border-box; }
  body {
    margin: 0;
    width: 1280px;
    height: 800px;
    overflow: hidden;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    background: #f4f7fb;
    color: #111418;
  }
  .frame {
    display: grid;
    grid-template-columns: 520px 1fr;
    gap: 64px;
    width: 100%;
    height: 100%;
    padding: 64px 76px;
    align-items: center;
  }
  .copy {
    align-self: center;
  }
  .eyebrow {
    font-size: 22px;
    color: #536471;
    margin-bottom: 18px;
  }
  h1 {
    margin: 0;
    font-size: 58px;
    line-height: 1.08;
    letter-spacing: 0;
  }
  p {
    margin: 24px 0 0;
    font-size: 26px;
    line-height: 1.45;
    color: #536471;
  }
  .shot {
    justify-self: center;
    display: grid;
    place-items: center;
    width: 470px;
    height: 660px;
    border-radius: 20px;
    background: #ffffff;
    box-shadow: 0 22px 60px rgba(15, 23, 42, 0.18);
    overflow: hidden;
  }
  .shot img {
    max-width: 100%;
    max-height: 100%;
    object-fit: contain;
  }
</style>
</head>
<body>
  <main class="frame">
    <section class="copy">
      <div class="eyebrow">Chrome Extension for X / Twitter</div>
      <h1>${escapeHtml(item.title)}</h1>
      <p>${escapeHtml(item.subtitle)}</p>
    </section>
    <section class="shot">
      <img src="file://${item.src}" alt="">
    </section>
  </main>
</body>
</html>`;
}

function renderPromoHtml(item) {
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<style>
  * { box-sizing: border-box; }
  body {
    margin: 0;
    width: 440px;
    height: 280px;
    overflow: hidden;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    background: #111418;
    color: #ffffff;
  }
  .promo {
    display: grid;
    grid-template-columns: 1fr 142px;
    gap: 20px;
    height: 100%;
    padding: 30px;
    align-items: center;
  }
  h1 {
    margin: 0;
    font-size: 34px;
    line-height: 1.12;
    letter-spacing: 0;
  }
  p {
    margin: 14px 0 0;
    color: #d4d9df;
    font-size: 15px;
    line-height: 1.45;
  }
  .pill {
    display: inline-block;
    margin-top: 18px;
    border-radius: 999px;
    background: #1d9bf0;
    padding: 8px 12px;
    font-size: 13px;
    font-weight: 700;
  }
  .mock {
    width: 142px;
    height: 210px;
    border-radius: 14px;
    background: #ffffff;
    box-shadow: 0 14px 34px rgba(0, 0, 0, 0.35);
    overflow: hidden;
  }
  .mock img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    object-position: top center;
  }
</style>
</head>
<body>
  <main class="promo">
    <section>
      <h1>X 未回关检测</h1>
      <p>扫描关注列表，找出未回关用户。</p>
      <span class="pill">本地处理</span>
    </section>
    <section class="mock">
      <img src="file://${item.src}" alt="">
    </section>
  </main>
</body>
</html>`;
}

function renderMarqueeHtml(item) {
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<style>
  * { box-sizing: border-box; }
  body {
    margin: 0;
    width: 1400px;
    height: 560px;
    overflow: hidden;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    background: #f4f7fb;
    color: #111418;
  }
  .marquee {
    display: grid;
    grid-template-columns: 1fr 410px;
    gap: 72px;
    height: 100%;
    padding: 62px 96px;
    align-items: center;
  }
  .eyebrow {
    color: #536471;
    font-size: 22px;
    font-weight: 700;
    margin-bottom: 18px;
  }
  h1 {
    margin: 0;
    font-size: 70px;
    line-height: 1.04;
    letter-spacing: 0;
  }
  p {
    width: 760px;
    margin: 28px 0 0;
    color: #536471;
    font-size: 26px;
    line-height: 1.45;
  }
  .features {
    display: flex;
    gap: 14px;
    margin-top: 34px;
  }
  .pill {
    border-radius: 999px;
    background: #111418;
    color: #ffffff;
    padding: 12px 16px;
    font-size: 18px;
    font-weight: 700;
  }
  .shot {
    justify-self: end;
    width: 350px;
    height: 470px;
    border-radius: 20px;
    background: #ffffff;
    box-shadow: 0 24px 64px rgba(15, 23, 42, 0.2);
    overflow: hidden;
  }
  .shot img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    object-position: top center;
  }
</style>
</head>
<body>
  <main class="marquee">
    <section>
      <div class="eyebrow">Chrome Extension for X / Twitter</div>
      <h1>X 未回关检测</h1>
      <p>扫描关注列表，找出未回关用户。所有数据本地处理，支持查看主页和确认后一键取关。</p>
      <div class="features">
        <span class="pill">本地处理</span>
        <span class="pill">扫描关注列表</span>
        <span class="pill">一键取关</span>
      </div>
    </section>
    <section class="shot">
      <img src="file://${item.src}" alt="">
    </section>
  </main>
</body>
</html>`;
}

function assertFile(file) {
  if (!fs.existsSync(file)) {
    console.error(`Missing source image: ${file}`);
    process.exit(1);
  }
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
