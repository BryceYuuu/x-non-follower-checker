(() => {
if (globalThis.XNFPanelView) return;

const BUSY_STATUSES = new Set(["detecting", "scanning", "unfollowing"]);
const POSITION_KEY = "xUnfollowDetectorFloatingPanelPosition";
const COLLAPSED_KEY = "xUnfollowDetectorPanelCollapsed";
const SORT_KEY = "xUnfollowDetectorSort";
const SORT_VALUES = new Set(["recent", "oldest", "handle"]);

const ICONS = {
  open: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></svg>',
  minus: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14"/></svg>',
  close: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  search: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.2-4.2"/></svg>'
};

const STYLES = `
  .xnf {
    --bg: #ffffff;
    --bg-soft: #f7f9f9;
    --bg-hover: rgba(15, 20, 25, 0.05);
    --line: #eff3f4;
    --line-strong: #cfd9de;
    --text: #0f1419;
    --muted: #536471;
    --faint: #8b98a5;
    --primary: #0f1419;
    --primary-hover: #272c30;
    --on-primary: #ffffff;
    --blue: #1d9bf0;
    --danger: #f4212e;
    --danger-soft: rgba(244, 33, 46, 0.1);
    --danger-line: rgba(244, 33, 46, 0.35);
    --shadow: 0 0 0 1px rgba(15, 20, 25, 0.06), 0 12px 36px rgba(15, 20, 25, 0.16);
    all: initial;
    color: var(--text);
    font-family: TwitterChirp, -apple-system, BlinkMacSystemFont, "PingFang SC", "Segoe UI", Roboto, "Helvetica Neue", sans-serif;
    font-size: 14px;
    line-height: 1.4;
    -webkit-font-smoothing: antialiased;
  }

  .xnf[data-theme="dark"] {
    --bg: #16181c;
    --bg-soft: #202327;
    --bg-hover: rgba(231, 233, 234, 0.07);
    --line: #2f3336;
    --line-strong: #3e4144;
    --text: #e7e9ea;
    --muted: #8b98a5;
    --faint: #71767b;
    --primary: #eff3f4;
    --primary-hover: #d7dbdc;
    --on-primary: #0f1419;
    --danger-soft: rgba(244, 33, 46, 0.16);
    --shadow: 0 0 0 1px rgba(255, 255, 255, 0.08), 0 12px 36px rgba(0, 0, 0, 0.55);
  }

  .xnf[data-mode="popup"] { display: block; }
  :where(.xnf) *, :where(.xnf) *::before, :where(.xnf) *::after { box-sizing: border-box; }
  .xnf [hidden] { display: none !important; }
  :where(.xnf) :where(button, input, select) { font: inherit; color: inherit; }
  :where(.xnf) button { cursor: pointer; }
  :where(.xnf) button:disabled { cursor: default; }
  :where(.xnf) svg { width: 18px; height: 18px; fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }

  .panel {
    position: fixed;
    top: 72px;
    right: 20px;
    z-index: 2147483646;
    display: flex;
    flex-direction: column;
    width: min(372px, calc(100vw - 24px));
    max-height: calc(100vh - 96px);
    overflow: hidden;
    border-radius: 16px;
    background: var(--bg);
    box-shadow: var(--shadow);
  }

  .xnf[data-mode="popup"] .panel {
    position: relative;
    top: auto;
    right: auto;
    width: 380px;
    height: 580px;
    max-height: none;
    border-radius: 0;
    box-shadow: none;
  }

  .head {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 14px 12px 12px 16px;
  }

  .xnf[data-mode="floating"] .head { cursor: grab; user-select: none; }
  .panel.dragging .head { cursor: grabbing; }

  .me {
    display: grid;
    flex: none;
    width: 34px;
    height: 34px;
    place-items: center;
    border-radius: 50%;
    background: var(--primary);
    color: var(--on-primary);
    font-size: 15px;
    font-weight: 700;
  }

  .head-text { flex: 1; min-width: 0; }

  .title-line { display: flex; align-items: baseline; gap: 6px; min-width: 0; }

  .title {
    overflow: hidden;
    font-size: 15px;
    font-weight: 700;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .sub {
    overflow: hidden;
    margin-top: 1px;
    color: var(--muted);
    font-size: 12.5px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .link {
    flex: none;
    border: 0;
    background: none;
    color: var(--blue);
    font-size: 12.5px;
    padding: 0;
  }

  .link:hover { text-decoration: underline; }
  .link:disabled { opacity: 0.4; text-decoration: none; }

  .head-actions { display: flex; gap: 2px; }

  .icon-btn {
    display: grid;
    width: 32px;
    height: 32px;
    place-items: center;
    border: 0;
    border-radius: 50%;
    background: transparent;
    color: var(--muted);
    padding: 0;
  }

  .icon-btn:hover { background: var(--bg-hover); color: var(--text); }

  .section { padding: 0 16px; }

  .account {
    display: flex;
    gap: 8px;
    padding-bottom: 12px;
  }

  .field {
    flex: 1;
    min-width: 0;
    height: 36px;
    border: 1px solid var(--line-strong);
    border-radius: 10px;
    outline: none;
    background: var(--bg);
    padding: 0 12px;
  }

  .field:focus { border-color: var(--blue); box-shadow: 0 0 0 3px rgba(29, 155, 240, 0.18); }
  .field::placeholder { color: var(--faint); }

  .progress { padding-bottom: 14px; }

  .bar {
    position: relative;
    height: 4px;
    overflow: hidden;
    border-radius: 999px;
    background: var(--line);
  }

  .bar-fill {
    width: 0;
    height: 100%;
    border-radius: inherit;
    background: var(--blue);
    transition: width 0.4s ease;
  }

  .bar.indeterminate .bar-fill {
    width: 36%;
    animation: xnf-slide 1.2s ease-in-out infinite;
  }

  @keyframes xnf-slide {
    from { transform: translateX(-100%); }
    to { transform: translateX(280%); }
  }

  .progress-meta {
    display: flex;
    justify-content: space-between;
    gap: 8px;
    margin-top: 7px;
    color: var(--muted);
    font-size: 12px;
    font-variant-numeric: tabular-nums;
  }

  .control {
    display: flex;
    align-items: center;
    gap: 12px;
    padding-bottom: 14px;
  }

  .stats { display: flex; flex: 1; gap: 18px; min-width: 0; }
  .stat-value { font-size: 20px; font-weight: 700; line-height: 1.1; font-variant-numeric: tabular-nums; }
  .stat-value.alert { color: var(--danger); }
  .stat-label { margin-top: 2px; color: var(--muted); font-size: 12px; }

  .intro { flex: 1; color: var(--muted); font-size: 13px; }

  .btn {
    flex: none;
    height: 36px;
    border: 1px solid var(--line-strong);
    border-radius: 999px;
    background: transparent;
    font-size: 14px;
    font-weight: 700;
    padding: 0 16px;
    white-space: nowrap;
  }

  .btn:hover:not(:disabled) { background: var(--bg-hover); }

  .btn.primary {
    border-color: var(--primary);
    background: var(--primary);
    color: var(--on-primary);
  }

  .btn.primary:hover:not(:disabled) { border-color: var(--primary-hover); background: var(--primary-hover); }

  .btn.danger {
    border-color: var(--danger);
    background: var(--danger);
    color: #ffffff;
  }

  .btn.danger:hover:not(:disabled) { filter: brightness(0.94); }

  .btn.danger-ghost { border-color: var(--danger-line); color: var(--danger); }
  .btn.danger-ghost:hover:not(:disabled) { background: var(--danger-soft); }
  .btn.small { height: 32px; padding: 0 14px; font-size: 13px; }
  .btn:disabled { opacity: 0.5; }

  .notice {
    margin: 0 16px 12px;
    border-radius: 10px;
    background: var(--danger-soft);
    color: var(--danger);
    font-size: 12.5px;
    padding: 9px 12px;
  }

  .toolbar {
    display: flex;
    gap: 8px;
    border-top: 1px solid var(--line);
    padding: 10px 16px;
  }

  .search {
    display: flex;
    flex: 1;
    align-items: center;
    gap: 6px;
    min-width: 0;
    height: 34px;
    border: 1px solid transparent;
    border-radius: 999px;
    background: var(--bg-soft);
    color: var(--faint);
    padding: 0 12px;
  }

  .search:focus-within { border-color: var(--blue); background: var(--bg); color: var(--blue); }
  .search svg { width: 16px; height: 16px; flex: none; }

  .search input {
    flex: 1;
    min-width: 0;
    border: 0;
    outline: none;
    background: transparent;
    color: var(--text);
    font-size: 13px;
  }

  .search input::placeholder { color: var(--faint); }

  .sort {
    flex: none;
    height: 34px;
    border: 0;
    border-radius: 999px;
    outline: none;
    background: var(--bg-soft);
    color: var(--muted);
    font-size: 13px;
    padding: 0 10px;
  }

  .list {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    overscroll-behavior: contain;
    scrollbar-width: thin;
  }

  .xnf[data-mode="floating"] .list { max-height: 440px; }

  .row {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 9px 16px;
    transition: background 0.12s ease;
  }

  .row:hover { background: var(--bg-hover); }

  .avatar {
    display: grid;
    flex: none;
    width: 38px;
    height: 38px;
    place-items: center;
    overflow: hidden;
    border: 0;
    border-radius: 50%;
    background: var(--line);
    color: var(--muted);
    font-weight: 700;
    padding: 0;
  }

  .avatar img { width: 100%; height: 100%; object-fit: cover; }

  .who {
    display: block;
    flex: 1;
    min-width: 0;
    border: 0;
    background: none;
    padding: 0;
    text-align: left;
  }

  .name, .handle {
    display: block;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .name { font-size: 14px; font-weight: 700; }
  .who:hover .name { text-decoration: underline; }
  .handle { color: var(--muted); font-size: 13px; }

  .row-btn {
    flex: none;
    min-width: 64px;
    height: 30px;
    border: 1px solid var(--line-strong);
    border-radius: 999px;
    background: transparent;
    font-size: 13px;
    font-weight: 700;
    padding: 0 12px;
  }

  .row-btn:hover:not(:disabled) { border-color: var(--danger-line); background: var(--danger-soft); color: var(--danger); }
  .row-btn:disabled { opacity: 0.45; }
  .row.pending .row-btn { opacity: 1; border-color: var(--danger-line); color: var(--danger); }
  .row.pending { background: var(--danger-soft); }

  .empty {
    flex: 1;
    color: var(--muted);
    font-size: 13px;
    padding: 28px 24px 32px;
    text-align: center;
  }

  .empty strong { display: block; margin-bottom: 4px; color: var(--text); font-size: 15px; }

  .foot {
    display: flex;
    align-items: center;
    gap: 10px;
    border-top: 1px solid var(--line);
    padding: 10px 16px;
  }

  .foot-text { flex: 1; color: var(--muted); font-size: 12.5px; }

  .modal {
    position: absolute;
    inset: 0;
    z-index: 2;
    display: grid;
    place-items: center;
    background: rgba(91, 112, 131, 0.4);
    padding: 20px;
  }

  .xnf[data-theme="dark"] .modal { background: rgba(91, 112, 131, 0.3); }

  .dialog {
    width: 100%;
    max-width: 300px;
    border-radius: 16px;
    background: var(--bg);
    box-shadow: var(--shadow);
    padding: 22px 22px 18px;
  }

  .dialog-title { font-size: 18px; font-weight: 700; }
  .dialog-body { margin: 8px 0 18px; color: var(--muted); font-size: 13.5px; }
  .dialog-actions { display: grid; gap: 8px; }
  .dialog-actions .btn { width: 100%; height: 40px; }

  .pill {
    position: fixed;
    top: 72px;
    right: 20px;
    z-index: 2147483646;
    display: flex;
    align-items: center;
    gap: 8px;
    height: 40px;
    border: 0;
    border-radius: 999px;
    background: var(--bg);
    box-shadow: var(--shadow);
    font-size: 13.5px;
    font-weight: 700;
    padding: 0 16px 0 12px;
  }

  .pill-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--faint); }
  .pill.busy .pill-dot { background: var(--blue); animation: xnf-pulse 1.2s ease-in-out infinite; }
  .pill.alert .pill-dot { background: var(--danger); }

  @keyframes xnf-pulse {
    50% { opacity: 0.35; }
  }
`;

const buildTemplate = () => `
  <button class="pill" type="button" data-el="pill" data-act="expand" hidden>
    <span class="pill-dot"></span><span data-el="pillText"></span>
  </button>
  <section class="panel" data-el="panel" aria-label="${t("extName")}">
    <header class="head" data-el="head">
      <div class="me" data-el="me">X</div>
      <div class="head-text">
        <div class="title-line">
          <span class="title" data-el="title">${t("extName")}</span>
          <button class="link" type="button" data-act="toggle-account" data-el="switchLink">${t("switchAccount")}</button>
        </div>
        <div class="sub" data-el="sub"></div>
      </div>
      <div class="head-actions">
        <button class="icon-btn" type="button" data-act="open-page" data-el="openPageBtn" title="${t("showInPage")}" aria-label="${t("showInPage")}">${ICONS.open}</button>
        <button class="icon-btn" type="button" data-act="collapse" data-el="collapseBtn" title="${t("collapse")}" aria-label="${t("collapse")}">${ICONS.minus}</button>
        <button class="icon-btn" type="button" data-act="close" data-el="closeBtn" title="${t("close")}" aria-label="${t("close")}">${ICONS.close}</button>
      </div>
    </header>

    <div class="section account" data-el="accountRow" hidden>
      <input class="field" data-el="accountInput" type="text" autocomplete="off" spellcheck="false" placeholder="${t("accountPlaceholder")}">
      <button class="btn small" type="button" data-act="start">${t("check")}</button>
    </div>

    <div class="section progress" data-el="progress" hidden>
      <div class="bar" data-el="bar"><div class="bar-fill" data-el="barFill"></div></div>
      <div class="progress-meta"><span data-el="progressLeft"></span><span data-el="progressRight"></span></div>
    </div>

    <div class="section control">
      <div class="intro" data-el="intro">${t("intro")}</div>
      <div class="stats" data-el="stats" hidden>
        <div><div class="stat-value" data-el="followingValue">0</div><div class="stat-label">${t("statFollowing")}</div></div>
        <div><div class="stat-value alert" data-el="resultValue">0</div><div class="stat-label">${t("statNonFollowers")}</div></div>
      </div>
      <button class="btn primary" type="button" data-act="start" data-el="startBtn">${t("startScan")}</button>
      <button class="btn" type="button" data-act="cancel" data-el="cancelBtn" hidden>${t("stop")}</button>
    </div>

    <div class="notice" data-el="notice" role="alert" hidden></div>

    <div class="toolbar" data-el="toolbar" hidden>
      <label class="search">${ICONS.search}<input data-el="query" type="search" placeholder="${t("searchPlaceholder")}" aria-label="${t("search")}"></label>
      <select class="sort" data-el="sort" aria-label="${t("sort")}">
        <option value="recent">${t("sortRecent")}</option>
        <option value="oldest">${t("sortOldest")}</option>
        <option value="handle">${t("sortHandle")}</option>
      </select>
    </div>

    <div class="list" data-el="list" role="list"></div>
    <div class="empty" data-el="empty" hidden></div>

    <footer class="foot" data-el="foot" hidden>
      <span class="foot-text" data-el="footText"></span>
      <button class="link" type="button" data-act="clear" data-el="clearBtn">${t("clear")}</button>
      <button class="btn small danger-ghost" type="button" data-act="unfollow-bulk" data-el="bulkBtn">${t("unfollowAll")}</button>
    </footer>

    <div class="modal" data-el="modal" hidden>
      <div class="dialog" role="alertdialog" aria-modal="true" aria-labelledby="xnf-dialog-title">
        <div class="dialog-title" id="xnf-dialog-title" data-el="modalTitle"></div>
        <p class="dialog-body" data-el="modalBody"></p>
        <div class="dialog-actions">
          <button class="btn danger" type="button" data-act="modal-confirm">${t("confirmUnfollow")}</button>
          <button class="btn" type="button" data-act="modal-cancel">${t("cancel")}</button>
        </div>
      </div>
    </div>
  </section>
`;

function mount(root, options = {}) {
  const mode = options.mode === "popup" ? "popup" : "floating";
  const doc = root.ownerDocument || root;

  const style = doc.createElement("style");
  style.textContent = STYLES;
  const container = doc.createElement("div");
  container.className = "xnf";
  container.dataset.mode = mode;
  container.dataset.theme = "light";
  container.innerHTML = buildTemplate();
  container.lang = chrome.i18n.getUILanguage();
  root.append(style, container);

  const el = {};
  for (const node of container.querySelectorAll("[data-el]")) el[node.dataset.el] = node;

  el.openPageBtn.hidden = mode !== "popup";
  el.collapseBtn.hidden = mode !== "floating";
  el.closeBtn.hidden = mode !== "floating";

  const rows = new Map();
  const filters = { query: "", sort: "recent" };
  let state = null;
  let localError = "";
  let localErrorTimer = null;
  let collapsed = false;
  let pendingConfirm = null;

  bindEvents();
  restoreSort();
  if (mode === "floating") {
    bindDrag();
    restorePosition();
    restoreCollapsed();
  }

  function bindEvents() {
    container.addEventListener("click", async (event) => {
      const trigger = event.target.closest("[data-act]");
      if (!trigger || trigger.disabled) return;
      const action = trigger.dataset.act;
      const handle = trigger.closest("[data-handle]")?.dataset.handle;

      if (action === "start") {
        el.accountRow.hidden = true;
        await send({ type: "START_SCAN", account: el.accountInput.value.trim() });
      } else if (action === "cancel") {
        await send({ type: "CANCEL_JOB" });
      } else if (action === "toggle-account") {
        el.accountRow.hidden = !el.accountRow.hidden;
        if (!el.accountRow.hidden) el.accountInput.focus();
      } else if (action === "clear") {
        await send({ type: "RESET_STATE" });
      } else if (action === "open-page") {
        const response = await send({ type: "OPEN_PANEL" });
        if (response?.ok) options.onOpenPage?.();
      } else if (action === "collapse") {
        setCollapsed(true);
      } else if (action === "expand") {
        setCollapsed(false);
      } else if (action === "close") {
        options.onClose?.();
      } else if (action === "profile" && handle) {
        await send({ type: "OPEN_PROFILE", handle });
      } else if (action === "unfollow-one" && handle) {
        await send({ type: "UNFOLLOW_USERS", handles: [handle] });
      } else if (action === "unfollow-bulk") {
        openConfirm(getVisibleUsers().map((user) => user.handle));
      } else if (action === "modal-cancel") {
        closeConfirm();
      } else if (action === "modal-confirm") {
        const handles = pendingConfirm || [];
        closeConfirm();
        if (handles.length) await send({ type: "UNFOLLOW_USERS", handles });
      }
    });

    el.accountInput.addEventListener("keydown", async (event) => {
      if (event.key !== "Enter" || isBusy()) return;
      el.accountRow.hidden = true;
      await send({ type: "START_SCAN", account: el.accountInput.value.trim() });
    });

    el.query.addEventListener("input", () => {
      filters.query = el.query.value.trim().toLowerCase();
      renderList();
    });

    el.sort.addEventListener("change", () => {
      filters.sort = el.sort.value;
      storageSet({ [SORT_KEY]: filters.sort });
      renderList();
    });

    container.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && !el.modal.hidden) closeConfirm();
    });
  }

  function render(nextState) {
    if (!nextState) return;
    state = nextState;
    const busy = isBusy();
    const users = state.nonFollowers || [];
    const hasResults = users.length > 0;
    const scanned = state.scannedCount || 0;

    el.title.textContent = state.account ? `@${state.account}` : t("extName");
    el.me.textContent = (state.account || "X").slice(0, 1).toUpperCase();
    el.switchLink.hidden = busy;
    const fresh = state.status === "idle" && !scanned && !hasResults;
    const errorLabel = scanned > 0 ? t("statusStopped") : t("statusInterrupted");
    el.sub.textContent = state.status === "error" ? errorLabel : (fresh ? t("freshSubtitle") : (state.message || ""));

    const message = localError || (state.status === "error" ? state.message : "");
    el.notice.hidden = !message;
    el.notice.textContent = message;

    renderProgress(busy);

    const showStats = busy || hasResults || scanned > 0;
    el.intro.hidden = showStats;
    el.stats.hidden = !showStats;
    el.followingValue.textContent = formatNumber(scanned);
    el.resultValue.textContent = formatNumber(users.length);
    el.startBtn.hidden = busy;
    el.startBtn.textContent = scanned > 0 ? t("rescan") : t("startScan");
    el.cancelBtn.hidden = !busy;
    if (busy) el.accountRow.hidden = true;

    if (state.account && doc.activeElement !== el.accountInput && !el.accountInput.matches(":focus")) {
      el.accountInput.value = state.account;
    }

    el.toolbar.hidden = !hasResults;
    el.foot.hidden = !hasResults && !(scanned > 0 && !busy);
    el.clearBtn.disabled = busy;

    renderList();
    renderPill();
  }

  function renderProgress(busy) {
    el.progress.hidden = !busy;
    if (!busy) return;

    let ratio = null;
    let left = "";
    let right = "";

    if (state.status === "scanning" && state.scanStartedAt) {
      const scanned = state.scannedCount || 0;
      const total = state.totalFollowing || 0;
      if (total > 0) {
        ratio = Math.min(scanned / total, 0.99);
        left = `${formatNumber(scanned)} / ${formatNumber(total)}`;
        right = formatEta(state.scanStartedAt, scanned, total);
      } else {
        left = t("progressScanned", formatNumber(scanned));
      }
    } else if (state.status === "unfollowing") {
      const total = state.unfollowTotal || 0;
      const done = state.unfollowDone || 0;
      ratio = total ? done / total : 0;
      left = t("progressUnfollow", formatNumber(done), formatNumber(total));
      right = t("keepTabOpen");
    } else {
      left = t("preparing");
    }

    el.bar.classList.toggle("indeterminate", ratio === null);
    el.barFill.style.width = ratio === null ? "" : `${Math.round(ratio * 100)}%`;
    el.progressLeft.textContent = left;
    el.progressRight.textContent = right;
  }

  function renderList() {
    if (!state) return;
    const busy = isBusy();
    const allUsers = state.nonFollowers || [];
    const visible = getVisibleUsers();
    const pending = new Set((state.unfollowingHandles || []).map((handle) => handle.toLowerCase()));
    const keep = new Set();

    let previous = null;
    for (const user of visible) {
      const key = user.handle.toLowerCase();
      keep.add(key);
      let row = rows.get(key);
      if (!row) {
        row = createRow(user);
        rows.set(key, row);
      }
      updateRow(row, user, busy, pending.has(key));
      const expectedNext = previous ? previous.nextSibling : el.list.firstChild;
      if (row !== expectedNext) el.list.insertBefore(row, expectedNext);
      previous = row;
    }

    for (const [key, row] of rows) {
      if (keep.has(key)) continue;
      row.remove();
      if (!allUsers.some((user) => user.handle.toLowerCase() === key)) rows.delete(key);
    }

    renderEmpty(allUsers.length, visible.length, busy);

    if (allUsers.length) {
      const filtered = visible.length !== allUsers.length;
      el.footText.textContent = filtered
        ? t("footFiltered", formatNumber(visible.length), formatNumber(allUsers.length))
        : t("footTotal", formatNumber(allUsers.length));
      el.bulkBtn.hidden = false;
      el.bulkBtn.textContent = filtered ? t("unfollowFiltered", formatNumber(visible.length)) : t("unfollowAll");
      el.bulkBtn.disabled = busy || !visible.length;
    } else {
      el.footText.textContent = state.unfollowedCount ? t("footUnfollowedSession", formatNumber(state.unfollowedCount)) : "";
      el.bulkBtn.hidden = true;
    }
  }

  function renderEmpty(totalCount, visibleCount, busy) {
    let title = "";
    let body = "";
    if (visibleCount) {
      el.empty.hidden = true;
      return;
    }
    if (totalCount) {
      title = t("emptyNoMatchTitle");
      body = t("emptyNoMatchBody");
    } else if (busy && state.status !== "unfollowing") {
      title = t("emptyScanningTitle");
      body = t("emptyScanningBody");
    } else if ((state.scannedCount || 0) > 0 && state.status !== "error") {
      title = t("emptyAllFollowTitle");
      body = t("emptyAllFollowBody", formatNumber(state.scannedCount));
    } else {
      el.empty.hidden = true;
      return;
    }
    el.empty.hidden = false;
    el.empty.replaceChildren();
    const strong = doc.createElement("strong");
    strong.textContent = title;
    el.empty.append(strong, doc.createTextNode(body));
  }

  function createRow(user) {
    const row = doc.createElement("div");
    row.className = "row";
    row.setAttribute("role", "listitem");
    row.dataset.handle = user.handle;

    const avatar = doc.createElement("button");
    avatar.className = "avatar";
    avatar.type = "button";
    avatar.dataset.act = "profile";
    avatar.title = t("openProfile", user.handle);
    const fallback = user.handle.slice(0, 1).toUpperCase();
    if (user.avatar) {
      const image = doc.createElement("img");
      image.src = user.avatar;
      image.alt = "";
      image.loading = "lazy";
      image.referrerPolicy = "no-referrer";
      image.addEventListener("error", () => {
        image.remove();
        avatar.textContent = fallback;
      }, { once: true });
      avatar.append(image);
    } else {
      avatar.textContent = fallback;
    }

    const who = doc.createElement("button");
    who.className = "who";
    who.type = "button";
    who.dataset.act = "profile";
    const name = doc.createElement("span");
    name.className = "name";
    name.textContent = user.name || user.handle;
    const handle = doc.createElement("span");
    handle.className = "handle";
    handle.textContent = `@${user.handle}`;
    who.append(name, handle);

    const action = doc.createElement("button");
    action.className = "row-btn";
    action.type = "button";
    action.dataset.act = "unfollow-one";

    row.append(avatar, who, action);
    return row;
  }

  function updateRow(row, user, busy, pending) {
    row.classList.toggle("pending", pending);
    const action = row.lastChild;
    action.textContent = pending ? t("rowUnfollowing") : t("rowUnfollow");
    action.disabled = busy;
    action.title = busy ? "" : t("rowUnfollowTitle", user.handle);
  }

  function getVisibleUsers() {
    const users = state?.nonFollowers || [];
    const filtered = filters.query
      ? users.filter((user) => `${user.name || ""} @${user.handle}`.toLowerCase().includes(filters.query))
      : users.slice();
    if (filters.sort === "handle") {
      return filtered.sort((a, b) => a.handle.localeCompare(b.handle));
    }
    // X lists the accounts you follow newest first, so scan order is follow order.
    const direction = filters.sort === "oldest" ? -1 : 1;
    return filtered.sort((a, b) => direction * ((a.order || 0) - (b.order || 0)));
  }

  function openConfirm(handles) {
    if (!handles.length || isBusy()) return;
    pendingConfirm = handles;
    el.modalTitle.textContent = t("modalTitle", formatNumber(handles.length));
    el.modalBody.textContent = t("modalBody");
    el.modal.hidden = false;
    el.modal.querySelector('[data-act="modal-cancel"]').focus();
  }

  function closeConfirm() {
    pendingConfirm = null;
    el.modal.hidden = true;
  }

  function renderPill() {
    if (mode !== "floating" || !state) return;
    const busy = isBusy();
    const count = state.nonFollowers?.length || 0;
    let text = t("pillDefault");
    if (state.status === "scanning") {
      const total = state.totalFollowing || 0;
      text = total
        ? t("pillScanningPct", Math.round(Math.min((state.scannedCount || 0) / total, 0.99) * 100), formatNumber(count))
        : t("pillScanning", formatNumber(count));
    } else if (state.status === "unfollowing") {
      text = t("pillUnfollowing", formatNumber(state.unfollowDone || 0), formatNumber(state.unfollowTotal || 0));
    } else if (busy) {
      text = t("preparing");
    } else if (count) {
      text = t("pillResults", formatNumber(count));
    }
    el.pillText.textContent = text;
    el.pill.classList.toggle("busy", busy);
    el.pill.classList.toggle("alert", !busy && count > 0);
  }

  function setCollapsed(next, persist = true) {
    collapsed = next;
    el.panel.hidden = collapsed;
    el.pill.hidden = !collapsed;
    if (collapsed) closeConfirm();
    if (persist) storageSet({ [COLLAPSED_KEY]: collapsed });
  }

  async function restoreSort() {
    const stored = await storageGet(SORT_KEY);
    const sort = stored?.[SORT_KEY];
    if (!SORT_VALUES.has(sort) || sort === filters.sort) return;
    filters.sort = sort;
    el.sort.value = sort;
    renderList();
  }

  async function restoreCollapsed() {
    const stored = await storageGet(COLLAPSED_KEY);
    if (stored?.[COLLAPSED_KEY]) setCollapsed(true, false);
  }

  function bindDrag() {
    let drag = null;

    el.head.addEventListener("pointerdown", (event) => {
      if (event.button !== 0 || event.target.closest("button, input, select")) return;
      const rect = el.panel.getBoundingClientRect();
      drag = { id: event.pointerId, dx: event.clientX - rect.left, dy: event.clientY - rect.top };
      el.panel.classList.add("dragging");
      el.head.setPointerCapture?.(event.pointerId);
      event.preventDefault();
    });

    el.head.addEventListener("pointermove", (event) => {
      if (!drag || event.pointerId !== drag.id) return;
      moveTo(event.clientX - drag.dx, event.clientY - drag.dy);
    });

    const finish = (event) => {
      if (!drag || event.pointerId !== drag.id) return;
      drag = null;
      el.panel.classList.remove("dragging");
      const rect = el.panel.getBoundingClientRect();
      storageSet({ [POSITION_KEY]: { left: rect.left, top: rect.top } });
    };

    el.head.addEventListener("pointerup", finish);
    el.head.addEventListener("pointercancel", finish);
    el.head.addEventListener("dblclick", (event) => {
      if (event.target.closest("button, input, select")) return;
      for (const node of [el.panel, el.pill]) {
        node.style.left = "";
        node.style.top = "";
        node.style.right = "";
      }
      storageRemove(POSITION_KEY);
    });
  }

  function moveTo(left, top) {
    const view = doc.defaultView;
    const width = el.panel.offsetWidth || 372;
    const margin = 8;
    const nextLeft = clamp(left, margin, Math.max(margin, view.innerWidth - width - margin));
    const nextTop = clamp(top, margin, Math.max(margin, view.innerHeight - 120));
    el.panel.style.left = `${nextLeft}px`;
    el.panel.style.top = `${nextTop}px`;
    el.panel.style.right = "auto";
    el.pill.style.left = `${nextLeft + width}px`;
    el.pill.style.top = `${nextTop}px`;
    el.pill.style.right = "auto";
    el.pill.style.transform = "translateX(-100%)";
  }

  async function restorePosition() {
    const stored = await storageGet(POSITION_KEY);
    const position = stored?.[POSITION_KEY];
    if (Number.isFinite(position?.left) && Number.isFinite(position?.top)) {
      moveTo(position.left, position.top);
    }
  }

  async function send(message) {
    const response = await new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage(message, (reply) => {
          if (chrome.runtime.lastError) {
            resolve({ ok: false, error: t("errorReload") });
            return;
          }
          resolve(reply || null);
        });
      } catch {
        resolve({ ok: false, error: t("errorReload") });
      }
    });
    if (response && response.ok === false && response.error) showLocalError(response.error);
    return response;
  }

  function showLocalError(message) {
    localError = message;
    clearTimeout(localErrorTimer);
    localErrorTimer = setTimeout(() => {
      localError = "";
      if (state) render(state);
    }, 6000);
    if (state) render(state);
    else {
      el.notice.hidden = false;
      el.notice.textContent = message;
    }
  }

  function isBusy() {
    return BUSY_STATUSES.has(state?.status);
  }

  return {
    render,
    setTheme(theme) {
      container.dataset.theme = theme === "dark" ? "dark" : "light";
    },
    destroy() {
      clearTimeout(localErrorTimer);
      style.remove();
      container.remove();
    }
  };
}

function formatNumber(value) {
  return new Intl.NumberFormat(chrome.i18n.getUILanguage()).format(value || 0);
}

function formatEta(startedAt, done, total) {
  const elapsed = Date.now() - startedAt;
  if (done < 30 || elapsed < 4000 || total <= done) return "";
  const seconds = Math.round(((total - done) * elapsed) / done / 1000);
  if (seconds < 60) return t("etaSeconds", Math.max(seconds, 5));
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return rest >= 10 ? t("etaMinSec", minutes, rest) : t("etaMinutes", minutes);
}

function t(key, ...substitutions) {
  return chrome.i18n.getMessage(key, substitutions.map(String)) || key;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function storageGet(key) {
  try {
    return chrome.storage.local.get(key).catch(() => null);
  } catch {
    return Promise.resolve(null);
  }
}

function storageSet(value) {
  try {
    chrome.storage.local.set(value).catch(() => {});
  } catch {
    // Storage is optional for layout preferences.
  }
}

function storageRemove(key) {
  try {
    chrome.storage.local.remove(key).catch(() => {});
  } catch {
    // Storage is optional for layout preferences.
  }
}

globalThis.XNFPanelView = { mount };
})();
