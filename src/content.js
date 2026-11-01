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

const BUSY_STATUSES = new Set(["detecting", "scanning", "unfollowing"]);

// Text fallbacks only matter if X drops the data-testid marker; the testid is language independent.
const FOLLOWS_YOU_MARKERS = [
  "follows you",
  "关注了你",
  "關注了你",
  "跟隨你",
  "フォローされています",
  "나를 팔로우합니다",
  "te sigue",
  "vous suit",
  "folgt dir",
  "segue você",
  "ti segue",
  "читает вас"
];

let jobCancelled = false;
let floating = null;
let floatingDismissedWhileBusy = false;

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  (async () => {
    if (message?.type === "DETECT_ACCOUNT") {
      sendResponse({ ok: true, account: detectCurrentAccount() });
      return;
    }

    if (message?.type === "CANCEL_SCAN") {
      jobCancelled = true;
      sendResponse({ ok: true });
      return;
    }

    if (message?.type === "PREPARE_FOLLOWING") {
      jobCancelled = false;
      sendResponse({ ok: true, ...(await prepareFollowingRoute(message.account)) });
      return;
    }

    if (message?.type === "SCAN_FOLLOWING_PAGE") {
      jobCancelled = false;
      sendResponse({ ok: true, ...(await scanFollowingPage(message.account)) });
      return;
    }

    if (message?.type === "UNFOLLOW_ON_FOLLOWING_PAGE") {
      jobCancelled = false;
      sendResponse({ ok: true, ...(await unfollowOnFollowingPage(message)) });
      return;
    }

    if (message?.type === "SHOW_FLOATING_RESULTS") {
      floatingDismissedWhileBusy = false;
      showFloatingResults(message.state || await getCurrentState());
      sendResponse({ ok: true });
      return;
    }

    if (message?.type === "UPDATE_FLOATING_RESULTS") {
      const nextState = message.state || await getCurrentState();
      if (!BUSY_STATUSES.has(nextState?.status)) floatingDismissedWhileBusy = false;
      if (floating) {
        floating.view.render(nextState);
      } else if (BUSY_STATUSES.has(nextState?.status) && !floatingDismissedWhileBusy) {
        showFloatingResults(nextState);
      }
      sendResponse({ ok: true });
      return;
    }

    sendResponse({ ok: false, error: "Unknown message" });
  })().catch((error) => {
    sendResponse({ ok: false, error: error.message || String(error) });
  });
  return true;
});

restoreFloatingPanelIfNeeded();

async function restoreFloatingPanelIfNeeded() {
  const state = await getCurrentState();
  if (BUSY_STATUSES.has(state?.status)) showFloatingResults(state);
}

function detectCurrentAccount() {
  const accountButton = document.querySelector('[data-testid="SideNav_AccountSwitcher_Button"]');
  const buttonText = cleanText(accountButton?.textContent || "");
  return findHandleInText(buttonText);
}

// ---------- Floating panel ----------

function showFloatingResults(state) {
  ensureFloatingPanel();
  floating.view.setTheme(detectXTheme());
  if (state) floating.view.render(state);
}

function ensureFloatingPanel() {
  if (floating?.host?.isConnected) return floating;

  const host = document.createElement("div");
  host.id = "x-unfollow-detector-floating-panel";
  host.style.cssText = "all: initial; position: fixed; top: 0; left: 0; width: 0; height: 0; z-index: 2147483646;";
  const shadow = host.attachShadow({ mode: "open" });
  document.documentElement.append(host);

  const view = globalThis.XNFPanelView.mount(shadow, {
    mode: "floating",
    onClose: () => {
      floating?.view.destroy();
      floating?.host.remove();
      floating = null;
      getCurrentState().then((state) => {
        floatingDismissedWhileBusy = BUSY_STATUSES.has(state?.status);
      });
    }
  });

  floating = { host, view };
  return floating;
}

function detectXTheme() {
  const color = getComputedStyle(document.body || document.documentElement).backgroundColor;
  const [r, g, b] = (color.match(/\d+(\.\d+)?/g) || ["255", "255", "255"]).map(Number);
  const theme = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255 < 0.45 ? "dark" : "light";
  chrome.storage.local.set({ xTheme: theme }).catch(() => {});
  return theme;
}

function getCurrentState() {
  return new Promise((resolve) => {
    try {
      chrome.runtime.sendMessage({ type: "GET_STATE" }, (response) => {
        if (chrome.runtime.lastError) {
          resolve(null);
          return;
        }
        resolve(response?.state || null);
      });
    } catch {
      resolve(null);
    }
  });
}

