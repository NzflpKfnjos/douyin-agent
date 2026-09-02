# 抖音文章自动发布

当前流程已在抖音创作者中心实际验证通过。

这个工作流每次执行会：

1. 读取根目录的 `douyin.md`，第一行作为文章标题，第二行作为文章摘要，第三行起作为正文；标题或摘要中可以用 `[...]` 标记主题，也可以通过 `--topic` 临时替换它。
2. 从 `images/` 随机挑选一张图片。
3. 通过 `oss-s3/` 上传图片，得到公开 URL，并回写到完整成品 `douyin.generated.md`。
4. 自动生成抖音导入文件 `douyin.import.md`，去掉模板前两个非空行，避免标题和摘要在正文中重复显示。
5. 打开抖音创作者平台，进入“发布文章”，通过“一键导入”导入 `douyin.import.md`。
6. 使用 `douyin.md` 第一行作为文章标题，发布时去掉标题开头的主题标记方括号。
7. 使用 `douyin.md` 第二行作为文章摘要，发布时去掉方括号并最多保留 30 个字符。
8. 在文章头图区域上传第 2 步选择的同一张随机图片，并确认裁剪。
9. 添加话题 `#暗区突围`。
10. 打开配乐选择面板，从“推荐”列表前 5 首中随机选择一首。
11. 点击文章页底部的“发布”。

## 首次配置

如果需要分发给 Windows 使用者，请查看 [`windows-publisher/`](windows-publisher/)。它提供可打包为 `.exe` 的桌面客户端；私下分发时可将共用 S3 配置随安装包内置，每位使用者只需在自己的客户端中登录抖音账号。

复制 `.env.example` 为 `.env`，填写 S3 兼容对象存储配置。Rainyun 可直接使用 `S3_ACCESS_KEY`、`S3_SECRET_KEY` 和 `S3_PUBLIC_BASE`；脚本也兼容 `S3_ACCESS_KEY_ID`、`S3_SECRET_ACCESS_KEY` 和 `S3_PUBLIC_BASE_URL`。公开地址必须是浏览器可以访问的 URL；如果桶是私有的，抖音无法读取文章图片。

`.env` 仅保存在本机，已加入 `.gitignore`，不要把访问密钥提交到 Git 或发送到公开位置。

安装依赖：

```bash
npm install
```

脚本会自动使用 macOS 的 `/Applications/Google Chrome.app`。如果机器没有可用的 Chrome，也可以安装 Playwright 浏览器：

```bash
npx playwright install chromium
```

## 使用

直接编辑 `douyin.md` 的前两行标题和摘要、以及第三行起的正文；需要标记可替换主题时保留 `[...]`，然后运行：

```bash
npm run publish
```

也可以不改文件，临时指定主题：

```bash
npm run publish -- --topic "[新的文章主题]"
```

`--topic` 的方括号是可选标记，写成 `--topic "新的文章主题"` 也可以。使用方括号时，脚本不会生成双重方括号，抖音标题最终会去掉最外层标记。

首次运行会打开浏览器，请完成抖音登录后回到终端按回车。脚本会进入“发布文章”页，点击“一键导入”并导入 `douyin.import.md`，然后自动完成上述设置并发布。登录状态保存在 `.douyin-browser/`。

发布前建议先运行：

```bash
npm run publish -- --dry-run
```

只生成 `douyin.generated.md` 和用于抖音导入的 `douyin.import.md`，不打开浏览器。`--headless` 可用于无界面运行，但首次登录和需要人工处理验证码时不要使用它。

## 常用命令

上传单张图片并输出公开 URL：

```bash
npm run upload -- images/example.png
```

指定不同主题：

```bash
npm run publish -- --topic "单局188发61弹"
```

## 故障排查

- `Executable doesn't exist`：执行 `npx playwright install chromium`，或确保已安装 Google Chrome。
- `没有找到“发布文章”入口`：确认抖音账号已登录，并检查 `douyin.debug.png`。
- 文章头图上传后需要在抖音裁剪弹窗中确认，脚本会自动完成。
- 若抖音页面出现验证码、协议弹窗或页面改版，脚本会报错并保留调试截图，完成页面操作后重新运行。
