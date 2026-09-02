# 抖音文章自动发布

这个工作流每次执行会：

1. 读取根目录的 `douyin.md`，使用其中第一个 `[文章主题]` 的内容；也可以通过 `--topic` 临时替换它。
2. 从 `images/` 随机挑选一张图片。
3. 通过 `oss-s3/` 上传图片，得到公开 URL，并写入 `douyin.generated.md`。
4. 打开抖音创作者平台，填入标题、正文和图片，然后点击发布。

## 首次配置

复制 `.env.example` 为 `.env`，填写 S3 兼容对象存储配置。Rainyun 可直接使用 `S3_ACCESS_KEY`、`S3_SECRET_KEY` 和 `S3_PUBLIC_BASE`；脚本也兼容 `S3_ACCESS_KEY_ID`、`S3_SECRET_ACCESS_KEY` 和 `S3_PUBLIC_BASE_URL`。公开地址必须是浏览器可以访问的 URL；如果桶是私有的，抖音无法读取文章图片。

安装依赖和 Playwright 浏览器：

```bash
npm install
npx playwright install chromium
```

## 使用

直接编辑 `douyin.md` 中的 `[单局9把原型px！]` 文本，然后运行：

```bash
npm run publish
```

也可以不改文件，临时指定主题：

```bash
npm run publish -- --topic "新的文章主题"
```

首次运行会打开浏览器，请完成抖音登录后回到终端按回车。脚本会保留登录状态在 `.douyin-browser/`。发布前建议先运行：

```bash
npm run publish -- --dry-run
```

只生成 `douyin.generated.md`，不打开浏览器。平台页面改版或出现验证码时，脚本会保留窗口并提示手动完成当前步骤。
