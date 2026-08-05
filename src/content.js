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
let floatingPanel = null;
let floatingState = null;
let floatingListScrollTop = 0;
let floatingPanelPosition = null;
const floatingFilters = {
  query: "",
  sort: "following"
};
let lastScanReportAt = 0;
let lastScanReportCount = 0;

const FLOATING_PANEL_POSITION_KEY = "xUnfollowDetectorFloatingPanelPosition";

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
      const users = await scanFollowingPage(message.account);
      sendResponse({ ok: true, users });
      return;
    }

    if (message?.type === "BATCH_UNFOLLOW_ON_FOLLOWING_PAGE") {
      scanCancelled = false;
      const result = await batchUnfollowOnFollowingPage(message.handles || []);
      sendResponse({ ok: true, ...result });
      return;
    }

    if (message?.type === "SHOW_FLOATING_RESULTS") {
      showFloatingResults(message.state || await getCurrentState());
      sendResponse({ ok: true });
      return;
    }

    if (message?.type === "UPDATE_FLOATING_RESULTS") {
      const nextState = message.state || await getCurrentState();
      if (floatingPanel) {
        renderFloatingResults(nextState);
      } else if (shouldAutoShowFloatingPanel(nextState)) {
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
  if (shouldRestoreFloatingPanel(state)) showFloatingResults(state);
}

function detectCurrentAccount() {
  const accountButton = document.querySelector('[data-testid="SideNav_AccountSwitcher_Button"]');
  const buttonText = cleanText(accountButton?.textContent || "");
  return findHandleInText(buttonText);
}

function shouldRestoreFloatingPanel(state) {
  return ["detecting", "scanning", "unfollowing"].includes(state?.status);
}

function shouldAutoShowFloatingPanel(state) {
  return ["detecting", "scanning", "unfollowing"].includes(state?.status);
}

function showFloatingResults(state) {
  ensureFloatingPanel();
  renderFloatingResults(state || createEmptyFloatingState());
}

function ensureFloatingPanel() {
  if (floatingPanel?.host?.isConnected) return floatingPanel;

  const host = document.createElement("div");
  host.id = "x-unfollow-detector-floating-panel";
  const shadow = host.attachShadow({ mode: "open" });
  shadow.innerHTML = `
    <style>
      :host {
        all: initial;
        color-scheme: light;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }

      * {
        box-sizing: border-box;
      }

      .panel {
        position: fixed;
        top: 72px;
        right: 18px;
        z-index: 2147483647;
        display: grid;
        width: min(410px, calc(100vw - 24px));
        max-height: calc(100vh - 92px);
        overflow: hidden;
        border: 1px solid #d7dce2;
        border-radius: 10px;
        background: #f7f8fa;
        box-shadow: 0 18px 50px rgba(15, 20, 25, 0.22);
        color: #16181c;
      }

      .panel.dragging {
        user-select: none;
      }

      .header,
      .result-bar,
      .row-actions {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
      }

      .header {
        cursor: move;
        padding: 14px 14px 10px;
        user-select: none;
      }

      .header button {
        cursor: pointer;
      }

      h2,
      p {
        margin: 0;
      }

      h2 {
        font-size: 17px;
        line-height: 1.2;
      }

      .status {
        margin-top: 4px;
        color: #536471;
        font-size: 12px;
        line-height: 1.35;
      }

      button,
      input,
      select {
        font: inherit;
      }

      button,
      select {
        min-height: 34px;
        border: 1px solid #d7dce2;
        border-radius: 7px;
        background: #ffffff;
        color: #16181c;
      }

      button {
        cursor: pointer;
        padding: 0 10px;
      }

      button:hover:not(:disabled),
      select:hover {
        background: #f1f3f5;
      }

      .primary {
        border-color: #16181c;
        background: #16181c;
        color: #ffffff;
      }

      .primary:hover:not(:disabled) {
        background: #2f3336;
      }

      button:disabled {
        cursor: not-allowed;
        opacity: 0.52;
      }

      .icon {
        width: 34px;
        padding: 0;
        font-size: 20px;
        line-height: 1;
      }

      .danger {
        border-color: #f4c7c7;
        color: #b42318;
      }

      .danger:hover:not(:disabled) {
        background: #fff1f1;
      }

      .content {
        display: grid;
        gap: 10px;
        min-height: 0;
        padding: 0 14px 14px;
      }

      .stats {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 8px;
      }

      .stat {
        border: 1px solid #e3e7eb;
        border-radius: 8px;
        background: #ffffff;
        padding: 9px;
      }

      .stat strong,
      .stat span {
        display: block;
      }

      .stat strong {
        font-size: 18px;
        line-height: 1;
      }

      .stat span {
        margin-top: 4px;
        color: #536471;
        font-size: 12px;
      }

      .filters {
        display: grid;
        gap: 8px;
      }

      .scan-controls {
        display: grid;
        gap: 8px;
        border: 1px solid #e3e7eb;
        border-radius: 8px;
        background: #ffffff;
        padding: 10px;
      }

      .field {
        display: grid;
        gap: 5px;
        color: #536471;
        font-size: 12px;
      }

      .control-actions {
        display: grid;
        grid-template-columns: 1fr auto;
        gap: 8px;
      }

      input,
      select {
        width: 100%;
        outline: none;
      }

      input {
        min-height: 36px;
        border: 1px solid #cfd6dd;
        border-radius: 7px;
        background: #ffffff;
        color: #16181c;
        padding: 0 10px;
      }

      input:focus,
      select:focus {
        border-color: #1d9bf0;
        box-shadow: 0 0 0 2px rgba(29, 155, 240, 0.18);
      }

      select {
        padding: 0 8px;
      }

      .result-bar strong {
        font-size: 14px;
      }

      .list {
        display: grid;
        align-content: start;
        gap: 8px;
        min-height: 150px;
        max-height: min(430px, calc(100vh - 390px));
        overflow: auto;
        padding-right: 2px;
      }

      .row {
        display: grid;
        grid-template-columns: 42px minmax(0, 1fr) auto;
        align-items: center;
        gap: 10px;
        border: 1px solid #e3e7eb;
        border-radius: 8px;
        background: #ffffff;
        padding: 10px;
      }

      .avatar {
        display: grid;
        width: 42px;
        height: 42px;
        place-items: center;
        overflow: hidden;
        border: 0;
        border-radius: 50%;
        background: #e8edf2;
        color: #536471;
        font-weight: 700;
        padding: 0;
      }

      .avatar img {
        display: block;
        width: 100%;
        height: 100%;
        object-fit: cover;
      }

      .meta {
        min-width: 0;
      }

      .profile-name,
      .handle,
      .badge {
        max-width: 100%;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .profile-name {
        display: block;
        border: 0;
        background: transparent;
        min-height: 0;
        padding: 0;
        color: #16181c;
        font-weight: 700;
        text-align: left;
      }

      .handle {
        margin-top: 2px;
        color: #536471;
        font-size: 12px;
      }

      .badges {
        display: flex;
        flex-wrap: wrap;
        gap: 4px;
        margin-top: 5px;
      }

      .badge {
        border-radius: 999px;
        background: #eef1f4;
        color: #536471;
        font-size: 11px;
        line-height: 1;
        padding: 4px 7px;
      }

      .badge.warning {
        background: #fff4de;
        color: #8a5a00;
      }

      .empty,
      .hint {
        color: #536471;
        font-size: 12px;
        line-height: 1.45;
      }

      .empty {
        border: 1px dashed #cfd6dd;
        border-radius: 8px;
        padding: 24px 12px;
        text-align: center;
      }

      @media (max-width: 520px) {
        .panel {
          top: 56px;
          right: 8px;
          left: 8px;
          width: auto;
          max-height: calc(100vh - 70px);
        }

      }
    </style>
    <aside class="panel" aria-label="X未回关检测结果">
      <header class="header" data-floating-drag title="拖动移动，双击还原位置">
        <div>
          <h2>X未回关检测</h2>
          <p class="status" data-floating-status></p>
        </div>
        <button class="icon" type="button" data-floating-close aria-label="关闭">×</button>
      </header>
      <section class="content">
        <div class="stats">
          <div class="stat"><strong data-floating-following>0</strong><span>关注</span></div>
          <div class="stat"><strong data-floating-scanned>0</strong><span>已扫描</span></div>
          <div class="stat"><strong data-floating-total>0</strong><span>未回关</span></div>
        </div>
        <div class="scan-controls">
          <label class="field">
            <span>@用户名</span>
            <input data-floating-account type="text" inputmode="text" autocomplete="off" placeholder="自动识别，可留空">
          </label>
          <div class="control-actions">
            <button class="primary" type="button" data-floating-start>开始检测</button>
            <button type="button" data-floating-reset>重置</button>
          </div>
        </div>
        <div class="filters">
          <input data-floating-query type="search" placeholder="搜索用户名或 @handle">
          <select data-floating-sort aria-label="排序">
            <option value="following">列表中用户顺序</option>
            <option value="handle">A-Z 用户名排序</option>
          </select>
        </div>
        <div class="result-bar">
          <strong data-floating-count>未回关用户</strong>
          <button class="danger" type="button" data-floating-batch>一键取关</button>
        </div>
        <div class="list" data-floating-list></div>
      </section>
    </aside>
  `;

  document.documentElement.append(host);
  floatingPanel = { host, shadow };
  bindFloatingEvents();
  return floatingPanel;
}

function bindFloatingEvents() {
  const panel = floatingPanel.shadow.querySelector(".panel");
  const dragHandle = floatingPanel.shadow.querySelector("[data-floating-drag]");
  const close = floatingPanel.shadow.querySelector("[data-floating-close]");
  const account = floatingPanel.shadow.querySelector("[data-floating-account]");
  const start = floatingPanel.shadow.querySelector("[data-floating-start]");
  const reset = floatingPanel.shadow.querySelector("[data-floating-reset]");
  const query = floatingPanel.shadow.querySelector("[data-floating-query]");
  const sort = floatingPanel.shadow.querySelector("[data-floating-sort]");
  const list = floatingPanel.shadow.querySelector("[data-floating-list]");
  const batch = floatingPanel.shadow.querySelector("[data-floating-batch]");

  bindFloatingDrag(panel, dragHandle);
  restoreFloatingPanelPosition(panel);

  close.addEventListener("click", () => {
    floatingPanel.host.remove();
    floatingPanel = null;
  });

  start.addEventListener("click", async () => {
    await sendRuntimeMessage({ type: "CLEAR_RESULTS" });
    await sendRuntimeMessage({
      type: "START_SCAN",
      account: account.value.trim()
    });
  });

  reset.addEventListener("click", async () => {
    await sendRuntimeMessage({ type: "RESET_STATE" });
  });

  query.addEventListener("input", () => {
    floatingFilters.query = query.value.trim();
    renderFloatingResults(floatingState);
  });

  sort.addEventListener("change", () => {
    floatingFilters.sort = sort.value;
    renderFloatingResults(floatingState);
  });

  list.addEventListener("scroll", () => {
    floatingListScrollTop = list.scrollTop;
  });

  list.addEventListener("click", async (event) => {
    const trigger = event.target.closest("[data-open-floating-profile]");
    if (!trigger) return;
    floatingListScrollTop = list.scrollTop;
    await sendRuntimeMessage({
      type: "OPEN_PROFILE",
      handle: trigger.dataset.handle
    });
  });

  batch.addEventListener("click", async () => {
    const busy = ["detecting", "scanning", "unfollowing"].includes(floatingState?.status);
    if (busy) {
      await sendRuntimeMessage({ type: "CANCEL_JOB" });
      return;
    }

    const count = floatingState?.nonFollowers?.length || 0;
    if (!count) return;
    const ok = confirm(
      `确认一键取关 ${count} 个未回关用户？\n\n` +
      "此操作会在 X 关注列表中逐个点击取消关注。\n" +
      "操作不可恢复，恢复只能之后手动重新关注。"
    );
    if (ok) await sendRuntimeMessage({ type: "BATCH_UNFOLLOW" });
  });
}

function bindFloatingDrag(panel, handle) {
  let drag = null;

  handle.addEventListener("pointerdown", (event) => {
    if (event.button !== 0 || event.target.closest("button, input, select")) return;

    const rect = panel.getBoundingClientRect();
    drag = {
      pointerId: event.pointerId,
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top
    };
    panel.classList.add("dragging");
    handle.setPointerCapture?.(event.pointerId);
    event.preventDefault();
  });

  handle.addEventListener("pointermove", (event) => {
    if (!drag || event.pointerId !== drag.pointerId) return;
    moveFloatingPanel(panel, event.clientX - drag.offsetX, event.clientY - drag.offsetY);
  });

  const finishDrag = (event) => {
    if (!drag || event.pointerId !== drag.pointerId) return;
    drag = null;
    panel.classList.remove("dragging");
    saveFloatingPanelPosition();
  };

  handle.addEventListener("pointerup", finishDrag);
  handle.addEventListener("pointercancel", finishDrag);

  handle.addEventListener("dblclick", (event) => {
    if (event.target.closest("button, input, select")) return;
    resetFloatingPanelPosition(panel);
  });
}

function moveFloatingPanel(panel, left, top) {
  const rect = panel.getBoundingClientRect();
  const margin = 8;
  const maxLeft = Math.max(margin, window.innerWidth - rect.width - margin);
  const maxTop = Math.max(margin, window.innerHeight - rect.height - margin);
  const nextLeft = clamp(left, margin, maxLeft);
  const nextTop = clamp(top, margin, maxTop);

  panel.style.left = `${nextLeft}px`;
  panel.style.top = `${nextTop}px`;
  panel.style.right = "auto";
  panel.style.bottom = "auto";
  floatingPanelPosition = { left: nextLeft, top: nextTop };
}

async function restoreFloatingPanelPosition(panel) {
  try {
    const stored = await chrome.storage.local.get(FLOATING_PANEL_POSITION_KEY);
    const position = stored?.[FLOATING_PANEL_POSITION_KEY];
    if (!isValidFloatingPanelPosition(position)) return;
    floatingPanelPosition = position;
    moveFloatingPanel(panel, position.left, position.top);
  } catch {
    // Position persistence is optional; the panel still works without it.
  }
}

function saveFloatingPanelPosition() {
  if (!floatingPanelPosition) return;
  chrome.storage.local.set({
    [FLOATING_PANEL_POSITION_KEY]: floatingPanelPosition
  }).catch(() => {});
}

function resetFloatingPanelPosition(panel) {
  floatingPanelPosition = null;
  panel.style.left = "";
  panel.style.top = "";
  panel.style.right = "";
  panel.style.bottom = "";
  chrome.storage.local.remove(FLOATING_PANEL_POSITION_KEY).catch(() => {});
}

function isValidFloatingPanelPosition(position) {
  return Number.isFinite(position?.left) && Number.isFinite(position?.top);
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function renderFloatingResults(state) {
  if (!floatingPanel || !state) return;
  floatingState = state;

  const shadow = floatingPanel.shadow;
  const busy = ["detecting", "scanning", "unfollowing"].includes(state.status);
  const totalUsers = state.nonFollowers || [];
  const visibleUsers = getVisibleFloatingUsers(totalUsers);

  shadow.querySelector("[data-floating-status]").textContent = state.message || "";
  const account = shadow.querySelector("[data-floating-account]");
  if (state.account && shadow.activeElement !== account) {
    account.value = state.account;
  }
  shadow.querySelector("[data-floating-start]").disabled = busy;
  shadow.querySelector("[data-floating-reset]").disabled = busy && state.status !== "error";
  shadow.querySelector("[data-floating-following]").textContent = formatNumber(state.followingCount);
  shadow.querySelector("[data-floating-scanned]").textContent = formatNumber(state.scannedCount);
  shadow.querySelector("[data-floating-total]").textContent = formatNumber(totalUsers.length);
  shadow.querySelector("[data-floating-count]").textContent =
    `未回关用户 ${formatNumber(visibleUsers.length)}/${formatNumber(totalUsers.length)}`;
  const action = shadow.querySelector("[data-floating-batch]");
  action.textContent = busy ? "取消" : "一键取关";
  action.disabled = !busy && !totalUsers.length;

  renderFloatingList(visibleUsers, busy);
}

function renderFloatingList(users, busy) {
  const list = floatingPanel.shadow.querySelector("[data-floating-list]");
  const previousTop = floatingListScrollTop || list.scrollTop;
  list.replaceChildren();

  if (!users.length) {
    const empty = document.createElement("p");
    empty.className = "empty";
    empty.textContent = "暂无符合条件的未回关用户";
    list.append(empty);
    return;
  }

  const fragment = document.createDocumentFragment();
  for (const user of users) {
    fragment.append(createFloatingUserRow(user, busy));
  }
  list.append(fragment);
  requestAnimationFrame(() => {
    list.scrollTop = Math.min(previousTop, list.scrollHeight);
  });
}

function createFloatingUserRow(user, busy) {
  const row = document.createElement("article");
  row.className = "row";

  const avatar = document.createElement("button");
  avatar.className = "avatar";
  avatar.type = "button";
  avatar.dataset.openFloatingProfile = "true";
  avatar.dataset.handle = user.handle;
  avatar.disabled = busy;
  avatar.title = `打开 @${user.handle} 主页`;

  if (user.avatar) {
    const image = document.createElement("img");
    image.src = user.avatar;
    image.alt = "";
    image.referrerPolicy = "no-referrer";
    image.addEventListener("error", () => {
      image.remove();
      avatar.textContent = user.handle.slice(0, 1).toUpperCase();
    }, { once: true });
    avatar.append(image);
  } else {
    avatar.textContent = user.handle.slice(0, 1).toUpperCase();
  }

  const meta = document.createElement("div");
  meta.className = "meta";

  const name = document.createElement("button");
  name.className = "profile-name";
  name.type = "button";
  name.dataset.openFloatingProfile = "true";
  name.dataset.handle = user.handle;
  name.disabled = busy;
  name.textContent = user.name || user.handle;

  const handle = document.createElement("div");
  handle.className = "handle";
  handle.textContent = `@${user.handle}`;

  const badges = document.createElement("div");
  badges.className = "badges";
  const statusBadge = document.createElement("span");
  statusBadge.className = "badge warning";
  statusBadge.textContent = "列表显示未回关";
  badges.append(statusBadge);

  meta.append(name, handle, badges);

  const actions = document.createElement("div");
  actions.className = "row-actions";
  const open = document.createElement("button");
  open.type = "button";
  open.dataset.openFloatingProfile = "true";
  open.dataset.handle = user.handle;
  open.disabled = busy;
  open.textContent = "主页";
  actions.append(open);

  row.append(avatar, meta, actions);
  return row;
}

function getVisibleFloatingUsers(users) {
  const query = floatingFilters.query.toLowerCase();
  const filtered = users.filter((user) => {
    if (query) {
      const haystack = `${user.name || ""} ${user.handle || ""}`.toLowerCase();
      if (!haystack.includes(query)) return false;
    }

    return true;
  });

  if (floatingFilters.sort === "handle") {
    return filtered.slice().sort((a, b) => a.handle.localeCompare(b.handle));
  }

  return filtered.slice().sort((a, b) => (a.order || 0) - (b.order || 0));
}

function getCurrentState() {
  return sendRuntimeMessage({ type: "GET_STATE" }).then((response) => response?.state || null);
}

function sendRuntimeMessage(message) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(message, (response) => {
      if (chrome.runtime.lastError) {
        resolve(null);
        return;
      }
      resolve(response || null);
    });
  });
}

