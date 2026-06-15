const X_ORIGIN = "https://x.com";

const DEFAULT_STATE = {
  status: "idle",
  message: "打开 X 后点击开始检测",
  account: "",
  followingCount: 0,
  scannedCount: 0,
  nonFollowers: [],
  unfollowedCount: 0,
  lastUpdated: 0
};

let state = { ...DEFAULT_STATE };
let currentJob = null;

const stateReady = restoreState();

chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false }).catch(() => {});
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    if (message?.type === "GET_STATE") {
      await stateReady;
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
      await openSidePanel(sender);
      sendResponse({ ok: true });
      return;
    }

    if (message?.type === "START_SCAN") {
      if (currentJob) {
        sendResponse({ ok: false, error: "已有任务正在运行" });
        return;
      }
      startScan(message.account).catch(handleDetachedError);
      sendResponse({ ok: true });
      return;
    }

    if (message?.type === "CLEAR_RESULTS") {
      clearResults();
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
      await openProfile(message.handle);
      sendResponse({ ok: true });
      return;
    }

    if (message?.type === "BATCH_UNFOLLOW") {
      if (currentJob) {
        sendResponse({ ok: false, error: "已有任务正在运行" });
        return;
      }
      batchUnfollow().catch(handleDetachedError);
      sendResponse({ ok: true });
      return;
    }

    sendResponse({ ok: false, error: "Unknown message" });
  })().catch((error) => {
    setState({ status: "error", message: error.message || String(error) });
    sendResponse({ ok: false, error: error.message || String(error) });
  });
  return true;
});

async function openSidePanel(sender) {
  const windowId = sender?.tab?.windowId || (await chrome.windows.getCurrent()).id;
  await chrome.sidePanel.open({ windowId });
}

async function startScan(inputAccount) {
  if (currentJob) throw new Error("已有任务正在运行");

  const job = createJob();
  currentJob = job;

  try {
    setState({
      ...DEFAULT_STATE,
      status: "detecting",
      message: "正在识别当前登录账号..."
    });

    const activeTab = await getActiveXTab();
    job.tabId = activeTab.id;

    const account = normalizeHandle(inputAccount) || (await detectAccountFromTab(activeTab.id));
    if (!account) {
      throw new Error("未能识别当前登录账号。请在输入框填写你的 X 用户名后重试。");
    }

    ensureNotCancelled(job);
    const following = await scanFollowingInTab(activeTab.id, account, job);
    ensureNotCancelled(job);

    const nonFollowers = uniqueUsers(following)
      .filter((user) => user.isFollowing && !user.followsYou)
      .map((user) => ({ ...user, verified: true }))
      .sort((a, b) => a.handle.localeCompare(b.handle));

    setState({
      status: "done",
      account,
      followingCount: following.length,
      scannedCount: following.length,
      nonFollowers,
      message: `检测完成：扫描 ${following.length} 个关注，发现 ${nonFollowers.length} 个未回关`
    });
  } catch (error) {
    if (error.name === "AbortError") {
      setState({ status: "idle", message: "任务已取消" });
      return;
    }
    setState({ status: "error", message: error.message || String(error) });
  } finally {
    if (currentJob === job) currentJob = null;
  }
}

async function detectAccountFromTab(tabId) {
  const response = await sendToTabWithInjection(tabId, { type: "DETECT_ACCOUNT" }, 10_000);
  return normalizeHandle(response?.account);
}

async function scanFollowingInTab(tabId, account, job) {
  const targetUrl = `${X_ORIGIN}/${account}/following`;

  setState({
    account,
    status: "scanning",
    message: `正在打开 @${account} 的关注列表...`
  });

  const tab = await chrome.tabs.get(tabId);
  if (!samePath(tab.url, targetUrl)) {
    await chrome.tabs.update(tabId, { url: targetUrl, active: true });
    await waitForTabLoaded(tabId, job);
  }

  ensureNotCancelled(job);
  await delay(1500, job);

  setState({
    status: "scanning",
    message: "正在扫描当前关注列表页面..."
  });

  const response = await sendToTabWithInjection(tabId, {
    type: "SCAN_FOLLOWING_PAGE",
    account
  }, 30 * 60_000);

  if (!response?.ok) {
    throw new Error(response?.error || "读取关注列表失败");
  }
  return response.users || [];
}

