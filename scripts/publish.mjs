import "dotenv/config";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { readdir, readFile, unlink, writeFile } from "node:fs/promises";
import { basename, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";
import { chromium } from "playwright";
import { uploadImage } from "../oss-s3/upload.mjs";

const rootDir = resolve(fileURLToPath(new URL("..", import.meta.url)));
const templatePath = join(rootDir, "douyin.md");
const imagesDir = join(rootDir, "images");
const outputPath = join(rootDir, "douyin.generated.md");
const importPath = join(rootDir, "douyin.import.md");
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

async function removeSelectedImage(imagePath) {
  await unlink(imagePath);
  console.log(`已删除已使用图片: ${imagePath}`);
}

function replaceTopic(markdown, topic) {
  if (!topic) return markdown;
  const topicText = topic.trim();
  const topicValue = topicText.match(/^\[([^\]\n]+)\]$/)?.[1] || topicText;
  const lines = markdown.split(/\r?\n/);
  const nonEmpty = lines
    .map((line, index) => ({ line, index }))
    .filter(({ line }) => line.trim());
  const titleLine = nonEmpty[0];
  if (!titleLine) throw new Error("douyin.md 中没有找到文章标题。");
  const token = titleLine.line.match(/\[([^\]\n]+)\]/)?.[1];
  if (token) {
    return markdown.split(`[${token}]`).join(`[${topicValue}]`);
  }
  const oldTitle = titleLine.line.trim();
  lines[titleLine.index] = topicText;
  if (nonEmpty[1]) lines[nonEmpty[1].index] = nonEmpty[1].line.replace(oldTitle, topic);
  return lines.join("\n");
}

function replaceImage(markdown, url) {
  if (!/!\[\s*\]\([^)]*\)/.test(markdown)) {
    throw new Error("douyin.md 中没有找到 ![](图片链接) 图片占位符。");
  }
  return markdown.replace(/!\[\s*\]\([^)]*\)/, `![](${url})`);
}

function titleFromMarkdown(markdown) {
  const title = markdown.split(/\r?\n/).find((line) => line.trim())?.replace(/^#+\s*/, "").trim() || "抖音文章";
  return title.replace(/^\[([^\]]+)\]/, "$1");
}

function summaryFromMarkdown(markdown) {
  const lines = markdown.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const summary = (lines[1] || lines[0] || "抖音文章").replace(/\[([^\]]+)\]/g, "$1");
  return summary.slice(0, 30);
}

