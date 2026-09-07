# 抖音文章自动发布（小白教程）

用一篇 Markdown 模板 + 几张封面图，脚本会自动：上传图片 → 生成导入文件 → 打开抖音创作者中心 → 一键导入并填好标题/摘要/头图/话题/配乐 → 点击发布。

当前流程已在抖音创作者中心实际验证通过。按下面步骤做，第一次就能跑通。

---

## 你需要准备什么

| 准备项 | 说明 |
| --- | --- |
| 一台 Mac | 脚本默认使用 macOS 上的 Google Chrome |
| Node.js | 建议 18 或更高；终端输入 `node -v` 能看到版本号即可 |
| Google Chrome | 已安装到 `/Applications/Google Chrome.app` |
| 抖音创作者账号 | 能登录 [创作者中心](https://creator.douyin.com)，并具备「发布文章」权限 |
| 对象存储（S3） | 用于把正文里的图片变成公开可访问的链接（如雨云 Rainyun 等 S3 兼容服务） |
| 若干封面图 | 放进项目里的 `images/` 文件夹（jpg / png / webp / gif） |

> 没有 Node.js？去 [nodejs.org](https://nodejs.org) 下载 LTS 安装包，安装后重新打开终端再检查 `node -v`。

---

## 整体在做什么（先看一眼）

每次执行 `npm run publish`，脚本会按顺序：

1. 读取根目录的 `douyin.md`（第 1 行标题、第 2 行摘要、第 3 行起正文）
2. 从 `images/` 随机选一张图，上传到对象存储，得到公开 URL
3. 生成成品 `douyin.generated.md`，以及给抖音导入用的 `douyin.import.md`（去掉标题和摘要两行，避免正文重复）
4. 打开浏览器进入创作者中心 →「发布文章」→「一键导入」
5. 自动填写标题、摘要，上传同一张图作为头图并确认裁剪
6. 添加话题（默认 `#暗区突围`），从推荐配乐前 5 首里随机选一首
7. 点击「发布」
8. **删除**本次用过的那张本地图片，避免下次重复用

---

## 第 1 步：进入项目并安装依赖

在终端里进入本项目目录（把路径换成你自己的）：

```bash
cd /path/to/douyin-agent
npm install
```

如果本机没有系统 Chrome，也可以让 Playwright 自带浏览器：

```bash
npx playwright install chromium
```

---

## 第 2 步：配置对象存储（只做一次）

### 2.1 复制配置文件

```bash
cp .env.example .env
```

用任意编辑器打开 `.env`，按你的存储服务填写。`.env` 已在 `.gitignore` 里，**不要**把密钥提交到 Git，也不要发到公开聊天里。

### 2.2 必填项说明

| 变量 | 含义 | 示例思路 |
| --- | --- | --- |
| `S3_BUCKET` | 桶名称 | 控制台里创建的 bucket 名 |
| `S3_ENDPOINT` | S3 接口地址 | 如 `https://s3.xxx.com` |
| `S3_REGION` | 区域 | 不确定可先填 `auto` |
| `S3_ACCESS_KEY` | Access Key | 控制台创建的密钥 ID |
| `S3_SECRET_KEY` | Secret Key | 控制台创建的密钥 |
| `S3_PUBLIC_BASE` | 浏览器可直接打开的公开前缀 | 如 `https://你的域名或CDN/路径` |
| `S3_KEY_PREFIX` | 上传目录前缀 | 默认 `douyin` 即可 |
| `S3_FORCE_PATH_STYLE` | 是否强制 path-style | 多数填 `false`；按服务商文档调整 |

雨云等服务常用上面这套名字；脚本也兼容 `S3_ACCESS_KEY_ID`、`S3_SECRET_ACCESS_KEY`、`S3_PUBLIC_BASE_URL`。

**重要：** `S3_PUBLIC_BASE` 必须是浏览器能直接打开的 URL。如果桶是私有的、链接打不开，抖音就读不到正文图片。

可选（一般不用改）：

```bash
DOUYIN_CREATOR_URL=https://creator.douyin.com/creator-micro/content/upload
DOUYIN_BROWSER_DATA_DIR=.douyin-browser
```

默认话题是「暗区突围」。若要改成别的，可在 `.env` 增加：

```bash
DOUYIN_TOPIC_TAG=你的话题名
```

（不要带 `#` 号，脚本会自动加。）

### 2.3 先测一下上传是否通

准备一张测试图，例如 `images/test.png`，然后：

```bash
npm run upload -- images/test.png
```

终端里如果打印出一行以 `https://` 开头的链接，用浏览器打开能看到图片，说明对象存储配置成功。

---

## 第 3 步：准备封面图

1. 在项目根目录创建文件夹 `images`（如果还没有）
2. 把多张封面图放进去，例如：

```text
images/
  cover-01.jpg
  cover-02.png
  cover-03.webp
```

每次发布会**随机选一张并在发布流程结束后删除该文件**，所以请多放几张，并自行备份原图。

支持格式：`.jpg` / `.jpeg` / `.png` / `.webp` / `.gif`

---

## 第 4 步：写文章模板 `douyin.md`

用编辑器打开根目录的 `douyin.md`，按这个结构写：

```markdown
[单局9把原型px！]不出一直打？？
👉[单局9把原型px！]究竟能否成功？

本作品roll30位体验，打出“666”安排！
![](图片链接)

👉打不出来直接安排100M保底！

期间所有物资全归粉、绝不敷衍！
```

规则很简单：

| 行 | 作用 |
| --- | --- |
| 第 1 个非空行 | **文章标题**（发布时会去掉最外层 `[...]` 标记） |
| 第 2 个非空行 | **文章摘要**（发布时去掉方括号，最多保留 30 个字） |
| 第 3 行起 | **正文**（会导入到抖音文章编辑器） |

正文里必须保留这一行占位符（不要改掉写法）：

```markdown
![](图片链接)
```

脚本上传图片后会把 `图片链接` 替换成真实公开 URL。

标题/摘要里可以用 `[主题文字]` 做可替换标记。以后换主题时，可以临时用命令行参数替换，而不必改文件（见第 6 步）。

---

## 第 5 步：先空跑一次（强烈建议）

空跑只生成文件、**不打开浏览器、不真正发布**：

```bash
npm run publish -- --dry-run
```

成功后你会看到：

- `douyin.generated.md`：完整成品（含标题、摘要、已替换的图片链接）
- `douyin.import.md`：给抖音「一键导入」用的正文（已去掉标题、摘要两行）

打开这两个文件检查一下内容是否正确。注意：即使用 `--dry-run`，本次随机选中的本地图片**仍会被删除**，请确认 `images/` 里还有备份。

---

## 第 6 步：真正发布

确认 `douyin.md` 和 `images/` 都准备好后：

```bash
npm run publish
```

### 第一次运行时要做什么

1. 脚本会弹出 Chrome 窗口，打开抖音创作者中心
2. 如果未登录，请在浏览器里扫码 / 验证码登录
3. 登录成功后，回到**终端**，按一次 **回车**
4. 之后脚本会自动：点「发布文章」→「一键导入」→ 填标题摘要 → 上传头图 → 加话题 → 选配乐 → 点「发布」
5. 浏览器会多停留约 10 秒，请你在页面上确认是否发布成功

登录状态保存在项目里的 `.douyin-browser/`，下次一般不用再登录。

### 临时换主题（不改 `douyin.md`）

```bash
npm run publish -- --topic "[新的文章主题]"
```

方括号可选，下面这样也可以：

```bash
npm run publish -- --topic "必须单局带出188发61弹！"
```

脚本不会叠成双重方括号；抖音标题最终会去掉最外层标记。

### 无界面模式（进阶）

```bash
npm run publish -- --headless
```

适合已经登录过、且不需要处理验证码的情况。**首次登录或出现验证码时不要用。**

---

## 日常怎么用（最短路径）

以后每次发文，只做这三件事：

1. 改好 `douyin.md`（或准备好 `--topic`）
2. 确保 `images/` 里还有没用过的图
3. 运行：

```bash
npm run publish
```

想先检查再发：

```bash
npm run publish -- --dry-run
npm run publish
```

---

## 常用命令速查

```bash
# 安装依赖（首次）
npm install

# 只上传一张图，打印公开 URL
npm run upload -- images/example.png

# 空跑：只生成 md，不打开浏览器
npm run publish -- --dry-run

# 正式发布
npm run publish

# 发布时临时指定主题
npm run publish -- --topic "你的主题"

# 无界面发布（需已登录）
npm run publish -- --headless
```

---

## 项目里重要文件

```text
douyin-agent/
├── douyin.md              ← 你每次改的文章模板
├── images/                ← 封面图池（用一张删一张）
├── .env                   ← 本机密钥（勿提交）
├── .env.example           ← 配置模板
├── scripts/publish.mjs    ← 发布主流程
├── oss-s3/upload.mjs      ← 图片上传到 S3
├── douyin.generated.md    ← 运行后生成的完整成品
├── douyin.import.md       ← 运行后生成的抖音导入正文
└── .douyin-browser/       ← 浏览器登录状态（本地缓存）
```

---

## 出问题了怎么办

| 现象 | 处理办法 |
| --- | --- |
| `Executable doesn't exist` | 安装 Chrome，或执行 `npx playwright install chromium` |
| `缺少 S3 配置` | 检查是否已复制并填写 `.env` |
| 上传成功但图片打不开 | 检查 `S3_PUBLIC_BASE`，确认桶/对象为公开可读或走了 CDN |
| `images 目录中没有可用图片` | 创建 `images/` 并放入 jpg/png 等图片 |
| `没有找到 ![](图片链接)` | 在 `douyin.md` 正文中保留 `![](图片链接)` 占位符 |
| `没有找到“发布文章”入口` | 确认已登录且账号有文章权限；查看根目录 `douyin.debug.png` |
| 卡住验证码 / 协议弹窗 / 页面改版 | 在浏览器里手动处理，关掉后重新 `npm run publish`；脚本失败时通常会留下 `douyin.debug.png` |
| 话题找不到 | 默认话题是「暗区突围」；在 `.env` 用 `DOUYIN_TOPIC_TAG` 改成你账号可用的话题名 |

---

## 安全提醒

- `.env` 只留在本机，不要截图、不要发群、不要 push 到公开仓库
- `.douyin-browser/` 里有登录态，也不要分享给别人
- 本工具会真实点击「发布」，空跑请用 `--dry-run`