async function getActiveXTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !isXUrl(tab.url)) {
    throw new Error("请先打开 X 网站，再启动检测。");
  }
  return tab;
}

async function openProfile(handle) {
  const normalized = normalizeHandle(handle);
  if (!normalized) return;
  const tab = await getActiveXTab();
  await chrome.tabs.update(tab.id, { url: `${X_ORIGIN}/${normalized}`, active: true });
}

async function batchUnfollow() {
  const targets = uniqueUsers(state.nonFollowers).filter((user) => user.handle);
  if (!targets.length) return;
  if (currentJob) throw new Error("已有任务正在运行");

  const job = createJob();
  currentJob = job;

  try {
    const tab = await getActiveXTab();
    job.tabId = tab.id;
    const account = normalizeHandle(state.account) || (await detectAccountFromTab(tab.id));
    if (!account) {
      throw new Error("未能识别当前账号。请先重新检测。");
    }

    const targetUrl = `${X_ORIGIN}/${account}/following`;
    setState({
      status: "unfollowing",
      account,
      unfollowedCount: 0,
      message: `准备取关 ${targets.length} 个未回关用户...`
    });

    if (!samePath(tab.url, targetUrl)) {
      await chrome.tabs.update(tab.id, { url: targetUrl, active: true });
      await waitForTabLoaded(tab.id, job);
    }

    ensureNotCancelled(job);
    await delay(1200, job);

    const response = await sendToTabWithInjection(tab.id, {
      type: "BATCH_UNFOLLOW_ON_FOLLOWING_PAGE",
      handles: targets.map((user) => user.handle)
    }, 30 * 60_000);

    if (!response?.ok) {
      throw new Error(response?.error || "批量取关失败");
    }

    const unfollowed = new Set((response.unfollowed || []).map((handle) => handle.toLowerCase()));
    const remaining = state.nonFollowers.filter((user) => !unfollowed.has(user.handle.toLowerCase()));
    const failedCount = targets.length - unfollowed.size;

    setState({
      status: "done",
      unfollowedCount: unfollowed.size,
      nonFollowers: remaining,
      message: `取关完成：成功 ${unfollowed.size} 个${failedCount ? `，${failedCount} 个未处理` : ""}`
    });
  } catch (error) {
    if (error.name === "AbortError") {
      setState({ status: "done", message: "取关任务已取消" });
      return;
    }
    setState({ status: "error", message: error.message || String(error) });
  } finally {
    if (currentJob === job) currentJob = null;
  }
}

function setState(partial) {
  state = {
    ...state,
    ...partial,
    lastUpdated: Date.now()
  };
  chrome.storage.session?.set({ state }).catch(() => {});
  chrome.runtime.sendMessage({ type: "STATE_CHANGED", state }).catch(() => {});
}

function resetState() {
  cancelCurrentJob();
  setState({ ...DEFAULT_STATE });
}

function clearResults() {
  setState({
    status: "idle",
    message: "已清空结果，可以重新开始检测",
    followingCount: 0,
    scannedCount: 0,
    nonFollowers: [],
    unfollowedCount: 0
  });
}

function handleDetachedError(error) {
  setState({ status: "error", message: error.message || String(error) });
}

function updateScanProgress(message) {
  if (state.status !== "scanning") return;
  const count = Number(message.count) || 0;
  setState({
    followingCount: Math.max(state.followingCount, count),
    scannedCount: Math.max(state.scannedCount, count),
    message: `正在扫描关注列表，已发现 ${count} 个用户...`
  });
}

function updateUnfollowProgress(message) {
  if (state.status !== "unfollowing") return;
  const done = Number(message.done) || 0;
  const total = Number(message.total) || 0;
  setState({
    unfollowedCount: done,
    message: `正在取关未回关用户：${done}/${total}`
  });
}

