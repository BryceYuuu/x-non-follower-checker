(() => {
if (globalThis.__xUnfollowDetectorContentLoaded) return;
globalThis.__xUnfollowDetectorContentLoaded = true;

const ROUTE_NAMES = new Set([
  "home",
  "explore",
  "notifications",
  "messages",
  "i",
  "settings",
  "compose",
  "search",
  "jobs"
]);

let scanCancelled = false;

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  (async () => {
    if (message?.type === "DETECT_ACCOUNT") {
      sendResponse({ ok: true, account: detectCurrentAccount() });
      return;
    }

    if (message?.type === "CANCEL_SCAN") {
      scanCancelled = true;
      sendResponse({ ok: true });
      return;
    }

    if (message?.type === "SCAN_FOLLOWING_PAGE") {
      scanCancelled = false;
      const users = await scanFollowingPage();
      sendResponse({ ok: true, users });
      return;
    }

    if (message?.type === "BATCH_UNFOLLOW_ON_FOLLOWING_PAGE") {
      scanCancelled = false;
      const result = await batchUnfollowOnFollowingPage(message.handles || []);
      sendResponse({ ok: true, ...result });
      return;
    }

    sendResponse({ ok: false, error: "Unknown message" });
  })().catch((error) => {
    sendResponse({ ok: false, error: error.message || String(error) });
  });
  return true;
});

function detectCurrentAccount() {
  const accountButton = document.querySelector('[data-testid="SideNav_AccountSwitcher_Button"]');
  const buttonText = cleanText(accountButton?.textContent || "");
  return findHandleInText(buttonText);
}

async function scanFollowingPage() {
  await waitForElement(() => getPrimaryColumn() || document.querySelector('[data-testid="UserCell"]'), 30_000);

  const users = new Map();
  const originalScrollY = window.scrollY;
  let previousSize = -1;
  let previousScrollHeight = 0;
  let stableRounds = 0;
  const maxStableRounds = 14;
  const startedAt = Date.now();
  const maxDurationMs = 25 * 60 * 1000;

  try {
    while (!scanCancelled && Date.now() - startedAt < maxDurationMs) {
      collectVisibleFollowingUsers(users);
      reportScanProgress(users.size);

      const scrollHeight = document.documentElement.scrollHeight;
      const atBottom = window.scrollY + window.innerHeight >= scrollHeight - 8;
      const noChange = users.size === previousSize && scrollHeight === previousScrollHeight;

      stableRounds = noChange && atBottom ? stableRounds + 1 : 0;
      if (stableRounds >= maxStableRounds) break;

      previousSize = users.size;
      previousScrollHeight = scrollHeight;

      window.scrollBy({ top: Math.max(window.innerHeight * 0.95, 760), behavior: "auto" });
      await sleep(300);
    }

    if (scanCancelled) {
      const error = new Error("任务已取消");
      error.name = "AbortError";
      throw error;
    }

    collectVisibleFollowingUsers(users);
    reportScanProgress(users.size);
    return [...users.values()];
  } finally {
    window.scrollTo({ top: originalScrollY, behavior: "auto" });
  }
}

async function batchUnfollowOnFollowingPage(handles) {
  await waitForElement(() => getPrimaryColumn() || document.querySelector('[data-testid="UserCell"]'), 30_000);

  const remaining = new Set(handles.map((handle) => normalizeHandle(handle).toLowerCase()).filter(Boolean));
  const total = remaining.size;
  const unfollowed = [];
  const originalScrollY = window.scrollY;
  let previousRemaining = remaining.size;
  let previousScrollHeight = 0;
  let stableRounds = 0;
  const maxStableRounds = 18;
  const startedAt = Date.now();
  const maxDurationMs = 30 * 60 * 1000;

  try {
    window.scrollTo({ top: 0, behavior: "auto" });
    await sleep(500);

    while (!scanCancelled && remaining.size && Date.now() - startedAt < maxDurationMs) {
      await unfollowVisibleTargets(remaining, unfollowed, total);
      reportUnfollowProgress(unfollowed.length, total);

      if (!remaining.size) break;

      const scrollHeight = document.documentElement.scrollHeight;
      const atBottom = window.scrollY + window.innerHeight >= scrollHeight - 8;
      const noChange = remaining.size === previousRemaining && scrollHeight === previousScrollHeight;

      stableRounds = noChange && atBottom ? stableRounds + 1 : 0;
      if (stableRounds >= maxStableRounds) break;

      previousRemaining = remaining.size;
      previousScrollHeight = scrollHeight;

      window.scrollBy({ top: Math.max(window.innerHeight * 0.95, 760), behavior: "auto" });
      await sleep(350);
    }

    if (scanCancelled) {
      const error = new Error("任务已取消");
      error.name = "AbortError";
      throw error;
    }

    return {
      unfollowed,
      missing: [...remaining]
    };
  } finally {
    window.scrollTo({ top: originalScrollY, behavior: "auto" });
  }
}

