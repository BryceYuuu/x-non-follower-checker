// A small imitation of X's following page: paged loading, a virtualised list that only keeps
// cells near the viewport in the DOM, a "follows you" badge, and the unfollow confirmation sheet.
(() => {
  const params = new URLSearchParams(location.search);
  const config = {
    total: Number(params.get("total") || 1500),
    pageSize: Number(params.get("page") || 20),
    latencyMin: Number(params.get("latMin") || 300),
    latencyMax: Number(params.get("latMax") || 700),
    nonEvery: Number(params.get("nonEvery") || 7),
    // failAfter=N: after N successful unfollows X starts rejecting them (button flips back plus a toast).
    failAfter: Number(params.get("failAfter") || Infinity),
    renderDelay: Number(params.get("renderDelay") || 0),
    dark: params.get("dark") === "1"
  };
  if (config.dark) document.body.classList.add("dark");

  const users = Array.from({ length: config.total }, (_, i) => ({
    index: i,
    handle: `user_${i}`,
    name: `ユーザー ${i}`,
    followsYou: i % config.nonEvery !== 3,
    following: true,
    height: 68 + ((i * 37) % 60)
  }));
  const offsets = [];
  let acc = 0;
  for (const user of users) {
    offsets.push(acc);
    acc += user.height;
  }

  const view = document.getElementById("view");
  let loaded = 0;
  let loading = false;
  let list = null;
  let spinner = null;
  const rendered = new Map();
  const stats = { pagesLoaded: 0 };
  let scheduled = false;

  function route() {
    rendered.clear();
    const path = location.pathname.replace(/\/$/, "");
    if (path === "/tester") {
      view.innerHTML = `<h2>Tester</h2><a href="/tester/following" id="following-link"><span>${config.total.toLocaleString("en-US")}</span> <span>フォロー中</span></a>`;
    } else if (path === "/tester/following") {
      loaded = 0;
      view.innerHTML = '<h2>フォロー中</h2><div class="list"></div><div class="spinner"></div>';
      list = view.querySelector(".list");
      spinner = view.querySelector(".spinner");
      loadNextPage();
    } else {
      view.innerHTML = "<h2>ホーム</h2>";
    }
  }

  function loadNextPage() {
    if (loading || loaded >= users.length) return;
    loading = true;
    spinner.innerHTML = '<div role="progressbar">読み込み中…</div>';
    const latency = config.latencyMin + Math.random() * (config.latencyMax - config.latencyMin);
    setTimeout(() => {
      loaded = Math.min(users.length, loaded + config.pageSize);
      stats.pagesLoaded += 1;
      loading = false;
      spinner.innerHTML = "";
      schedule();
    }, latency);
  }

  function schedule() {
    if (scheduled) return;
    scheduled = true;
    const run = () => {
      scheduled = false;
      update();
    };
    // renderDelay imitates a slow React commit on a heavy page.
    if (config.renderDelay) setTimeout(run, config.renderDelay);
    else requestAnimationFrame(run);
  }

  function update() {
    if (!list || !list.isConnected) return;
    const height = loaded ? offsets[loaded - 1] + users[loaded - 1].height : 0;
    list.style.height = `${height}px`;
    const listTop = list.getBoundingClientRect().top + window.scrollY;
    const from = window.scrollY - listTop - window.innerHeight * 0.5;
    const to = window.scrollY - listTop + window.innerHeight * 2;

    const keep = new Set();
    for (let i = 0; i < loaded; i += 1) {
      const top = offsets[i];
      if (top + users[i].height < from || top > to) continue;
      keep.add(i);
      if (!rendered.has(i)) {
        const cell = createCell(users[i]);
        rendered.set(i, cell);
        list.append(cell);
      }
    }
    for (const [i, cell] of rendered) {
      if (!keep.has(i)) {
        cell.remove();
        rendered.delete(i);
      }
    }

    if (window.scrollY + window.innerHeight > listTop + height - 1200) loadNextPage();
  }

  function createCell(user) {
    const cell = document.createElement("div");
    cell.dataset.testid = "UserCell";
    cell.style.top = `${offsets[user.index]}px`;
    cell.style.height = `${user.height}px`;
    fillCell(cell, user);
    return cell;
  }

  function fillCell(cell, user) {
    const id = `${1000 + user.index}`;
    cell.innerHTML = `
      <a href="/${user.handle}" aria-hidden="true"><div style="width:40px;height:40px;border-radius:50%;background:#ccc"></div></a>
      <div style="flex:1">
        <a href="/${user.handle}"><span>${user.name}</span></a><br>
        <a href="/${user.handle}"><span>@${user.handle}</span></a>
        ${user.followsYou ? '<span data-testid="userFollowIndicator">フォローされています</span>' : ""}
      </div>
      ${user.following
        ? `<button data-testid="${id}-unfollow" aria-label="フォロー中 @${user.handle}">フォロー中</button>`
        : `<button data-testid="${id}-follow">フォロー</button>`}
    `;
    const button = cell.querySelector("button");
    button.addEventListener("click", () => {
      if (!user.following) return;
      setTimeout(() => {
        const sheet = document.createElement("div");
        sheet.setAttribute("role", "alertdialog");
        sheet.dataset.testid = "confirmationSheetDialog";
        sheet.innerHTML = '<div style="background:#fff;padding:20px"><button data-testid="confirmationSheetConfirm">フォロー解除</button></div>';
        sheet.querySelector("button").addEventListener("click", () => {
          sheet.remove();
          // Optimistic update first, like X.
          user.following = false;
          refresh(user);
          setTimeout(() => {
            if ((stats.unfollowed || 0) >= config.failAfter) {
              user.following = true;
              stats.rejected = (stats.rejected || 0) + 1;
              refresh(user);
              showToast("You are unable to unfollow more accounts at this time.");
              return;
            }
            stats.unfollowed = (stats.unfollowed || 0) + 1;
          }, 300);
        });
        document.body.append(sheet);
      }, 150);
    });
  }

  function refresh(user) {
    const cell = rendered.get(user.index);
    if (cell) fillCell(cell, user);
  }

  function showToast(text) {
    const toast = document.createElement("div");
    toast.dataset.testid = "toast";
    toast.setAttribute("role", "alert");
    toast.textContent = text;
    toast.style.cssText = "position:fixed;bottom:20px;left:50%;background:#1d9bf0;color:#fff;padding:10px";
    document.body.append(toast);
    setTimeout(() => toast.remove(), 3000);
  }

  document.addEventListener("click", (event) => {
    const link = event.target.closest("a[href^='/']");
    if (!link || link.closest('[data-testid="UserCell"]')) return;
    event.preventDefault();
    history.pushState(null, "", link.getAttribute("href"));
    route();
  });

  window.addEventListener("scroll", schedule, { passive: true });
  window.addEventListener("resize", schedule);

  window.__mock = {
    config,
    users,
    stats,
    navigate(path) {
      history.pushState(null, "", path);
      route();
    },
    truthNonFollowers() {
      return users.filter((user) => !user.followsYou && user.following).map((user) => user.handle);
    }
  };

  route();
})();