function createEmptyFloatingState() {
  return {
    status: "idle",
    message: "打开 X 后点击开始检测",
    account: "",
    followingCount: 0,
    scannedCount: 0,
    nonFollowers: [],
    unfollowedCount: 0
  };
}

async function scanFollowingPage(account) {
  ensureFollowingRoute(account);
  await waitForFollowingListReady(30_000);

  const users = new Map();
  const originalScrollY = window.scrollY;
  let previousSize = -1;
  let previousScrollHeight = 0;
  let stableRounds = 0;
  const maxStableRounds = 8;
  const startedAt = Date.now();
  const maxDurationMs = 25 * 60 * 1000;

  try {
    lastScanReportAt = 0;
    lastScanReportCount = 0;

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

      window.scrollBy({ top: Math.max(window.innerHeight * 0.98, 760), behavior: "auto" });
      await sleep(150);
    }

    if (scanCancelled) {
      const error = new Error("任务已取消");
      error.name = "AbortError";
      throw error;
    }

    collectVisibleFollowingUsers(users);
    reportScanProgress(users.size, true);
    return [...users.values()];
  } finally {
    window.scrollTo({ top: originalScrollY, behavior: "auto" });
  }
}

function ensureFollowingRoute(account) {
  const expected = normalizeHandle(account).toLowerCase();
  const parts = location.pathname.split("/").filter(Boolean);
  const actual = normalizeHandle(parts[0]).toLowerCase();
  const section = parts[1]?.toLowerCase();
  if (!expected || actual !== expected || section !== "following") {
    throw new Error("当前页面不是目标账号的 following 列表，请重新开始检测。");
  }
}