async function restoreState() {
  try {
    const stored = await chrome.storage.session?.get("state");
    if (stored?.state) {
      state = {
        ...DEFAULT_STATE,
        ...stored.state,
        scannedCount: stored.state.scannedCount ?? stored.state.verifiedCount ?? 0,
        status: ["detecting", "scanning", "unfollowing"].includes(stored.state.status) ? "idle" : stored.state.status,
        message: ["detecting", "scanning", "unfollowing"].includes(stored.state.status)
          ? "上次任务已中断，请重新开始"
          : stored.state.message
      };
    }
  } catch {
    state = { ...DEFAULT_STATE };
  }
}

function createJob() {
  return { cancelled: false, tabId: null };
}

function cancelCurrentJob() {
  if (!currentJob) return;
  currentJob.cancelled = true;
  if (currentJob.tabId) {
    chrome.tabs.sendMessage(currentJob.tabId, { type: "CANCEL_SCAN" }).catch(() => {});
  }
}

function ensureNotCancelled(job) {
  if (job?.cancelled) {
    const error = new Error("任务已取消");
    error.name = "AbortError";
    throw error;
  }
}

function waitForTabLoaded(tabId, job) {
  return new Promise((resolve, reject) => {
    let cancelTimer;
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error("页面加载超时"));
    }, 45_000);

    const listener = (updatedTabId, info) => {
      if (updatedTabId === tabId && info.status === "complete") {
        cleanup();
        resolve();
      }
    };

    const cleanup = () => {
      clearTimeout(timer);
      if (cancelTimer) clearInterval(cancelTimer);
      chrome.tabs.onUpdated.removeListener(listener);
    };

    chrome.tabs.onUpdated.addListener(listener);
    chrome.tabs.get(tabId).then((tab) => {
      if (tab.status === "complete") {
        cleanup();
        resolve();
      }
    }).catch((error) => {
      cleanup();
      reject(error);
    });

    cancelTimer = setInterval(() => {
      if (job?.cancelled) {
        cleanup();
        const error = new Error("任务已取消");
        error.name = "AbortError";
        reject(error);
      }
    }, 250);
  });
}

function sendToTab(tabId, message, timeoutMs) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("页面脚本响应超时")), timeoutMs);
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
    if (!shouldInjectContentScript(error)) throw error;
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ["src/content.js"]
    });
    await delay(300);
    return sendToTab(tabId, message, timeoutMs);
  }
}

function shouldInjectContentScript(error) {
  return /receiving end|Could not establish connection/i.test(error?.message || "");
}

function delay(ms, job) {
  return new Promise((resolve, reject) => {
    let cancelTimer;
    const cleanup = () => {
      clearTimeout(timer);
      if (cancelTimer) clearInterval(cancelTimer);
    };
    const timer = setTimeout(() => {
      cleanup();
      resolve();
    }, ms);
    if (!job) return;
    cancelTimer = setInterval(() => {
      if (job.cancelled) {
        cleanup();
        const error = new Error("任务已取消");
        error.name = "AbortError";
        reject(error);
      }
    }, 250);
  });
}

function uniqueUsers(users) {
  const map = new Map();
  for (const user of users || []) {
    const handle = normalizeHandle(user?.handle);
    if (!handle || map.has(handle.toLowerCase())) continue;
    map.set(handle.toLowerCase(), {
      handle,
      name: user.name || handle,
      avatar: user.avatar || "",
      followsYou: Boolean(user.followsYou),
      isFollowing: Boolean(user.isFollowing)
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
  return /^https:\/\/(x|twitter)\.com\//.test(url || "");
}

function samePath(left, right) {
  try {
    const leftUrl = new URL(left);
    const rightUrl = new URL(right);
    return leftUrl.origin === rightUrl.origin && leftUrl.pathname.replace(/\/$/, "") === rightUrl.pathname;
  } catch {
    return false;
  }
}
