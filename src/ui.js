const els = {
  status: document.querySelector("[data-status]"),
  accountInput: document.querySelector("[data-account-input]"),
  start: document.querySelector("[data-start]"),
  cancel: document.querySelector("[data-cancel]"),
  openPanel: document.querySelector("[data-open-panel]"),
  batchUnfollow: document.querySelector("[data-batch-unfollow]"),
  followingCount: document.querySelector("[data-following-count]"),
  scannedCount: document.querySelector("[data-scanned-count]"),
  resultCount: document.querySelector("[data-result-count]"),
  list: document.querySelector("[data-list]")
};

let currentState = null;

init();

async function init() {
  bindEvents();
  chrome.runtime.onMessage.addListener((message) => {
    if (message?.type === "STATE_CHANGED") render(message.state);
  });

  const response = await send({ type: "GET_STATE" });
  if (response?.state) render(response.state);
}

function bindEvents() {
  els.start?.addEventListener("click", async () => {
    await send({
      type: "START_SCAN",
      account: els.accountInput.value.trim()
    });
  });

  els.cancel?.addEventListener("click", async () => {
    await send({ type: "CANCEL_JOB" });
  });

  els.openPanel?.addEventListener("click", async () => {
    await send({ type: "OPEN_PANEL" });
    window.close();
  });

  els.batchUnfollow?.addEventListener("click", async () => {
    const count = currentState?.nonFollowers?.length || 0;
    if (!count) return;

    const ok = confirm(
      `确认一键取关 ${count} 个未回关用户？\n\n` +
      "此操作会在 X 关注列表中逐个点击取消关注。\n" +
      "操作不可恢复，恢复只能之后手动重新关注。"
    );
    if (ok) await send({ type: "BATCH_UNFOLLOW" });
  });

  els.list?.addEventListener("click", async (event) => {
    const profileButton = event.target.closest("[data-open-profile]");
    if (profileButton) {
      const handle = profileButton.dataset.handle;
      const user = currentState.nonFollowers.find((item) => item.handle === handle);
      if (user) await send({ type: "OPEN_PROFILE", handle: user.handle });
    }
  });
}

function render(state) {
  currentState = state;
  const busy = ["detecting", "scanning", "unfollowing"].includes(state.status);

  els.status.textContent = state.message || "";
  if (state.account && document.activeElement !== els.accountInput) {
    els.accountInput.value = state.account;
  }
  els.followingCount.textContent = formatNumber(state.followingCount);
  els.scannedCount.textContent = formatNumber(state.scannedCount);
  els.resultCount.textContent = formatNumber(state.nonFollowers?.length || 0);

  els.start.disabled = busy;
  els.cancel.disabled = !busy;
  els.batchUnfollow.disabled = busy || !(state.nonFollowers?.length);

  renderList(state.nonFollowers || [], busy);
}

function renderList(users, busy) {
  if (!users.length) {
    els.list.innerHTML = '<p class="empty">暂无未回关用户</p>';
    return;
  }

  const fragment = document.createDocumentFragment();
  for (const user of users) {
    const row = document.createElement("article");
    row.className = "user-row";

    const profileUrl = `https://x.com/${user.handle}`;
    const avatar = document.createElement("a");
    avatar.className = "avatar";
    avatar.href = profileUrl;
    avatar.target = "_blank";
    avatar.rel = "noreferrer";
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
    meta.className = "user-meta";
    const name = document.createElement("strong");
    name.textContent = user.name || user.handle;
    const handle = document.createElement("a");
    handle.href = profileUrl;
    handle.target = "_blank";
    handle.rel = "noreferrer";
    handle.textContent = `@${user.handle}`;
    const badge = document.createElement("span");
    badge.className = "badge verified";
    badge.textContent = "列表显示未回关";
    meta.append(name, handle, badge);

    const rowActions = document.createElement("div");
    rowActions.className = "row-actions";

    const button = document.createElement("button");
    button.className = "small";
    button.type = "button";
    button.dataset.openProfile = "true";
    button.dataset.handle = user.handle;
    button.disabled = busy;
    button.textContent = "主页";

    rowActions.append(button);
    row.append(avatar, meta, rowActions);
    fragment.append(row);
  }

  els.list.replaceChildren(fragment);
}

function send(message) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(message, (response) => {
      if (chrome.runtime.lastError) {
        render({
          ...(currentState || {}),
          status: "error",
          message: chrome.runtime.lastError.message,
          nonFollowers: currentState?.nonFollowers || []
        });
        resolve(null);
        return;
      }
      if (response?.error) {
        render({
          ...(currentState || {}),
          status: "error",
          message: response.error,
          nonFollowers: currentState?.nonFollowers || []
        });
      }
      resolve(response);
    });
  });
}

function formatNumber(value) {
  return new Intl.NumberFormat("zh-CN").format(value || 0);
}