// ---------- Navigation ----------

async function prepareFollowingRoute(account) {
  const handle = normalizeHandle(account);
  if (!handle) return { navigated: false, total: 0 };
  if (isFollowingRoute(handle)) {
    await waitForFollowingListReady(30_000);
    return { navigated: true, total: 0 };
  }

  const href = `/${handle}/following`;
  const link = await waitForElement(() => {
    const scope = getPrimaryColumn() || document;
    return scope.querySelector(`a[href="${href}" i]`);
  }, 10_000);
  if (!link) return { navigated: false, total: 0 };

  const total = parseCount(link.textContent || "");
  link.click();
  const arrived = await waitForElement(() => isFollowingRoute(handle) || null, 6000);
  if (!arrived) return { navigated: false, total };

  await waitForFollowingListReady(30_000);
  return { navigated: true, total };
}

function isFollowingRoute(handle) {
  const parts = location.pathname.split("/").filter(Boolean);
  return normalizeHandle(parts[0]).toLowerCase() === handle.toLowerCase() &&
    parts[1]?.toLowerCase() === "following" &&
    parts.length === 2;
}

function parseCount(text) {
  const match = cleanText(text).match(/(\d[\d.,\s]*)\s*(万|萬|千|[KkMm])?/);
  if (!match) return 0;
  const [, rawNumber, unit] = match;
  if (unit) {
    const value = Number.parseFloat(rawNumber.replace(/\s/g, "").replace(",", "."));
    const multiplier = { 万: 10_000, 萬: 10_000, 千: 1000, k: 1000, m: 1_000_000 }[unit.toLowerCase()] || 1;
    return Number.isFinite(value) ? Math.round(value * multiplier) : 0;
  }
  const digits = rawNumber.replace(/\D/g, "");
  return digits ? Number(digits) : 0;
}

// ---------- Scanning ----------

async function scanFollowingPage(account) {
  ensureFollowingRoute(account);
  await waitForFollowingListReady(30_000);

  const users = new Map();
  const reporter = createProgressReporter();
  const originalScrollY = window.scrollY;

  try {
    window.scrollTo({ top: 0, behavior: "auto" });
    await waitForListChange("", 400);

    await sweepList({
      maxDurationMs: 40 * 60 * 1000,
      onCells(cells) {
        for (const cell of cells) {
          const user = parseFollowingUserCell(cell);
          if (!user?.handle || !user.isFollowing) continue;
          const key = user.handle.toLowerCase();
          const existing = users.get(key);
          if (existing) {
            // Keep the first-seen order; refresh data in case the cell finished rendering.
            users.set(key, { ...existing, ...user, order: existing.order });
            continue;
          }
          const entry = { ...user, order: users.size + 1 };
          users.set(key, entry);
          if (!entry.followsYou) reporter.queue(entry);
        }
        reporter.flush(users.size);
      }
    });

    reporter.flush(users.size, true);
    return { users: [...users.values()], cancelled: jobCancelled };
  } finally {
    window.scrollTo({ top: originalScrollY, behavior: "auto" });
  }
}

function ensureFollowingRoute(account) {
  const expected = normalizeHandle(account);
  if (!expected || !isFollowingRoute(expected)) {
    throw new Error(t("errNotFollowingPage"));
  }
}

function createProgressReporter() {
  let lastAt = 0;
  let pending = [];
  return {
    queue(user) {
      pending.push(user);
    },
    flush(count, force = false) {
      const now = Date.now();
      if (!force && now - lastAt < 350) return;
      lastAt = now;
      const nonFollowers = pending;
      pending = [];
      chrome.runtime.sendMessage({
        type: "SCAN_PROGRESS",
        count,
        nonFollowers
      }).catch(() => {});
    }
  };
}

/**
 * Walks X's virtualised list from the current position to the end.
 * Each step reads every rendered cell (not only the ones on screen), then scrolls
 * so the last rendered cell sits near the top. The next cells are therefore always
 * adjacent to ones already read, so nothing is skipped, and each step advances by
 * the full rendered range instead of a single viewport.
 */
