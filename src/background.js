const X_ORIGIN = "https://x.com";
const CONTENT_SCRIPT_FILES = ["src/panel-view.js", "src/content.js"];
const LAST_TOTALS_KEY = "lastFollowingTotals";
const BUSY_STATUSES = new Set(["detecting", "scanning", "unfollowing"]);

const DEFAULT_STATE = {
  status: "idle",
  message: t("msgIdle"),
  account: "",
  totalFollowing: 0,
  followingCount: 0,
  scannedCount: 0,
  scanStartedAt: 0,
  nonFollowers: [],
  unfollowingHandles: [],
  unfollowTotal: 0,
  unfollowDone: 0,
  unfollowedCount: 0,
  lastUpdated: 0
};

let state = { ...DEFAULT_STATE };
let currentJob = null;
let resultsWindowId = null;

const stateReady = restoreState();

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    await stateReady;

    if (message?.type === "GET_STATE") {
      sendResponse({ ok: true, state });
      return;
    }

    if (message?.type === "SCAN_PROGRESS") {
      updateScanProgress(message);
      sendResponse({ ok: true });
      return;
    }

    if (message?.type === "UNFOLLOW_PROGRESS") {
      updateUnfollowProgress(message);
      sendResponse({ ok: true });
      return;
    }

    if (message?.type === "OPEN_PANEL") {
      await openPagePanel(sender);
      sendResponse({ ok: true });
      return;
    }

    if (message?.type === "START_SCAN") {
      if (currentJob) {
        sendResponse({ ok: false, error: t("errBusy") });
        return;
      }
      const tab = await getSourceXTab(sender);
      startScan(tab, message.account).catch(handleDetachedError);
      sendResponse({ ok: true });
      return;
    }

    if (message?.type === "CANCEL_JOB") {
      cancelCurrentJob();
      sendResponse({ ok: true });
      return;
    }

    if (message?.type === "RESET_STATE") {
      resetState();
      sendResponse({ ok: true });
      return;
    }

    if (message?.type === "OPEN_PROFILE") {
      await openProfile(message.handle, sender);
      sendResponse({ ok: true });
      return;
    }

    if (message?.type === "UNFOLLOW_USERS" || message?.type === "BATCH_UNFOLLOW") {
      if (currentJob) {
        sendResponse({ ok: false, error: t("errBusy") });
        return;
      }
      const tab = await getSourceXTab(sender);
      const handles = message.handles || state.nonFollowers.map((user) => user.handle);
      unfollowUsers(tab, handles).catch(handleDetachedError);
      sendResponse({ ok: true });
      return;
    }

    sendResponse({ ok: false, error: "Unknown message" });
  })().catch((error) => {
    sendResponse({ ok: false, error: error.message || String(error) });
  });
  return true;
});

// ---------- Panel ----------

async function openPagePanel(sender) {
  const tab = await getSourceXTab(sender);
  await showResultsOnTab(tab.id, { fallbackToWindow: true });
}

async function showResultsOnTab(tabId, { fallbackToWindow = false } = {}) {
  try {
    const response = await sendToTabWithInjection(tabId, { type: "SHOW_FLOATING_RESULTS", state }, 5000);
    if (response?.ok) return;
  } catch {
    // The page may be navigating; it restores the panel by itself once loaded.
  }
  if (fallbackToWindow) await openOrFocusResultsWindow();
}

async function openOrFocusResultsWindow() {
  if (resultsWindowId) {
    try {
      await chrome.windows.update(resultsWindowId, { focused: true });
      return;
    } catch {
      resultsWindowId = null;
    }
  }

  const created = await chrome.windows.create({
    url: chrome.runtime.getURL("popup/popup.html"),
    type: "popup",
    width: 400,
    height: 640,
    focused: true
  });
  resultsWindowId = created?.id || null;
}

// ---------- Scan ----------

