# 抖音文章自动发布（小白零基础教程）

> 一句话：准备好一篇 Markdown 文案 + 几张封面图，运行一条命令，脚本自动帮你 **上传图片 → 打开抖音创作者中心 → 一键导入 → 填标题/摘要/头图/话题/配乐 → 点击发布**。

本教程 **同时支持 Windows 和 macOS**，全程复制粘贴命令即可，不需要任何编程基础。跟着一步步做，第一次就能跑通。

---

## 目录

1. [先了解它在做什么](#一先了解它在做什么)
2. [准备工作（软件与账号）](#二准备工作软件与账号)
3. [第 1 步：下载并安装依赖](#三第-1-步下载并安装依赖)
4. [第 2 步：配置图片存储（S3）](#四第-2-步配置图片存储s3)
5. [第 3 步：放入封面图](#五第-3-步放入封面图)
6. [第 4 步：写文案 `douyin.md`](#六第-4-步写文案-douyinmd)
7. [第 5 步：先空跑测试](#七第-5-步先空跑测试)
8. [第 6 步：正式发布](#八第-6-步正式发布)
9. [日常使用（最短路径）](#九日常使用最短路径)
10. [命令速查表](#十命令速查表)
11. [常见问题排查](#十一常见问题排查)
12. [安全提醒](#十二安全提醒)

---

## 一、先了解它在做什么

每次运行 `npm run publish`，脚本会按顺序自动完成：

1. 读取项目里的 `douyin.md`（第 1 行是标题，第 2 行是摘要，第 3 行起是正文）
2. 从 `images/` 文件夹随机选一张封面图，上传到你的图片存储，得到一个公开链接
3. 生成两个文件：`douyin.generated.md`（完整成品）和 `douyin.import.md`（给抖音导入用的正文）
4. 打开浏览器 → 抖音创作者中心 →「发布文章」→「一键导入」
5. 自动填标题、摘要，并上传同一张图作为文章头图
6. 添加话题（默认 `#暗区突围`），从推荐配乐前 5 首里随机选一首
7. 点击「发布」
8. **删除本次用过的那张本地图片**（避免下次重复使用，所以请多放几张并备份）

---

## 二、准备工作（软件与账号）

在开始前，请准备好下面这些。逐项对照，缺什么补什么。

| 准备项 | 说明 |
| --- | --- |
| 一台 Windows 或 Mac 电脑 | 两个系统都支持 |
| **Node.js** | 运行脚本的环境，建议 18 或更高版本 |
| **Google Chrome 浏览器** | 脚本会自动检测并使用它（Windows 上也支持 Microsoft Edge） |
| **抖音创作者账号** | 能登录 [创作者中心](https://creator.douyin.com)，并有「发布文章」权限 |
| **对象存储（S3）** | 把正文图片变成公开链接。推荐雨云 Rainyun、Cloudflare R2、阿里云 OSS 等 S3 兼容服务 |
| **若干封面图** | 后面放进 `images/` 文件夹（支持 jpg / jpeg / png / webp / gif） |

### 安装 Node.js（如果还没装）

打开 [nodejs.org](https://nodejs.org)，下载并安装 **LTS 版本**。

安装完成后，**重新打开**终端，输入下面命令确认能看到版本号：

```bash
node -v
```

> **Windows 用户：** 按 `Win` 键，输入 `PowerShell`，回车打开「Windows PowerShell」，在里面输入命令。
>
> **Mac 用户：** 按 `Command + 空格`，输入 `终端`（Terminal），回车打开，在里面输入命令。
>
> 只要能看到类似 `v20.11.0` 的版本号，就说明装好了。

---

## 三、第 1 步：下载并安装依赖

### 3.1 进入项目文件夹

先把项目文件夹放到你熟悉的位置（比如桌面），然后在终端里进入它。

**Windows（PowerShell）：**

```powershell
cd $HOME\Desktop\douyin-agent
```

**macOS（终端）：**

```bash
cd ~/Desktop/douyin-agent
```

> 如果你的项目不在桌面，把上面的路径换成你自己的实际路径即可。不确定路径时，可以直接把文件夹拖进终端窗口，它会自动填入路径。

### 3.2 （可选，国内强烈推荐）配置镜像源，加速下载

国内网络直接从官方源下载可能很慢甚至失败。可以把 **npm 镜像源** 和 **Playwright 浏览器下载源** 换成国内镜像（阿里/淘宝、清华、腾讯、华为等）。**只需设置一次。**

**① 切换 npm 镜像源**（三选一，任选一个自己喜欢的地址）：

```bash
# 阿里 / 淘宝（npmmirror，最常用、最稳定）
npm config set registry https://registry.npmmirror.com

# 腾讯云
npm config set registry https://mirrors.cloud.tencent.com/npm/

# 华为云
npm config set registry https://mirrors.huaweicloud.com/repository/npm/
```

> 上面命令里的地址可以换成 **任意** 镜像源 URL（例如你所在学校/公司的清华 TUNA 等内部源），格式都一样。

查看当前源、或恢复官方源：

```bash
# 查看当前使用的源
npm config get registry

# 恢复官方源
npm config set registry https://registry.npmjs.org
```

**② 切换 Playwright 浏览器下载源**（下一步 `npx playwright install` 会用到）：

**Windows（PowerShell）：**

```powershell
$env:PLAYWRIGHT_DOWNLOAD_HOST = "https://cdn.npmmirror.com/binaries/playwright"
```

**macOS（终端）：**

```bash
export PLAYWRIGHT_DOWNLOAD_HOST=https://cdn.npmmirror.com/binaries/playwright
```

> 这条命令只对 **当前终端窗口** 有效。想每次都生效，可写进系统环境变量，或在同一个终端窗口里接着执行后面的安装命令即可。

### 3.3 安装依赖

```bash
npm install
```

### 3.4 安装浏览器内核（推荐）

为保证在任何电脑上都能打开浏览器，建议装一份 Playwright 自带的 Chromium：

```bash
npx playwright install chromium
```

> 脚本会 **优先使用你电脑上已装的 Chrome**（Windows 上也会尝试 Edge）；如果没找到，就用上面这份自带的 Chromium。所以这一步装上最保险。

---

## 四、第 2 步：配置图片存储（S3）

抖音文章正文里的图片必须是「公开可访问的网络链接」。所以我们需要一个对象存储服务，把本地图片上传上去换成链接。这一步 **只需要配置一次**。

### 4.1 复制配置模板

**Windows（PowerShell）：**

```powershell
copy .env.example .env
```

**macOS（终端）：**

```bash
cp .env.example .env
```

这会生成一个 `.env` 文件，专门存放你的密钥。**它已被 `.gitignore` 忽略，不会被提交到 Git。切勿把它截图、发群或上传到公开仓库。**

### 4.2 填写配置

用记事本 / VS Code 等任意编辑器打开 `.env`，按你的存储服务填写下面的项：

| 变量 | 含义 | 怎么填 |
| --- | --- | --- |
| `S3_BUCKET` | 桶（bucket）名称 | 你在控制台创建的 bucket 名 |
| `S3_ENDPOINT` | S3 接口地址 | 如 `https://s3.xxx.com` |
| `S3_REGION` | 区域 | 不确定就填 `auto` |
| `S3_ACCESS_KEY` | Access Key | 控制台生成的密钥 ID |
| `S3_SECRET_KEY` | Secret Key | 控制台生成的密钥 |
| `S3_PUBLIC_BASE` | 公开访问前缀 | 浏览器能直接打开的域名/CDN 前缀 |
| `S3_KEY_PREFIX` | 上传目录前缀 | 默认 `douyin` 即可 |
| `S3_FORCE_PATH_STYLE` | 是否强制 path-style | 多数填 `false`，按服务商文档调整 |

> **兼容说明：** 脚本也支持标准命名 `S3_ACCESS_KEY_ID`、`S3_SECRET_ACCESS_KEY`、`S3_PUBLIC_BASE_URL`，二选一即可。

> **⚠️ 最关键的一项：** `S3_PUBLIC_BASE` 必须是浏览器能 **直接打开** 的链接。如果桶是私有的、链接打不开，抖音就读不到正文图片，发布会失败。

### 4.3 可选配置

`.env` 里还有一些可选项，一般不用改：

```bash
# 默认话题（不用带 # 号，脚本会自动加）
DOUYIN_TOPIC_TAG=暗区突围

# 如果脚本没自动找到浏览器，可手动指定路径
# Windows 示例：
# DOUYIN_BROWSER_EXECUTABLE_PATH=C:\Program Files\Google\Chrome\Application\chrome.exe
# macOS 示例：
# DOUYIN_BROWSER_EXECUTABLE_PATH=/Applications/Google Chrome.app/Contents/MacOS/Google Chrome
```

### 4.4 测试上传是否成功

放一张测试图，比如 `images/test.png`，然后运行：

```bash
npm run upload -- images/test.png
```

如果终端打印出一行 `https://` 开头的链接，并且用浏览器打开能看到图片，就说明存储配置成功了 ✅。

---

## 五、第 3 步：放入封面图

1. 在项目根目录创建一个 `images` 文件夹（如果还没有）
2. 把多张封面图放进去，例如：

```text
images/
  cover-01.jpg
  cover-02.png
  cover-03.webp
```

支持格式：`.jpg` / `.jpeg` / `.png` / `.webp` / `.gif`

> **⚠️ 重要：** 每次发布会 **随机选一张图，并在流程结束后删除这张本地图片**。所以请多放几张，并 **自行备份原图**。

---

## 六、第 4 步：写文案 `douyin.md`

用编辑器打开项目根目录的 `douyin.md`，按下面的结构写：

```markdown
[单局9把原型px！]不出一直打？？
👉[单局9把原型px！]究竟能否成功？

本作品roll30位体验，打出"666"安排！
![](图片链接)

👉打不出来直接安排100M保底！

期间所有物资全归粉、绝不敷衍！
```

规则很简单：

| 位置 | 作用 |
| --- | --- |
| 第 1 个非空行 | **文章标题**（发布时会去掉最外层 `[...]` 标记） |
| 第 2 个非空行 | **文章摘要**（去掉方括号，最多保留 30 个字） |
| 第 3 行起 | **正文**（会导入到抖音文章编辑器） |

正文里 **必须保留** 这一行图片占位符（不要改写法）：

```markdown
![](图片链接)
```

脚本上传图片后，会自动把 `图片链接` 替换成真实的公开 URL。

> 标题/摘要里可以用 `[主题文字]` 做可替换标记。换主题时可以用命令行参数临时替换，而不必改文件（见 [第 6 步](#八第-6-步正式发布)）。

---

## 七、第 5 步：先空跑测试

「空跑」只生成文件，**不打开浏览器、不真正发布**，用来检查内容对不对：

```bash
npm run publish -- --dry-run
```

成功后你会看到两个新文件：

- `douyin.generated.md`：完整成品（含标题、摘要、已替换的图片链接）
- `douyin.import.md`：给抖音「一键导入」用的正文（已去掉标题、摘要两行）

打开这两个文件检查内容是否正确。

> **⚠️ 注意：** 即使是空跑，本次随机选中的本地图片 **仍会被删除**，请确认 `images/` 里还有备份或其他图。

---

## 八、第 6 步：正式发布

确认 `douyin.md` 和 `images/` 都准备好后，运行：

```bash
npm run publish
```

### 第一次运行时的操作步骤

1. 脚本会弹出浏览器窗口，打开抖音创作者中心
2. 如果未登录，请在浏览器里 **扫码 / 验证码登录**
3. 登录成功后，回到 **终端**，按一次 **回车键**
4. 脚本会自动完成：点「发布文章」→「一键导入」→ 填标题摘要 → 上传头图 → 加话题 → 选配乐 → 点「发布」
5. 浏览器会额外停留约 10 秒，请你在页面上确认是否发布成功

> 登录状态会保存在项目里的 `.douyin-browser/` 文件夹，之后一般不用再重复登录。

### 临时更换主题（不改 `douyin.md`）

```bash
npm run publish -- --topic "[新的文章主题]"
```

方括号可加可不加，下面这样也行：

```bash
npm run publish -- --topic "必须单局带出188发61弹！"
```

> 脚本不会叠成双重方括号，抖音标题最终会去掉最外层标记。

### 无界面模式（进阶）

```bash
npm run publish -- --headless
```

适合已经登录过、且不需要处理验证码的情况。**首次登录或出现验证码时不要用这个模式。**

---

## 九、日常使用（最短路径）

以后每次发文，只需做三件事：

1. 改好 `douyin.md`（或准备好 `--topic` 参数）
2. 确保 `images/` 里还有没用过的图
3. 运行：

```bash
npm run publish
```

想先检查再发，就先空跑一次：

```bash
npm run publish -- --dry-run
npm run publish
```

---

## 十、命令速查表

```bash
# （可选）切换 npm 镜像源加速，如阿里/淘宝
npm config set registry https://registry.npmmirror.com

# 安装依赖（首次）
npm install

# 安装浏览器内核（首次，推荐）
npx playwright install chromium

# 只上传一张图，打印公开 URL（测试存储）
npm run upload -- images/example.png

# 空跑：只生成 md，不打开浏览器、不发布
npm run publish -- --dry-run

# 正式发布
npm run publish

# 发布时临时指定主题
npm run publish -- --topic "你的主题"

# 无界面发布（需已登录，无验证码）
npm run publish -- --headless
```

---

## 项目结构说明

```text
douyin-agent/
├── douyin.md              ← 你每次改的文章模板（标题/摘要/正文）
├── images/                ← 封面图池（用一张删一张，记得备份）
├── .env                   ← 你的密钥配置（勿提交、勿分享）
├── .env.example           ← 配置模板
├── scripts/publish.mjs    ← 发布主流程
├── oss-s3/upload.mjs      ← 图片上传到 S3
├── douyin.generated.md    ← 运行后生成：完整成品
├── douyin.import.md       ← 运行后生成：抖音导入正文
└── .douyin-browser/       ← 浏览器登录状态（本地缓存）
```

---

## 十一、常见问题排查

| 现象 | 处理办法 |
| --- | --- |
| `node` / `npm` 不是内部或外部命令 | Node.js 没装好或没重启终端。重装 [Node.js LTS](https://nodejs.org) 并重新打开终端 |
| `npm install` 很慢 / 超时 / 卡住 | 切换国内镜像源后重试，见 [3.2 配置镜像源](#32-可选国内强烈推荐配置镜像源加速下载) |
| `npx playwright install` 下载失败 | 先设置 `PLAYWRIGHT_DOWNLOAD_HOST` 镜像再重试，见 [3.2 配置镜像源](#32-可选国内强烈推荐配置镜像源加速下载) |
| `Executable doesn't exist` / 打不开浏览器 | 运行 `npx playwright install chromium`；或在 `.env` 里设置 `DOUYIN_BROWSER_EXECUTABLE_PATH` 指向 Chrome/Edge |
| `缺少 S3 配置` | 检查是否已复制并正确填写 `.env` |
| 上传成功但图片打不开 | 检查 `S3_PUBLIC_BASE`，确认桶/对象为公开可读，或已走 CDN |
| `images 目录中没有可用图片` | 创建 `images/` 文件夹并放入 jpg/png 等图片 |
| `没有找到 ![](图片链接)` | 在 `douyin.md` 正文中保留 `![](图片链接)` 占位符 |
| `没有找到"发布文章"入口` | 确认已登录且账号有文章权限；查看根目录生成的 `douyin.debug.png` 截图 |
| 卡在验证码 / 协议弹窗 / 页面改版 | 在浏览器里手动处理，关掉后重新 `npm run publish`；失败时通常会留下 `douyin.debug.png` |
| 话题找不到 | 默认话题是「暗区突围」，在 `.env` 用 `DOUYIN_TOPIC_TAG` 改成你账号可用的话题 |
| Windows 上路径含空格报错 | 命令里的路径用英文双引号包起来，如 `cd "C:\我的 项目\douyin-agent"` |

---

## 十二、安全提醒

- `.env` 只留在本机，**不要截图、不要发群、不要 push 到公开仓库**
- `.douyin-browser/` 里保存着登录态，也 **不要分享**给别人
- 本工具会 **真实点击「发布」**，只想测试请务必加 `--dry-run`
