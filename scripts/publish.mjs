import "dotenv/config";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { basename, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { uploadImage } from "../oss-s3/upload.mjs";

const rootDir = resolve(fileURLToPath(new URL("..", import.meta.url)));
const templatePath = join(rootDir, "douyin.md");
const imagesDir = join(rootDir, "images");
const outputPath = join(rootDir, "douyin.generated.md");
const imageExtensions = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif"]);

function parseArgs(argv) {
  const options = { topic: "", dryRun: false, headed: true };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--topic" || value === "-t") options.topic = argv[++index] || "";
    else if (value === "--dry-run") options.dryRun = true;
    else if (value === "--headless") options.headed = false;
    else if (!value.startsWith("-")) options.topic ||= value;
  }
  return options;
}

async function chooseImage() {
  const entries = await readdir(imagesDir, { withFileTypes: true });
  const images = entries
    .filter((entry) => entry.isFile() && imageExtensions.has(extname(entry.name).toLowerCase()))
    .map((entry) => join(imagesDir, entry.name));
  if (!images.length) throw new Error(`images 目录中没有可用图片: ${imagesDir}`);
  return images[Math.floor(Math.random() * images.length)];
}

function replaceTopic(markdown, topic) {
  const token = markdown.match(/\[([^\]\n]+)\]/)?.[1];
  if (!token && !topic) throw new Error("douyin.md 中没有找到 [文章主题] 占位文本。");
  if (!topic) return markdown;
  if (!token) return markdown.replace(/\[\]/g, `[${topic}]`);
  return markdown.split(`[${token}]`).join(`[${topic}]`);
}

function replaceImage(markdown, url) {
  if (!/!\[\s*\]\([^)]*\)/.test(markdown)) {
    throw new Error("douyin.md 中没有找到 ![](图片链接) 图片占位符。");
  }
  return markdown.replace(/!\[\s*\]\([^)]*\)/, `![](${url})`);
}

function titleFromMarkdown(markdown) {
  return markdown.split(/\r?\n/).find((line) => line.trim())?.replace(/^#+\s*/, "").trim() || "抖音文章";
}

function bodyWithoutImage(markdown) {
  return markdown.replace(/!\[\s*\]\([^)]*\)/g, "").trim();
}

async function firstVisible(page, selectors) {
  for (const selector of selectors) {
    const locator = page.locator(selector).first();
    if (await locator.count() && await locator.isVisible().catch(() => false)) return locator;
  }
  return null;
}

async function waitForLogin(page) {
  const loginSignals = ["text=登录", "text=扫码登录", "text=手机号登录", "input[placeholder*='手机号']"];
  const login = await firstVisible(page, loginSignals);
  if (!login) return;
  console.log("请在打开的抖音创作者平台窗口中完成登录，完成后回到终端按回车继续。");
  const rl = createInterface({ input, output });
  await rl.question("");
  rl.close();
}

async function fillEditor(page, title, body, imagePath) {
  const titleInput = await firstVisible(page, [
    "input[placeholder*='标题']", "textarea[placeholder*='标题']", "input[aria-label*='标题']",
  ]);
  if (titleInput) await titleInput.fill(title);

  const editor = await firstVisible(page, [
    "[contenteditable='true']", "textarea[placeholder*='正文']", "textarea[placeholder*='内容']",
  ]);
  if (!editor) throw new Error("没有找到文章编辑器。请确认当前页面是抖音图文/文章发布页。页面已保留，便于手动处理。");
  await editor.click();
  await editor.fill(body);

  const fileInput = page.locator("input[type=file]").first();
  if (await fileInput.count()) {
    await fileInput.setInputFiles(imagePath);
    await page.waitForTimeout(1000);
  } else {
    console.warn("页面没有发现图片上传控件，请在平台窗口中手动上传本次图片:", basename(imagePath));
  }
}

async function publishOnDouyin({ markdown, imagePath, headed }) {
  const browserDataDir = resolve(rootDir, process.env.DOUYIN_BROWSER_DATA_DIR || ".douyin-browser");
  const context = await chromium.launchPersistentContext(browserDataDir, {
    headless: !headed,
    viewport: { width: 1440, height: 960 },
  });
  const page = context.pages()[0] || await context.newPage();
  await page.goto(process.env.DOUYIN_CREATOR_URL || "https://creator.douyin.com/creator-micro/content/post", { waitUntil: "domcontentloaded" });
  await waitForLogin(page);
  await fillEditor(page, titleFromMarkdown(markdown), bodyWithoutImage(markdown), imagePath);

  const publishButton = await firstVisible(page, [
    "button:has-text('发布')", "text=发布", "button:has-text('立即发布')",
  ]);
  if (!publishButton) throw new Error("没有找到发布按钮。请在平台窗口中检查内容并手动发布。");
  await publishButton.click();
  await page.waitForTimeout(1500);
  console.log("已点击发布，请在抖音创作者平台确认发布结果。浏览器会保持打开 30 秒。");
  await page.waitForTimeout(30000);
  await context.close();
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const template = await readFile(templatePath, "utf8");
  const topic = options.topic || process.env.DOUYIN_TOPIC || "";
  const withTopic = replaceTopic(template, topic);
  const imagePath = await chooseImage();
  console.log(`随机图片: ${imagePath}`);
  const imageUrl = await uploadImage(imagePath);
  const markdown = replaceImage(withTopic, imageUrl);
  await writeFile(outputPath, markdown, "utf8");
  console.log(`已生成: ${outputPath}`);
  console.log(`图片链接: ${imageUrl}`);
  if (options.dryRun) return;
  await publishOnDouyin({ markdown, imagePath, headed: options.headed });
}

main().catch((error) => {
  console.error(`发布流程失败: ${error.message}`);
  process.exit(1);
});