async function startScan(tab, inputAccount) {
  if (currentJob) throw new Error(t("errBusy"));

  const job = createJob(tab.id);
  currentJob = job;

  try {
    setState({
      ...DEFAULT_STATE,
      unfollowedCount: 0,
      status: "detecting",
      message: t("msgDetecting")
    });
    await showResultsOnTab(tab.id);

    const account = normalizeHandle(inputAccount) || (await detectAccountFromTab(tab.id));
    if (!account) {
      throw new Error(t("errNoAccount"));
    }

    setState({ account, status: "detecting", message: t("msgOpeningFollowing", account) });
    const totalFollowing = await openFollowingList(tab.id, account, job);
    ensureNotCancelled(job);

    setState({
      status: "scanning",
      totalFollowing,
      scanStartedAt: Date.now(),
      message: t("msgScanning")
    });

    const response = await sendToTabWithInjection(tab.id, { type: "SCAN_FOLLOWING_PAGE", account }, 45 * 60_000);
    if (!response?.ok) throw new Error(response?.error || t("errReadFailed"));

    const following = uniqueUsers(response.users);
    const nonFollowers = following.filter((user) => user.isFollowing && !user.followsYou);
    const cancelled = Boolean(response.cancelled || job.cancelled);

    if (!cancelled) await saveLastTotal(account, following.length);

    setState({
      status: "done",
      account,
      totalFollowing: cancelled ? state.totalFollowing : following.length,
      followingCount: following.length,
      scannedCount: following.length,
      nonFollowers,
      message: cancelled
        ? t("msgScanStopped", following.length)
        : t("msgScanDone", formatDuration(Date.now() - state.scanStartedAt))
    });
  } catch (error) {
    if (error.name === "AbortError") {
      setState({ status: "idle", message: t("msgCancelled") });
      return;
    }
    setState({ status: "error", message: error.message || String(error) });
  } finally {
    if (currentJob === job) currentJob = null;
  }
}

/**
 * Lands the tab on /{account}/following. Going through the profile page lets us read the
 * following count (for the progress bar) and then switch routes inside X's app, which is
 * quicker than a full page load.
 */
async function openFollowingList(tabId, account, job) {
  const profileUrl = `${X_ORIGIN}/${account}`;
  const followingUrl = `${profileUrl}/following`;
  const tab = await chrome.tabs.get(tabId);

  if (samePath(tab.url, followingUrl)) {
    return getLastTotal(account);
  }

  if (!samePath(tab.url, profileUrl)) {
    await navigateTab(tabId, profileUrl, job);
  }

  let prepared = null;
  try {
    prepared = await sendToTabWithInjection(tabId, { type: "PREPARE_FOLLOWING", account }, 60_000);
  } catch {
    prepared = null;
  }
  ensureNotCancelled(job);

  if (!prepared?.navigated) {
    await navigateTab(tabId, followingUrl, job);
    await delay(800, job);
  }

  return prepared?.total || getLastTotal(account);
}

async function detectAccountFromTab(tabId) {
  const response = await sendToTabWithInjection(tabId, { type: "DETECT_ACCOUNT" }, 10_000);
  return normalizeHandle(response?.account);
}

function updateScanProgress(message) {
  if (state.status !== "scanning") return;
  const count = Number(message.count) || 0;
  const additions = uniqueUsers(message.nonFollowers || []);
  let nonFollowers = state.nonFollowers;
  if (additions.length) {
    const known = new Set(nonFollowers.map((user) => user.handle.toLowerCase()));
    nonFollowers = nonFollowers.concat(additions.filter((user) => !known.has(user.handle.toLowerCase())));
  }
  setState({
    followingCount: Math.max(state.followingCount, count),
    scannedCount: Math.max(state.scannedCount, count),
    nonFollowers,
    message: t("msgScanning")
  });
}

// ---------- Unfollow ----------

async function unfollowUsers(tab, handles) {
  const wanted = new Set((handles || []).map((handle) => normalizeHandle(handle).toLowerCase()).filter(Boolean));
  const targets = state.nonFollowers.filter((user) => wanted.has(user.handle.toLowerCase()));
  if (!targets.length) return;
  if (currentJob) throw new Error(t("errBusy"));

  const job = createJob(tab.id);
  currentJob = job;
  const previousMessage = state.message;

  try {
    const account = normalizeHandle(state.account) || (await detectAccountFromTab(tab.id));
    if (!account) throw new Error(t("errNoAccountUnfollow"));

    setState({
      status: "unfollowing",
      account,
      unfollowingHandles: targets.map((user) => user.handle),
      unfollowTotal: targets.length,
      unfollowDone: 0,
      message: targets.length === 1 ? t("msgUnfollowingOne", targets[0].handle) : t("msgUnfollowingMany", targets.length)
    });

    const followingUrl = `${X_ORIGIN}/${account}/following`;
    const current = await chrome.tabs.get(tab.id);
    if (!samePath(current.url, followingUrl)) {
      await navigateTab(tab.id, followingUrl, job);
      await delay(1000, job);
    }
    ensureNotCancelled(job);

    const orders = {};
    for (const user of targets) orders[user.handle.toLowerCase()] = user.order || 0;

    const response = await sendToTabWithInjection(tab.id, {
      type: "UNFOLLOW_ON_FOLLOWING_PAGE",
      handles: targets.map((user) => user.handle),
      orders,
      scannedCount: state.scannedCount
    }, 35 * 60_000);
    if (!response?.ok) throw new Error(response?.error || t("errUnfollowFailed"));

    const done = new Set((response.unfollowed || []).map((handle) => handle.toLowerCase()));
    const notDone = targets.length - done.size;
    const stopped = response.cancelled || job.cancelled;
    const nonFollowers = state.nonFollowers.filter((user) => !done.has(user.handle.toLowerCase()));

    if (response.rateLimited) {
      // Not-done users stay in the list so they can be retried later.
      setState({
        status: "error",
        unfollowingHandles: [],
        nonFollowers,
        message: t("msgRateLimited", done.size, notDone) +
          (response.lastError ? t("msgXSays", response.lastError.slice(0, 80)) : "")
      });
      return;
    }

    setState({
      status: "done",
      unfollowingHandles: [],
      nonFollowers,
      message: stopped
        ? t("msgUnfollowStopped", done.size)
        : (notDone ? t("msgUnfollowPartial", done.size, notDone) : t("msgUnfollowDone", done.size))
    });
  } catch (error) {
    if (error.name === "AbortError") {
      setState({ status: "done", unfollowingHandles: [], message: previousMessage });
      return;
    }
    setState({ status: "error", unfollowingHandles: [], message: error.message || String(error) });
  } finally {
    if (currentJob === job) currentJob = null;
  }
}