async function sweepList({ onCells, isDone = () => false, maxDurationMs }) {
  const startedAt = Date.now();
  let stableRounds = 0;
  let retries = 0;
  let previousSignature = "";

  while (!jobCancelled && !isDone() && Date.now() - startedAt < maxDurationMs) {
    const cells = getRenderedUserCells();
    await onCells(cells);
    if (jobCancelled || isDone()) break;

    const signature = getListSignature();
    const atBottom = isNearPageBottom();

    if (atBottom && signature === previousSignature && !isListLoading()) {
      stableRounds += 1;
      if (stableRounds === 1 && retries < 3 && clickRetryButton()) {
        retries += 1;
        stableRounds = 0;
        await sleep(2500);
        continue;
      }
      if (stableRounds >= 2) break;
    } else {
      stableRounds = 0;
    }

    previousSignature = signature;
    advancePastRenderedCells(getRenderedUserCells());
    await waitForListChange(signature, atBottom ? 2000 : 1200);
  }
}

function advancePastRenderedCells(cells) {
  const last = cells[cells.length - 1];
  if (!last) {
    window.scrollBy({ top: window.innerHeight * 0.8, behavior: "auto" });
    return;
  }
  const lastTop = last.getBoundingClientRect().top + window.scrollY;
  const target = Math.max(window.scrollY + 1, lastTop - 80);
  window.scrollTo({ top: target, behavior: "auto" });
}

function getListSignature() {
  const cells = getRenderedUserCells();
  return [
    findPrimaryHandle(cells[0] || document.createElement("div")),
    findPrimaryHandle(cells[cells.length - 1] || document.createElement("div")),
    cells.length,
    document.documentElement.scrollHeight
  ].join("|");
}

/**
 * Resolves as soon as the rendered cells change (new page arrived or the virtual list
 * re-rendered after scrolling), instead of sleeping a fixed amount every step.
 */
function waitForListChange(previousSignature, timeoutMs) {
  return new Promise((resolve) => {
    const target = getPrimaryColumn() || document.body;
    let done = false;
    const finish = async (changed) => {
      if (done) return;
      done = true;
      observer.disconnect();
      clearTimeout(timer);
      clearInterval(poll);
      // Let the current React commit finish painting before the cells are read.
      if (changed) await nextFrame();
      resolve(changed);
    };
    const check = () => {
      if (jobCancelled) finish(false);
      else if (getListSignature() !== previousSignature) finish(true);
    };
    const observer = new MutationObserver(check);
    observer.observe(target, { childList: true, subtree: true });
    const poll = setInterval(check, 150);
    const timer = setTimeout(() => finish(false), timeoutMs);
    check();
  });
}

function isNearPageBottom() {
  const scrollHeight = document.documentElement.scrollHeight;
  return window.scrollY + window.innerHeight >= scrollHeight - 160;
}

function isListLoading() {
  return Boolean(getPrimaryColumn()?.querySelector('[role="progressbar"]'));
}

function clickRetryButton() {
  const primary = getPrimaryColumn();
  if (!primary) return false;
  const button = [...primary.querySelectorAll('button, [role="button"]')].find((node) => {
    return /^(retry|try again|重试|重試|再試行|다시 시도)$/i.test(cleanText(node.textContent || ""));
  });
  if (!button) return false;
  button.click();
  return true;
}

function getRenderedUserCells() {
  const primary = getPrimaryColumn();
  if (!primary) return [];
  return [...primary.querySelectorAll('[data-testid="UserCell"]')]
    .map((cell) => ({ cell, rect: cell.getBoundingClientRect() }))
    .filter(({ rect }) => rect.height > 0)
    .sort((a, b) => a.rect.top - b.rect.top || a.rect.left - b.rect.left)
    .map(({ cell }) => cell);
}

function parseFollowingUserCell(cell) {
  const handle = findPrimaryHandle(cell);
  if (!handle) return null;

  return {
    handle,
    name: findDisplayName(cell, handle),
    avatar: findAvatarSrc(cell),
    followsYou: cellShowsFollowsYou(cell),
    isFollowing: Boolean(findFollowingButtonInCell(cell))
  };
}

function cellShowsFollowsYou(cell) {
  if (cell.querySelector('[data-testid="userFollowIndicator"]')) return true;
  const text = cleanText(cell.textContent || "").toLowerCase();
  return FOLLOWS_YOU_MARKERS.some((marker) => text.includes(marker));
}

function findDisplayName(cell, handle) {
  const handleToken = `@${handle.toLowerCase()}`;
  const links = [...cell.querySelectorAll('a[href^="/"]')];
  for (const link of links) {
    const text = cleanText(link.textContent || "");
    if (text && !text.startsWith("@") && text.toLowerCase() !== handleToken) return text;
  }
  const parts = cleanText(cell.textContent || "").split(/\s+/);
  const index = parts.findIndex((part) => part.toLowerCase() === handleToken);
  return index > 0 ? parts.slice(0, index).join(" ") : handle;
}

