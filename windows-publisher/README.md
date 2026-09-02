# Windows 抖音文章发布器

这是面向多人使用、每人发布到自己抖音账号的 Windows 桌面应用。

- 每位使用者安装同一个桌面端，首次在应用打开的浏览器中登录自己的抖音账号。
- 每个 Windows 用户的登录态保存在 `%LOCALAPPDATA%\\DouyinArticlePublisher\\browser`，不会在账号之间共享。
- 共用 S3 配置随私下分发的安装包内置，使用者无需填写 S3 配置。
- 桌面端不会收集或上传抖音 Cookie。发布仍由使用者自己的本机浏览器完成。

## 目录

```text
windows-publisher/
  desktop/          Windows 桌面客户端（构建后交付给使用者）
```

## 管理员部署顺序

1. 编辑 `desktop/src/default-config.mjs`，填入共用 S3 配置。该软件只私下分发，因此配置会随安装包提供。
2. 推送代码到 GitHub，或在仓库的 **Actions -> Build Windows publisher -> Run workflow** 手动运行。工作流会在 `windows-latest` 上执行 `npm ci`、下载 Chromium 并构建 NSIS 安装包。
3. 在该次 workflow 的 Artifacts 中下载 `douyin-article-publisher-windows-*`，将其中的 NSIS 安装包私下分发给使用者。每个使用者安装后只需点击“登录抖音”并完成扫码。

桌面端首次打开会自动导入 `desktop/src/default-article.md` 中的标题、摘要和正文。模板中的 `[...]` 标记会保留在编辑框中，但发布时会按命令行流程去掉标题和摘要中的标记；修改模板后重新构建安装包即可更新默认文章。

S3 访问密钥会被打包进私有安装程序，必须只通过受控渠道分发；一旦安装包泄露，应立即在对象存储中轮换密钥。构建完成后，使用者无需填写任何服务设置，只需首次登录自己的抖音账号。

## 使用者流程

1. 打开“抖音文章发布器”。
2. 首次使用时，点击“登录抖音”，在打开的浏览器窗口中完成自己的账号登录，再回到应用点击“我已完成登录”。
3. 填写标题、摘要、正文和话题，选择一张头图，点击“发布文章”。

发布过程会导入正文、上传同一张头图、添加话题、从推荐列表随机选择配乐并点击发布。验证码、风控提示或抖音页面改版需要当前使用者在浏览器中处理。

## 账号边界

应用设计为一台电脑上的一个 Windows 用户对应一个抖音登录态。不要在多个 Windows 用户之间复制 `%LOCALAPPDATA%\\DouyinArticlePublisher\\browser`，也不要同时从同一目录启动多个发布任务；Chrome 的 Profile 锁会阻止这种做法。

## 开发与验证

桌面端可在 macOS 或 Windows 开发。GitHub Actions 已配置 Windows 构建；本地构建时可使用：

```bash
cd desktop
npm ci
npm run prepare-browser
npm start
```

构建 Windows 安装包：

```bash
npm run dist:win
```

构建过程会下载 Playwright Chromium 并将它打入安装包，因此最终使用者不需要单独安装 Chrome 或 Node.js。构建机需要能访问 Playwright 下载源。