function updateUnfollowProgress(message) {
  if (state.status !== "unfollowing") return;
  const key = normalizeHandle(message.handle).toLowerCase();
  setState({
    unfollowDone: Number(message.done) || state.unfollowDone,
    unfollowedCount: state.unfollowedCount + 1,
    nonFollowers: state.nonFollowers.filter((user) => user.handle.toLowerCase() !== key),
    unfollowingHandles: state.unfollowingHandles.filter((handle) => handle.toLowerCase() !== key)
  });
}

// ---------- Tabs ----------

async function getSourceXTab(sender) {
  if (sender?.tab?.id && isXUrl(sender.tab.url)) return sender.tab;
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (tab?.id && isXUrl(tab.url)) return tab;
  if (currentJob?.tabId) return chrome.tabs.get(currentJob.tabId);
  // The standalone results window has no X tab of its own; use the X tab showing in another window.
  const activeTabs = await chrome.tabs.query({ active: true, windowType: "normal" });
  const xTab = activeTabs.find((candidate) => candidate.id && isXUrl(candidate.url));
  if (xTab) return xTab;
  throw new Error(t("errOpenX"));
}

async function openProfile(handle, sender) {
  const normalized = normalizeHandle(handle);
  if (!normalized) return;
  const url = `${X_ORIGIN}/${normalized}`;
  let source = null;
  try {
    source = await getSourceXTab(sender);
  } catch {
    source = null;
  }
  await chrome.tabs.create(source
    ? { url, active: false, openerTabId: source.id, windowId: source.windowId, index: source.index + 1 }
    : { url, active: true });
}

async function navigateTab(tabId, url, job) {
  await chrome.tabs.update(tabId, { url, active: true });
  await waitForTabAt(tabId, url, job);
}

function waitForTabAt(tabId, url, job) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      clearInterval(poll);
      chrome.tabs.onUpdated.removeListener(listener);
      if (error) reject(error);
      else resolve();
    };

    const check = async () => {
      try {
        const tab = await chrome.tabs.get(tabId);
        if (tab.status === "complete" && samePath(tab.url, url)) finish();
      } catch (error) {
        finish(error);
      }
    };

    const listener = (updatedTabId, info) => {
      if (updatedTabId === tabId && (info.status === "complete" || info.url)) check();
    };

    const timer = setTimeout(() => finish(new Error(t("errPageTimeout"))), 45_000);
    const poll = setInterval(() => {
      if (job?.cancelled) finish(abortError());
      else check();
    }, 400);

    chrome.tabs.onUpdated.addListener(listener);
    check();
  });
}

function sendToTab(tabId, message, timeoutMs) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(t("errNoResponse"))), timeoutMs);
    chrome.tabs.sendMessage(tabId, message, (response) => {
      clearTimeout(timer);
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve(response);
    });
  });
}

async function sendToTabWithInjection(tabId, message, timeoutMs) {
  try {
    return await sendToTab(tabId, message, timeoutMs);
  } catch (error) {
    if (!/receiving end|Could not establish connection/i.test(error?.message || "")) throw error;
    await chrome.scripting.executeScript({ target: { tabId }, files: CONTENT_SCRIPT_FILES });
    await delay(300);
    return sendToTab(tabId, message, timeoutMs);
  }
}

// ---------- State ----------