function bodyForArticleImport(markdown) {
  const lines = markdown.split(/\r?\n/);
  let removed = 0;
  let index = 0;
  while (index < lines.length && removed < 2) {
    if (lines[index].trim()) removed += 1;
    index += 1;
  }
  while (index < lines.length && !lines[index].trim()) index += 1;
  return `${lines.slice(index).join("\n").trim()}\n`;
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

async function exactVisibleText(page, text) {
  const matches = page.getByText(text, { exact: true });
  for (let index = 0; index < await matches.count(); index += 1) {
    const match = matches.nth(index);
    if (await match.isVisible().catch(() => false)) return match;
  }
  return null;
}

async function fileInputWithAccept(page, fragment) {
  const inputs = page.locator("input[type=file]");
  for (let index = 0; index < await inputs.count(); index += 1) {
    const input = inputs.nth(index);
    if ((await input.getAttribute("accept") || "").includes(fragment)) return input;
  }
  return null;
}

async function exactButton(page, text) {
  const buttons = page.getByRole("button", { name: text, exact: true });
  for (let index = 0; index < await buttons.count(); index += 1) {
    const button = buttons.nth(index);
    if (await button.isVisible().catch(() => false)) return button;
  }
  return null;
}

async function pageText(page) {
  return (await page.locator("body").innerText().catch(() => "")).replace(/\s+/g, " ").trim();
}

async function waitForLogin(page) {
  await page.waitForTimeout(2500);
  const signals = ["扫码登录", "验证码登录", "密码登录", "请输入手机号", "登录即代表同意"];
  const isLoginPage = async () => {
    const text = await pageText(page);
    return signals.some((signal) => text.includes(signal));
  };
  if (!(await isLoginPage())) return;
  console.log("请在抖音创作者平台窗口中完成登录。登录成功后回到终端按回车继续。");
  const rl = createInterface({ input, output });
  await rl.question("");
  rl.close();
  await page.waitForTimeout(2500);
}

async function uploadArticleHeadImage(page, imagePath) {
  const uploadButton = await firstVisible(page, [".uploadButton-B4xMQ2"]);
  if (!uploadButton) throw new Error("没有找到文章头图上传按钮。");
  const [chooser] = await Promise.all([
    page.waitForEvent("filechooser", { timeout: 10000 }),
    uploadButton.click(),
  ]);
  await chooser.setFiles(imagePath);
  await page.waitForTimeout(800);
  const confirm = await exactVisibleText(page, "确定");
  if (!confirm) throw new Error("头图上传后没有找到裁剪确认按钮。");
  await confirm.click();
  await page.waitForFunction(
    () => document.body.innerText.includes("点击替换图片") && document.querySelector("[data-article-head-image] img"),
    undefined,
    { timeout: 30000 },
  );
  console.log("已使用本次随机图片作为文章头图。");
}

async function addArticleTopic(page, topic) {
  const addTopic = await exactVisibleText(page, "点击添加话题");
  if (!addTopic) throw new Error("没有找到文章话题入口。");
  await addTopic.click();
  await page.waitForTimeout(500);
  const search = await firstVisible(page, ["input[placeholder*='搜索或输入']"]);
  if (!search) throw new Error("没有找到话题搜索框。");
  await search.fill(topic);
  await page.waitForTimeout(900);
  const topicOption = await exactVisibleText(page, `#${topic}`);
  if (!topicOption) throw new Error(`没有找到话题 #${topic}。`);
  await topicOption.click();
  const confirm = await firstVisible(page, ["button:has-text('确认添加')"]);
  if (!confirm) throw new Error("没有找到话题确认按钮。");
  await confirm.click();
  await page.waitForTimeout(500);
  console.log(`已添加话题 #${topic}。`);
}

async function chooseRecommendedMusic(page) {
  const chooseMusic = await exactVisibleText(page, "选择音乐");
  if (!chooseMusic) throw new Error("没有找到配乐入口。");
  await chooseMusic.click();
  await page.waitForFunction(
    () => [...document.querySelectorAll("button")].some((button) => button.innerText.trim() === "使用"),
    undefined,
    { timeout: 30000 },
  );
  const classButtons = page.locator("button.apply-btn-LUPP0D");
  const useButtons = (await classButtons.count())
    ? classButtons
    : page.locator("button").filter({ hasText: /^使用$/ });
  const count = await useButtons.count();
  if (!count) throw new Error("推荐配乐列表为空。");
  const index = Math.floor(Math.random() * Math.min(5, count));
  const selected = useButtons.nth(index);
  await selected.evaluate((element) => element.click());
  await page.waitForTimeout(800);
  console.log(`已从推荐配乐前 ${Math.min(5, count)} 首中随机选择第 ${index + 1} 首。`);
}

async function publishArticleOnDouyin({ markdownPath, imagePath, title, summary, headed }) {
  const browserDataDir = resolve(rootDir, process.env.DOUYIN_BROWSER_DATA_DIR || ".douyin-browser");
  const systemChrome = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
  const executablePath = process.env.DOUYIN_BROWSER_EXECUTABLE_PATH
    || (existsSync(systemChrome) ? systemChrome : undefined);
  const context = await chromium.launchPersistentContext(browserDataDir, {
    headless: !headed,
    ...(executablePath ? { executablePath } : {}),
    viewport: { width: 1440, height: 960 },
  });
  try {
  const page = context.pages()[0] || await context.newPage();
  await page.goto(process.env.DOUYIN_CREATOR_URL || "https://creator.douyin.com/creator-micro/content/upload", { waitUntil: "domcontentloaded" });
  await waitForLogin(page);
  await page.waitForTimeout(1800);

  const articleTab = await exactVisibleText(page, "发布文章");
  if (!articleTab) {
    await page.screenshot({ path: join(rootDir, "douyin.debug.png"), fullPage: true }).catch(() => {});
    throw new Error(`没有找到“发布文章”入口，当前页面: ${page.url()}。已保存 douyin.debug.png。`);
  }
  await articleTab.click();
  await page.waitForTimeout(1800);

  const importButton = await exactVisibleText(page, "一键导入");
  if (!importButton) {
    await page.screenshot({ path: join(rootDir, "douyin.debug.png"), fullPage: true }).catch(() => {});
    throw new Error("没有找到“一键导入”按钮，请确认抖音文章发布页已加载。");
  }
  await importButton.click();
  await page.waitForTimeout(800);

  const markdownInput = await fileInputWithAccept(page, ".md");
  if (!markdownInput) throw new Error("没有找到 Markdown 导入控件。");
  await markdownInput.setInputFiles(markdownPath);
  await page.waitForURL(/\/content\/post\/article/, { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(3000);

  const titleInput = await firstVisible(page, [
    "input[placeholder*='文章标题']", "input[placeholder*='标题']",
  ]);
  if (!titleInput) {
    await page.screenshot({ path: join(rootDir, "douyin.debug.png"), fullPage: true }).catch(() => {});
    throw new Error(`文章导入后没有找到标题输入框，当前页面: ${page.url()}。已保存 douyin.debug.png。`);
  }
  await titleInput.fill(title);

  const summaryInput = await firstVisible(page, [
    "input[placeholder*='摘要']", "textarea[placeholder*='摘要']",
  ]);
  if (!summaryInput) throw new Error("没有找到文章摘要输入框。");
  await summaryInput.fill(summary);

  const editor = await firstVisible(page, ["[contenteditable='true']", ".tiptap.ProseMirror"]);
  if (!editor) throw new Error("文章导入后没有找到正文编辑器。");
  const importedImageCount = await editor.locator("img").count().catch(() => 0);
  const importedText = (await editor.innerText().catch(() => "")).trim();
  if (!importedText) throw new Error("Markdown 导入后正文为空。");
  console.log(`文章已导入，正文图片 ${importedImageCount} 张。`);

  await uploadArticleHeadImage(page, imagePath);
  await addArticleTopic(page, process.env.DOUYIN_TOPIC_TAG || "暗区突围");
  await chooseRecommendedMusic(page);

  const publishButton = await exactVisibleText(page, "发布");
  if (!publishButton) throw new Error("没有找到文章发布按钮。");
  if (await publishButton.isDisabled().catch(() => false)) throw new Error("文章发布按钮当前不可用，请检查必填项。");
  await publishButton.click();
  await page.waitForTimeout(4000);
  console.log("已点击文章发布，请在抖音创作者平台确认发布结果。浏览器会保持打开 10 秒。");
  await page.waitForTimeout(10000);
  } finally {
    await context.close().catch(() => {});
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const template = await readFile(templatePath, "utf8");
  const topic = options.topic || process.env.DOUYIN_TOPIC || "";
  const withTopic = replaceTopic(template, topic);
  const imagePath = await chooseImage();
  console.log(`随机图片: ${imagePath}`);
  try {
    const imageUrl = await uploadImage(imagePath);
    const markdown = replaceImage(withTopic, imageUrl);
    await writeFile(outputPath, markdown, "utf8");
    await writeFile(importPath, bodyForArticleImport(markdown), "utf8");
    console.log(`已生成: ${outputPath}`);
    console.log(`抖音导入文件: ${importPath}`);
    console.log(`图片链接: ${imageUrl}`);
    if (options.dryRun) return;
    await publishArticleOnDouyin({
      markdownPath: importPath,
      imagePath,
      title: titleFromMarkdown(markdown),
      summary: summaryFromMarkdown(markdown),
      headed: options.headed,
    });
  } finally {
    await removeSelectedImage(imagePath);
  }
}

main().catch((error) => {
  console.error(`发布流程失败: ${error.message}`);
  process.exit(1);
});
