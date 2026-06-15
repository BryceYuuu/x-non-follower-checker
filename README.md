# X 未回关检测 Chrome 插件

纯前端 Chrome MV3 插件，用于在 X（原 Twitter）网页上读取当前账号的关注列表，筛选关注列表中没有显示 `Follows you / 关注了你` 标记的用户。

X 未回关检测是一款轻量级 Chrome 浏览器插件，适配新版 X（原 Twitter）网页。插件可以扫描当前登录账号的关注列表，识别“我已关注对方，但对方未回关我”的用户，并在弹窗或侧边面板中展示结果。

插件支持查看用户主页、一键批量取关、扫描进度展示等功能。所有数据仅在本地浏览器中处理，不上传到服务器，适合需要清理 X / Twitter 关注列表、检查互关关系、查找未回关用户的用户使用。

关键词：X未回关检测、Twitter未回关检测、X互关检测、Twitter互关检测、X取关工具、Twitter unfollow checker、X non followers checker、Twitter non followers。

## English

X Non-Follower Checker is a lightweight Chrome extension for the modern X, formerly Twitter, web app. It scans the current account's following list and detects users you follow who do not follow you back.

The extension provides a simple popup and side panel UI, profile review links, scan progress, and optional batch unfollow support. All data is processed locally in your browser and is not uploaded to any server.

Keywords: X non follower checker, Twitter non follower checker, X unfollow checker, Twitter unfollow checker, X follow back checker, Twitter follow back checker, X mutual follow checker, Twitter mutual follow checker.

## 文件结构

```text
.
├── manifest.json
├── README.md
├── popup/
│   └── popup.html
├── panel/
│   └── panel.html
├── src/
│   ├── background.js
│   ├── content.js
│   └── ui.js
├── scripts/
│   └── validate-extension.js
└── styles/
    └── ui.css
```

## 安装

1. 打开 Chrome：`chrome://extensions/`
2. 开启“开发者模式”
3. 点击“加载已解压的扩展程序”
4. 选择本目录

## 使用

1. 在 Chrome 中登录 `https://x.com`
2. 点击插件图标
3. 点击“开始检测”
4. 插件会打开当前标签页的 `/{你的用户名}/following` 并滚动扫描关注列表
5. 检测完成后，可点击头像、用户名或“主页”进入用户主页手动确认
6. 如需批量处理，点击“一键取关”，确认不可恢复提示后插件会在当前关注列表页中逐个取消关注

如果插件未能自动识别当前账号，可在输入框手动填写自己的 X 用户名。

## 本地校验

```bash
node scripts/validate-extension.js
```

该命令会检查 `manifest.json`、HTML 引用路径和所有 JS 文件语法。

## 实现说明

- 不使用服务器，不上传账号数据。
- 不调用私有后端服务，依赖 X 网页 DOM 读取可见用户卡片。
- 检测只使用当前 X 标签页，不会批量打开用户主页。
- 检测时插件会进入关注列表页面，自动滚动收集你正在关注的用户。
- 只有关注列表用户卡片上确认为 `Following / 正在关注`，且没有 `Follows you / 关注了你` 标记的人才会进入结果。
- 结果列表中的头像和用户名都可点击打开用户主页。
- 一键取关会先显示确认弹窗；确认后会在当前关注列表页面滚动查找结果用户并点击取消关注，不会逐个打开个人主页。
- 如果 X 页面在插件安装前已经打开，后台会自动补注入页面脚本，不需要手动刷新。

X 网页 DOM 会变化，如 X 调整用户卡片或按钮结构，可能需要更新 `src/content.js` 中的选择器。