function findPrimaryHandle(cell) {
  for (const link of cell.querySelectorAll('a[href^="/"]')) {
    const path = (link.getAttribute("href") || "").split(/[?#]/)[0];
    if (path.split("/").filter(Boolean).length !== 1) continue;
    const handle = extractHandleFromPath(path);
    if (handle) return handle;
  }
  return "";
}

function findFollowingButtonInCell(cell) {
  return cell.querySelector('button[data-testid$="-unfollow"]');
}

function findAvatarSrc(cell) {
  const images = [...cell.querySelectorAll("img[src]")];
  const profileImage = images.find((image) => /profile_images/.test(image.src));
  return profileImage?.src || images.find((image) => image.src.startsWith("https://"))?.src || "";
}

// ---------- Unfollowing ----------

async function unfollowOnFollowingPage({ handles = [], orders = {}, scannedCount = 0 }) {
  await waitForFollowingListReady(30_000);

  const remaining = new Map();
  for (const handle of handles) {
    const normalized = normalizeHandle(handle);
    if (normalized) remaining.set(normalized.toLowerCase(), normalized);
  }
  const total = remaining.size;
  const progress = { done: [], failed: [], consecutiveFailures: 0, stopped: false, lastError: "" };
  const originalScrollY = window.scrollY;
  const finished = () => !remaining.size || progress.stopped;

  try {
    await unfollowRenderedTargets(remaining, progress, total);

    if (!finished() && !jobCancelled) {
      // Jump close to where the earliest target was seen during the scan instead of starting at the top.
      const firstOrder = Math.min(...[...remaining.keys()].map((key) => orders[key] || 1));
      const ratio = scannedCount ? Math.max(0, (firstOrder - 1) / scannedCount - 0.04) : 0;
      const startY = Math.floor(document.documentElement.scrollHeight * ratio);

      window.scrollTo({ top: startY, behavior: "auto" });
      await waitForListChange("", 500);
      await sweepList({
        maxDurationMs: 30 * 60 * 1000,
        isDone: finished,
        onCells: () => unfollowRenderedTargets(remaining, progress, total)
      });

      if (!finished() && startY > 0 && !jobCancelled) {
        window.scrollTo({ top: 0, behavior: "auto" });
        await waitForListChange("", 500);
        await sweepList({
          maxDurationMs: 15 * 60 * 1000,
          isDone: () => finished() || window.scrollY > startY + window.innerHeight,
          onCells: () => unfollowRenderedTargets(remaining, progress, total)
        });
      }
    }

    return {
      unfollowed: progress.done,
      failed: progress.failed,
      missing: [...remaining.values()],
      cancelled: jobCancelled,
      rateLimited: progress.stopped,
      lastError: progress.lastError
    };
  } finally {
    window.scrollTo({ top: originalScrollY, behavior: "auto" });
  }
}

async function unfollowRenderedTargets(remaining, progress, total) {
  while (!jobCancelled && remaining.size && !progress.stopped) {
    // Re-query every time: scrolling a cell into view makes X re-render the list,
    // so cells from an earlier query may already be detached.
    const cell = getRenderedUserCells().find((candidate) => remaining.has(findPrimaryHandle(candidate).toLowerCase()));
    if (!cell) return;
    const handle = findPrimaryHandle(cell);
    remaining.delete(handle.toLowerCase());

    const button = findFollowingButtonInCell(cell);
    if (!button) {
      // Already not following (e.g. unfollowed elsewhere): treat as done so it leaves the list.
      if (cell.querySelector('button[data-testid$="-follow"]')) {
        progress.done.push(handle);
        reportUnfollowProgress(handle, progress.done.length, total);
      } else {
        progress.failed.push(handle);
      }
      continue;
    }

    cell.scrollIntoView({ block: "center", behavior: "auto" });
    const toastsBefore = getToastTexts();
    button.click();
    const confirm = await waitForElement(findConfirmUnfollowButton, 4000, 50);
    if (!confirm) {
      dismissConfirmSheet();
      recordUnfollowFailure(progress, handle, toastsBefore);
      if (progress.stopped) return;
      continue;
    }

    confirm.click();
    const result = await waitForUnfollowResult(handle);
    if (result !== "done") {
      dismissConfirmSheet();
      recordUnfollowFailure(progress, handle, toastsBefore);
      if (progress.stopped) return;
      await sleep(1200);
      continue;
    }

    progress.consecutiveFailures = 0;
    progress.done.push(handle);
    reportUnfollowProgress(handle, progress.done.length, total);
    // Human-like pacing keeps X from rate limiting the account.
    await sleep(200 + Math.random() * 400);
  }
}

/**
 * X flips the button optimistically and flips it back (with a toast) if the request is
 * rejected, e.g. when the account hits its unfollow limit. So a flip alone is not proof:
 * the user's cell is looked up again by handle (cells get recycled while scrolling) and
 * must still show "Follow" after a short settle period.
 */
async function waitForUnfollowResult(handle) {
  const flipped = await waitForElement(() => {
    const cell = findRenderedCellByHandle(handle);
    return cell && cellShowsNotFollowing(cell) ? cell : null;
  }, 3000, 50);
  if (!flipped) return "failed";

  await sleep(700);
  const cell = findRenderedCellByHandle(handle);
  if (cell && !cellShowsNotFollowing(cell)) return "reverted";
  return "done";
}

function recordUnfollowFailure(progress, handle, toastsBefore) {
  progress.failed.push(handle);
  progress.consecutiveFailures = (progress.consecutiveFailures || 0) + 1;
  const toast = getToastTexts().find((text) => !toastsBefore.includes(text));
  if (toast) progress.lastError = toast;
  // A few failures in a row almost always means X is refusing unfollows for now.
  if (progress.consecutiveFailures >= 3) progress.stopped = true;
}

function findRenderedCellByHandle(handle) {
  const key = handle.toLowerCase();
  return getRenderedUserCells().find((cell) => findPrimaryHandle(cell).toLowerCase() === key) || null;
}

function cellShowsNotFollowing(cell) {
  return !findFollowingButtonInCell(cell) && Boolean(cell.querySelector('button[data-testid$="-follow"]'));
}

function getToastTexts() {
  return [...document.querySelectorAll('[data-testid="toast"], [role="alert"]')]
    .map((node) => cleanText(node.textContent || ""))
    .filter(Boolean);
}

function dismissConfirmSheet() {
  const cancel = document.querySelector('[data-testid="confirmationSheetCancel"]');
  if (cancel) {
    cancel.click();
    return;
  }
  if (document.querySelector('[role="alertdialog"], [data-testid="confirmationSheetDialog"]')) {
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", code: "Escape", keyCode: 27, bubbles: true }));
  }
}

function findConfirmUnfollowButton() {
  const direct = document.querySelector('[data-testid="confirmationSheetConfirm"]');
  if (direct) return direct;
  const dialog = document.querySelector('[role="alertdialog"], [data-testid="confirmationSheetDialog"]');
  if (!dialog) return null;
  return [...dialog.querySelectorAll('button, [role="button"]')].find((button) => {
    const label = cleanText(`${button.getAttribute("aria-label") || ""} ${button.textContent || ""}`);
    return /unfollow|取消关注|取消跟隨|フォロー解除|언팔로우/i.test(label);
  }) || null;
}

function reportUnfollowProgress(handle, done, total) {
  chrome.runtime.sendMessage({ type: "UNFOLLOW_PROGRESS", handle, done, total }).catch(() => {});
}

// ---------- Helpers ----------

function getPrimaryColumn() {
  return document.querySelector('[data-testid="primaryColumn"]');
}

async function waitForFollowingListReady(timeoutMs) {
  const startedAt = Date.now();
  const firstCell = await waitForElement(
    () => getPrimaryColumn()?.querySelector('[data-testid="UserCell"]'),
    Math.min(timeoutMs, 12_000)
  );
  if (firstCell) return firstCell;

  const remaining = Math.max(1000, timeoutMs - (Date.now() - startedAt));
  return waitForElement(() => getPrimaryColumn(), remaining);
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

function t(key, ...substitutions) {
  return chrome.i18n.getMessage(key, substitutions.map(String)) || key;
}

function cleanText(text) {
  return String(text || "").replace(/\s+/g, " ").trim();
}

function waitForElement(getter, timeoutMs, intervalMs = 120) {
  return new Promise((resolve) => {
    const existing = getter();
    if (existing) {
      resolve(existing);
      return;
    }

    const startedAt = Date.now();
    const timer = setInterval(() => {
      const element = getter();
      if (element || jobCancelled || Date.now() - startedAt > timeoutMs) {
        clearInterval(timer);
        resolve(element || null);
      }
    }, intervalMs);
  });
}

function nextFrame() {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
})();
