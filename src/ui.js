document.title = chrome.i18n.getMessage("extName");
document.documentElement.lang = chrome.i18n.getUILanguage();

const root = document.querySelector("[data-ui-root]");
const view = globalThis.XNFPanelView.mount(root, {
  mode: "popup",
  onOpenPage: () => window.close()
});

init();

async function init() {
  const darkQuery = window.matchMedia("(prefers-color-scheme: dark)");
  const stored = await chrome.storage.local.get("xTheme").catch(() => null);
  view.setTheme(stored?.xTheme || (darkQuery.matches ? "dark" : "light"));

  chrome.runtime.onMessage.addListener((message) => {
    if (message?.type === "STATE_CHANGED") view.render(message.state);
  });

  chrome.runtime.sendMessage({ type: "GET_STATE" }, (response) => {
    if (chrome.runtime.lastError) return;
    if (response?.state) view.render(response.state);
  });
}
