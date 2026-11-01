// Runs the extension inside the mock page with a fake `chrome` API.
// background.js, panel-view.js and content.js each get their own `chrome` object so messages
// are routed the way Chrome would route them (runtime -> background, tabs -> content).
(() => {
  const params = new URLSearchParams(location.search);
  const impl = params.get("impl") || "new";
  const log = [];

  const fakeTab = () => ({
    id: 1,
    index: 0,
    windowId: 1,
    active: true,
    status: "complete",
    url: `https://x.com${location.pathname}`
  });

  function memoryArea() {
    const data = {};
    return {
      async get(key) {
        if (typeof key === "string") return key in data ? { [key]: data[key] } : {};
        return { ...data };
      },
      async set(value) {
        Object.assign(data, JSON.parse(JSON.stringify(value)));
      },
      async remove(key) {
        delete data[key];
      }
    };
  }

  // chrome.i18n stand-in: ?lang=en|zh_CN|zh_TW picks the catalog, like the browser language would.
  const uiLocale = params.get("lang") || "zh_CN";
  let catalog = {};
  const i18n = {
    getUILanguage: () => uiLocale.replace("_", "-"),
    getMessage(key, substitutions = []) {
      const entry = catalog[key];
      if (!entry) return "";
      const named = entry.message.replace(/\$([A-Za-z0-9_]+)\$/g, (_, name) => {
        const placeholder = Object.entries(entry.placeholders || {}).find(([key2]) => key2.toLowerCase() === name.toLowerCase());
        return placeholder ? placeholder[1].content : "";
      });
      return named.replace(/\$(\d)/g, (_, index) => substitutions[Number(index) - 1] ?? "");
    }
  };

  const local = memoryArea();
  const session = memoryArea();
  let contentListener = null;
  let backgroundListener = null;

  function dispatch(getListener, message, sender, callback) {
    const promise = new Promise((resolve) => {
      const listener = getListener();
      if (!listener) {
        resolve(undefined);
        return;
      }
      listener(message, sender, resolve);
    });
    if (callback) {
      promise.then(callback);
      return undefined;
    }
    return promise;
  }

  const contentChrome = {
    runtime: {
      lastError: null,
      onMessage: { addListener: (fn) => { contentListener = fn; } },
      sendMessage: (message, callback) => dispatch(() => backgroundListener, message, { tab: fakeTab() }, callback)
    },
    storage: { local },
    i18n
  };

  const backgroundChrome = {
    runtime: {
      lastError: null,
      onMessage: { addListener: (fn) => { backgroundListener = fn; } },
      sendMessage: async () => undefined,
      getURL: (path) => path
    },
    storage: { local, session },
    i18n,
    tabs: {
      query: async () => [fakeTab()],
      get: async () => fakeTab(),
      update: async (_id, { url }) => {
        log.push(["navigate", url]);
        window.__mock.navigate(new URL(url).pathname);
        return fakeTab();
      },
      create: async (options) => {
        log.push(["tabs.create", options.url]);
        return { id: 2 };
      },
      sendMessage: (_id, message, callback) => dispatch(() => contentListener, message, {}, callback),
      onUpdated: { addListener() {}, removeListener() {} }
    },
    scripting: { executeScript: async () => [] },
    windows: {
      create: async () => {
        log.push(["windows.create"]);
        return { id: 9 };
      },
      update: async () => undefined
    }
  };

  async function load(path, chromeObject) {
    const code = await (await fetch(path)).text();
    new Function("chrome", code)(chromeObject);
  }

  async function boot() {
    catalog = await (await fetch(`/_locales/${uiLocale}/messages.json`)).json();
    if (impl === "old") {
      await load("/old/content.js", contentChrome);
    } else {
      await load("/src/background.js", backgroundChrome);
      await load("/src/panel-view.js", contentChrome);
      await load("/src/content.js", contentChrome);
    }
  }

  const ready = boot();

  function toContent(message) {
    return dispatch(() => contentListener, message, {}, null);
  }

  function toBackground(message) {
    return dispatch(() => backgroundListener, message, { tab: fakeTab() }, null);
  }

  const panelRoot = () => document.getElementById("x-unfollow-detector-floating-panel")?.shadowRoot;
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  async function getState() {
    return (await toBackground({ type: "GET_STATE" }))?.state;
  }

  window.__harness = {
    ready,
    log,
    toContent,
    toBackground,
    getState,
    panelRoot,
    click(selector) {
      const node = panelRoot()?.querySelector(selector);
      if (!node) throw new Error(`not found: ${selector}`);
      node.click();
    },
    async waitFor(predicate, timeoutMs = 300_000) {
      const startedAt = performance.now();
      while (performance.now() - startedAt < timeoutMs) {
        const state = await getState();
        if (predicate(state)) return state;
        await sleep(200);
      }
      throw new Error("waitFor timed out");
    },
    sleep,
    summary(state) {
      return {
        status: state.status,
        message: state.message,
        account: state.account,
        totalFollowing: state.totalFollowing,
        scanned: state.scannedCount,
        nonFollowers: state.nonFollowers.length,
        unfollowedCount: state.unfollowedCount,
        path: location.pathname,
        rows: panelRoot()?.querySelectorAll(".row").length
      };
    },
    // Direct content-script scan, comparable between the old and new implementation.
    async directScan() {
      await ready;
      window.__mock.navigate("/tester/following");
      const startedAt = performance.now();
      const response = await toContent({ type: "SCAN_FOLLOWING_PAGE", account: "tester" });
      const seconds = (performance.now() - startedAt) / 1000;
      const users = response?.users || [];
      const flagged = new Set(users.filter((user) => user.isFollowing && !user.followsYou).map((user) => user.handle));
      const truth = new Set(window.__mock.truthNonFollowers());
      return {
        impl,
        ok: response?.ok,
        error: response?.error,
        seconds: Math.round(seconds * 10) / 10,
        total: window.__mock.users.length,
        scanned: users.length,
        missedUsers: window.__mock.users.length - users.length,
        flagged: flagged.size,
        truth: truth.size,
        falsePositives: [...flagged].filter((handle) => !truth.has(handle)).length,
        falseNegatives: [...truth].filter((handle) => !flagged.has(handle)).length,
        pagesLoaded: window.__mock.stats.pagesLoaded
      };
    }
  };
})();
