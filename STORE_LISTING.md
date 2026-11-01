# Chrome Web Store Listing Draft

## Title

X未回关检测 / X未回追蹤檢測 / X Non-Follower Checker

The name and short description are localized through `_locales/*/messages.json` (`extName`, `extDescription`).

## Summary

扫描 X / Twitter 关注列表，找出你已关注但未回关的用户，支持查看主页和一键取关。

## Description

X未回关检测是一款轻量级 Chrome 浏览器插件，适配新版 X（原 Twitter）网页。插件会扫描当前登录账号的关注列表，识别“我已关注对方，但对方未回关我”的用户，并在弹窗或侧边面板中展示结果。

主要功能：

- 扫描 X / Twitter 关注列表，显示进度和预计剩余时间
- 结果边扫描边显示，支持任意 X 界面语言
- 支持搜索、排序，点击头像或名字进入用户主页
- 支持单个取关，或筛选后批量取关，执行前会显示不可恢复确认提示
- 浮层可拖动、可收起，跟随 X 深色/浅色主题
- 界面支持简体中文、繁体中文和英文，跟随浏览器语言自动切换
- 本地浏览器处理数据，不上传到服务器

English:

X Non-Follower Checker is a lightweight Chrome extension for the modern X, formerly Twitter, web app. It scans the current account's following list and detects users you follow who do not follow you back.

Features:

- Scan your X / Twitter following list
- Detect accounts without the "Follows you" marker, in any X interface language
- Results stream in while the scan runs, with progress and time remaining
- Search, sort, and open user profiles for manual review
- Unfollow one account, or a filtered batch, with an irreversible confirmation prompt
- Interface in English, Simplified Chinese, and Traditional Chinese, following your browser language
- Local-only processing; no server upload

## Privacy Practices

Suggested declaration:

- The extension does not collect, sell, transmit, or store user data on external servers.
- Account handles and scan results are processed locally in the browser.
- The extension uses permissions only to run on X / Twitter pages, open the side panel, store local session state, and automate user-confirmed actions.

## Required Store Assets

- 128x128 PNG store icon: included at `assets/icon128.png`
- At least one 1280x800 screenshot: create from the extension popup/side panel in use
- Small promo tile 440x280 PNG/JPEG: create in the Chrome Web Store dashboard asset step