function setState(partial) {
  state = { ...state, ...partial, lastUpdated: Date.now() };
  chrome.storage.session?.set({ state }).catch(() => {});
  chrome.runtime.sendMessage({ type: "STATE_CHANGED", state }).catch(() => {});
  notifyContentPanels(state);
}

function resetState() {
  cancelCurrentJob();
  setState({ ...DEFAULT_STATE });
}

function handleDetachedError(error) {
  setState({ status: "error", unfollowingHandles: [], message: error.message || String(error) });
}

function notifyContentPanels(nextState) {
  chrome.tabs.query({
    url: ["https://x.com/*", "https://*.x.com/*", "https://twitter.com/*", "https://*.twitter.com/*"]
  }).then((tabs) => {
    for (const tab of tabs) {
      if (!tab.id) continue;
      chrome.tabs.sendMessage(tab.id, { type: "UPDATE_FLOATING_RESULTS", state: nextState }).catch(() => {});
    }
  }).catch(() => {});
}

async function restoreState() {
  try {
    const stored = await chrome.storage.session?.get("state");
    if (stored?.state) {
      const interrupted = BUSY_STATUSES.has(stored.state.status);
      state = {
        ...DEFAULT_STATE,
        ...stored.state,
        unfollowingHandles: [],
        status: interrupted ? "done" : stored.state.status,
        message: interrupted ? t("msgInterrupted") : stored.state.message
      };
    }
  } catch {
    state = { ...DEFAULT_STATE };
  }
}

async function getLastTotal(account) {
  try {
    const stored = await chrome.storage.local.get(LAST_TOTALS_KEY);
    return Number(stored?.[LAST_TOTALS_KEY]?.[account.toLowerCase()]) || 0;
  } catch {
    return 0;
  }
}

async function saveLastTotal(account, total) {
  try {
    const stored = await chrome.storage.local.get(LAST_TOTALS_KEY);
    const totals = { ...(stored?.[LAST_TOTALS_KEY] || {}), [account.toLowerCase()]: total };
    await chrome.storage.local.set({ [LAST_TOTALS_KEY]: totals });
  } catch {
    // Only used for the progress estimate.
  }
}

// ---------- Jobs ----------

function createJob(tabId) {
  return { cancelled: false, tabId };
}

function cancelCurrentJob() {
  if (!currentJob) return;
  currentJob.cancelled = true;
  if (currentJob.tabId) {
    chrome.tabs.sendMessage(currentJob.tabId, { type: "CANCEL_SCAN" }).catch(() => {});
  }
}

function ensureNotCancelled(job) {
  if (job?.cancelled) throw abortError();
}

function abortError() {
  const error = new Error(t("errCancelled"));
  error.name = "AbortError";
  return error;
}

function delay(ms, job) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      clearInterval(cancelTimer);
      resolve();
    }, ms);
    const cancelTimer = setInterval(() => {
      if (job?.cancelled) {
        clearTimeout(timer);
        clearInterval(cancelTimer);
        reject(abortError());
      }
    }, 200);
  });
}

// ---------- Utils ----------

function uniqueUsers(users) {
  const map = new Map();
  let fallbackOrder = 0;
  for (const user of users || []) {
    const handle = normalizeHandle(user?.handle);
    if (!handle || map.has(handle.toLowerCase())) continue;
    fallbackOrder += 1;
    map.set(handle.toLowerCase(), {
      handle,
      name: user.name || handle,
      avatar: user.avatar || "",
      followsYou: Boolean(user.followsYou),
      isFollowing: Boolean(user.isFollowing),
      order: Number.isFinite(user.order) ? user.order : fallbackOrder
    });
  }
  return [...map.values()];
}

function normalizeHandle(value) {
  return String(value || "")
    .trim()
    .replace(/^@/, "")
    .match(/^[A-Za-z0-9_]{1,15}$/)?.[0] || "";
}

function isXUrl(url) {
  return /^https:\/\/([a-z0-9-]+\.)?(x|twitter)\.com\//.test(url || "");
}

function samePath(left, right) {
  try {
    const leftUrl = new URL(left);
    const rightUrl = new URL(right);
    return leftUrl.origin === rightUrl.origin &&
      leftUrl.pathname.replace(/\/$/, "").toLowerCase() === rightUrl.pathname.replace(/\/$/, "").toLowerCase();
  } catch {
    return false;
  }
}

function formatDuration(ms) {
  const seconds = Math.max(1, Math.round(ms / 1000));
  if (seconds < 60) return t("durationSeconds", seconds);
  return t("durationMinSec", Math.floor(seconds / 60), seconds % 60);
}

function t(key, ...substitutions) {
  return chrome.i18n.getMessage(key, substitutions.map(String)) || key;
}