async function unfollowVisibleTargets(remaining, unfollowed, total) {
  const primary = getPrimaryColumn();
  if (!primary) return;

  const cells = [...primary.querySelectorAll('[data-testid="UserCell"]')];
  for (const cell of cells) {
    const handle = findPrimaryHandle(cell);
    const key = handle.toLowerCase();
    if (!handle || !remaining.has(key)) continue;

    const button = findFollowingButtonInCell(cell);
    if (!button) {
      remaining.delete(key);
      continue;
    }

    button.click();
    await sleep(250);

    const confirm = await waitForElement(findConfirmUnfollowButton, 5000);
    if (!confirm) continue;

    confirm.click();
    remaining.delete(key);
    unfollowed.push(handle);
    reportUnfollowProgress(unfollowed.length, total);
    await sleep(550);
  }
}

function collectVisibleFollowingUsers(users) {
  const primary = getPrimaryColumn();
  if (!primary) return;

  const cells = primary.querySelectorAll('[data-testid="UserCell"]');
  for (const cell of cells) {
    const user = parseFollowingUserCell(cell);
    if (!user?.handle || !user.isFollowing) continue;
    users.set(user.handle.toLowerCase(), user);
  }
}

function parseFollowingUserCell(cell) {
  const handle = findPrimaryHandle(cell);
  if (!handle) return null;

  const text = cleanText(cell.textContent || "");
  const handleToken = `@${handle.toLowerCase()}`;
  const parts = text.split(/\s+/).filter(Boolean);
  const handleIndex = parts.findIndex((part) => part.toLowerCase() === handleToken);
  const name = handleIndex > 0 ? parts.slice(0, handleIndex).join(" ") : handle;

  return {
    handle,
    name,
    avatar: findAvatarSrc(cell),
    followsYou: textShowsFollowsYou(text),
    isFollowing: cellShowsFollowing(cell)
  };
}

function findPrimaryHandle(cell) {
  const links = [...cell.querySelectorAll('a[href^="/"]')];
  const candidates = links
    .map((link) => {
      const href = link.getAttribute("href") || "";
      const path = href.split(/[?#]/)[0];
      const segments = path.split("/").filter(Boolean);
      if (segments.length !== 1) return "";
      return extractHandleFromPath(path);
    })
    .filter(Boolean);

  return candidates[0] || "";
}

function cellShowsFollowing(cell) {
  if (findFollowingButtonInCell(cell)) return true;

  return false;
}

function findFollowingButtonInCell(cell) {
  const testIdButton = cell.querySelector('button[data-testid$="-unfollow"]');
  if (testIdButton) return testIdButton;

  return [...cell.querySelectorAll('button[role="button"], div[role="button"]')]
    .find((button) => {
      const label = cleanText(`${button.getAttribute("aria-label") || ""} ${button.textContent || ""}`);
      return /following|正在关注|已关注/i.test(label) && !/followers|关注者/.test(label);
    }) || null;
}

function findConfirmUnfollowButton() {
  const direct = document.querySelector('[data-testid="confirmationSheetConfirm"]');
  if (direct) return direct;

  return [...document.querySelectorAll('button[role="button"], div[role="button"]')]
    .find((button) => {
      const label = cleanText(`${button.getAttribute("aria-label") || ""} ${button.textContent || ""}`);
      return /unfollow|取消关注/i.test(label);
    }) || null;
}

function textShowsFollowsYou(text) {
  const normalized = cleanText(text).toLowerCase();
  return [
    "follows you",
    "关注了你"
  ].some((marker) => normalized.includes(marker.toLowerCase()));
}

function findAvatarSrc(cell) {
  const images = [...cell.querySelectorAll("img[src]")];
  const profileImage = images.find((image) => /pbs\.twimg\.com\/profile_images|profile_images/.test(image.src));
  return profileImage?.src || images.find((image) => image.src.startsWith("https://"))?.src || "";
}

function getPrimaryColumn() {
  return document.querySelector('[data-testid="primaryColumn"]');
}

function reportScanProgress(count) {
  chrome.runtime.sendMessage({ type: "SCAN_PROGRESS", listType: "following", count }).catch(() => {});
}

function reportUnfollowProgress(done, total) {
  chrome.runtime.sendMessage({ type: "UNFOLLOW_PROGRESS", done, total }).catch(() => {});
}

function extractHandleFromPath(path) {
  const first = String(path || "").split(/[/?#]/).filter(Boolean)[0];
  const handle = normalizeHandle(first);
  if (!handle || ROUTE_NAMES.has(handle.toLowerCase())) return "";
  return handle;
}

function findHandleInText(text) {
  return normalizeHandle(text.match(/@([A-Za-z0-9_]{1,15})/)?.[1]);
}

function normalizeHandle(value) {
  return String(value || "")
    .trim()
    .replace(/^@/, "")
    .match(/^[A-Za-z0-9_]{1,15}$/)?.[0] || "";
}

function cleanText(text) {
  return String(text || "").replace(/\s+/g, " ").trim();
}

function waitForElement(getter, timeoutMs) {
  return new Promise((resolve) => {
    const existing = getter();
    if (existing) {
      resolve(existing);
      return;
    }

    const startedAt = Date.now();
    const timer = setInterval(() => {
      const element = getter();
      if (element || Date.now() - startedAt > timeoutMs) {
        clearInterval(timer);
        resolve(element || null);
      }
    }, 250);
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
})();