async function batchUnfollowOnFollowingPage(handles) {
  await waitForFollowingListReady(30_000);

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

  const cells = getVisibleUserCellsInPageOrder(primary);
  for (const cell of cells) {
    const user = parseFollowingUserCell(cell);
    if (!user?.handle || !user.isFollowing) continue;
    const key = user.handle.toLowerCase();
    const existing = users.get(key);
    users.set(key, {
      ...existing,
      ...user,
      order: existing?.order || users.size + 1
    });
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

function getVisibleUserCellsInPageOrder(primary) {
  return [...primary.querySelectorAll('[data-testid="UserCell"]')]
    .filter((cell) => {
      const rect = cell.getBoundingClientRect();
      return rect.height > 0 && rect.bottom >= 0 && rect.top <= window.innerHeight;
    })
    .sort((left, right) => {
      const leftRect = left.getBoundingClientRect();
      const rightRect = right.getBoundingClientRect();
      return leftRect.top - rightRect.top || leftRect.left - rightRect.left;
    });
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

  return null;
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

async function waitForFollowingListReady(timeoutMs) {
  const startedAt = Date.now();
  const firstCell = await waitForElement(
    () => document.querySelector('[data-testid="UserCell"]'),
    Math.min(timeoutMs, 12_000)
  );
  if (firstCell) return firstCell;

  const remaining = Math.max(1000, timeoutMs - (Date.now() - startedAt));
  return waitForElement(() => getPrimaryColumn(), remaining);
}

function reportScanProgress(count, force = false) {
  const now = Date.now();
  if (!force && count === lastScanReportCount) return;
  if (!force && now - lastScanReportAt < 500 && count - lastScanReportCount < 20) return;
  lastScanReportAt = now;
  lastScanReportCount = count;
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

function formatNumber(value) {
  return new Intl.NumberFormat("zh-CN").format(value || 0);
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
