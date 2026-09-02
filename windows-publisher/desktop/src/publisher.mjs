import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import { basename, extname, join } from "node:path";
import { randomUUID } from "node:crypto";
import { chromium } from "playwright";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

let loginContext;
let publishContext;

function error(message) {
  return new Error(message);
}

function bundledBrowserPath() {
  if (process.resourcesPath && !process.defaultApp) return join(process.resourcesPath, "pw-browsers");
  return join(import.meta.dirname, "..", "node_modules", "playwright-core", ".local-browsers");
}

async function exists(path) {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function launchContext(profileDir) {
  if (await exists(bundledBrowserPath())) {
    process.env.PLAYWRIGHT_BROWSERS_PATH = bundledBrowserPath();
  }
  await mkdir(profileDir, { recursive: true });
  return chromium.launchPersistentContext(profileDir, {
    headless: false,
    viewport: { width: 1440, height: 960 },
  });
}

async function pageFor(context) {
  return context.pages()[0] || context.newPage();
}

async function visibleExactText(page, text) {
  const matches = page.getByText(text, { exact: true });
  for (let index = 0; index < await matches.count(); index += 1) {
    const match = matches.nth(index);
    if (await match.isVisible().catch(() => false)) return match;
  }
  return null;
}

async function firstVisible(page, selectors) {
  for (const selector of selectors) {
    const locator = page.locator(selector).first();
    if (await locator.count() && await locator.isVisible().catch(() => false)) return locator;
  }
  return null;
}

async function pageText(page) {
  return (await page.locator("body").innerText().catch(() => "")).replace(/\s+/g, " ").trim();
}

function creatorUrl() {
  return "https://creator.douyin.com/creator-micro/content/upload";
}

export async function beginDouyinLogin({ profileDir, onProgress }) {
  if (loginContext) throw error("登录浏览器已打开，请完成登录后点击“我已完成登录”。");
  if (publishContext) throw error("正在发布，不能同时打开登录浏览器。");
  loginContext = await launchContext(profileDir);
  loginContext.on("close", () => { loginContext = undefined; });
  const page = await pageFor(loginContext);
  await page.goto(creatorUrl(), { waitUntil: "domcontentloaded" });
  onProgress("已打开抖音创作者平台，请在浏览器中完成登录。");
}

export async function closeDouyinLogin() {
  if (loginContext) await loginContext.close();
  loginContext = undefined;
}

function validateArticle(article) {
  const title = String(article?.title || "").trim().replace(/^\[([^\]]+)\]/, "$1");
  const summary = String(article?.summary || "").trim().replace(/\[([^\]]+)\]/g, "$1");
  const content = String(article?.content || "").trim();
  const topicTag = String(article?.topicTag || "暗区突围").trim().replace(/^#/, "");
  const imagePath = String(article?.imagePath || "").trim();
  if (!title) throw error("请填写文章标题。");
  if (!summary) throw error("请填写文章摘要。");
  if (!content) throw error("请填写正文。");
  if (!imagePath) throw error("请选择一张文章头图。");
  if (!topicTag) throw error("请填写话题。");
  return { title, summary: summary.slice(0, 30), content, topicTag, imagePath };
}

function mimeType(imagePath) {
  return ({ ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp", ".gif": "image/gif" })[imagePath.toLowerCase().match(/\.[^.]+$/)?.[0]] || "application/octet-stream";
}

function contentType(imagePath) {
  return ({ ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp", ".gif": "image/gif" })[extname(imagePath).toLowerCase()] || "application/octet-stream";
}

function configValue(config, name, alternate = "") {
  return config?.[name] || config?.[alternate] || "";
}

async function uploadImage(imagePath, config) {
  const bucket = configValue(config, "S3_BUCKET");
  const endpoint = configValue(config, "S3_ENDPOINT");
  const accessKeyId = configValue(config, "S3_ACCESS_KEY_ID", "S3_ACCESS_KEY");
  const secretAccessKey = configValue(config, "S3_SECRET_ACCESS_KEY", "S3_SECRET_KEY");
  const publicBaseUrl = configValue(config, "S3_PUBLIC_BASE_URL", "S3_PUBLIC_BASE");
  const missing = [
    !bucket && "S3_BUCKET",
    !endpoint && "S3_ENDPOINT",
    !accessKeyId && "S3_ACCESS_KEY_ID (或 S3_ACCESS_KEY)",
    !secretAccessKey && "S3_SECRET_ACCESS_KEY (或 S3_SECRET_KEY)",
    !publicBaseUrl && "S3_PUBLIC_BASE_URL (或 S3_PUBLIC_BASE)",
  ].filter(Boolean);
  if (missing.length) throw error(`内置 S3 配置不完整: ${missing.join(", ")}。请联系软件分发者。`);
  let bytes;
  try {
    bytes = await readFile(imagePath);
  } catch {
    throw error("选择的图片文件已不存在，请重新选择。");
  }
  const prefix = String(configValue(config, "S3_KEY_PREFIX") || "douyin").replace(/^\/+|\/+$/g, "");
  const key = `${prefix}/${Date.now()}-${randomUUID()}${extname(imagePath).toLowerCase()}`;
  const client = new S3Client({
    region: configValue(config, "S3_REGION") || "auto",
    endpoint,
    forcePathStyle: String(configValue(config, "S3_FORCE_PATH_STYLE")).toLowerCase() === "true",
    credentials: { accessKeyId, secretAccessKey },
  });
  try {
    await client.send(new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: bytes,
      ContentType: contentType(imagePath),
      CacheControl: "public, max-age=31536000, immutable",
    }));
  } catch (cause) {
    throw error(`图片上传失败: ${cause.message}`);
  }
  const base = publicBaseUrl.replace(/\/$/, "");
  return `${base}/${key.split("/").map(encodeURIComponent).join("/")}`;
}

async function writeImportFile({ tempDir, title, summary, content, imageUrl }) {
  const path = join(tempDir, `douyin-import-${randomUUID()}.md`);
  const imagePattern = /!\[\s*\]\([^)]*\)/;
  const importedContent = imagePattern.test(content)
    ? content.trim().replace(imagePattern, `![](${imageUrl})`)
    : `![](${imageUrl})\n\n${content.trim()}`;
  await writeFile(path, `${importedContent}\n`, "utf8");
  return { path, title, summary };
}

async function uploadHeadImage(page, imagePath) {
  const uploadButton = await firstVisible(page, [".uploadButton-B4xMQ2"]);
  if (!uploadButton) throw error("没有找到文章头图上传按钮。");
  const [chooser] = await Promise.all([
    page.waitForEvent("filechooser", { timeout: 10000 }),
    uploadButton.click(),
  ]);
  await chooser.setFiles(imagePath);
  await page.waitForTimeout(800);
  const confirm = await visibleExactText(page, "确定");
  if (!confirm) throw error("头图上传后没有找到裁剪确认按钮。");
  await confirm.click();
  await page.waitForFunction(
    () => document.body.innerText.includes("点击替换图片") && document.querySelector("[data-article-head-image] img"),
    undefined,
    { timeout: 30000 },
  );
}

async function addTopic(page, topicTag) {
  const addTopic = await visibleExactText(page, "点击添加话题");
  if (!addTopic) throw error("没有找到文章话题入口。");
  await addTopic.click();
  const search = await firstVisible(page, ["input[placeholder*='搜索或输入']"]);
  if (!search) throw error("没有找到话题搜索框。");
  await search.fill(topicTag);
  await page.waitForTimeout(900);
  const option = await visibleExactText(page, `#${topicTag}`);
  if (!option) throw error(`没有找到话题 #${topicTag}。`);
  await option.click();
  const confirm = await firstVisible(page, ["button:has-text('确认添加')"]);
  if (!confirm) throw error("没有找到话题确认按钮。");
  await confirm.click();
}

async function chooseMusic(page) {
  const chooseMusic = await visibleExactText(page, "选择音乐");
  if (!chooseMusic) throw error("没有找到配乐入口。");
  await chooseMusic.click();
  await page.waitForFunction(
    () => [...document.querySelectorAll("button")].some((button) => button.innerText.trim() === "使用"),
    undefined,
    { timeout: 30000 },
  );
  const styledButtons = page.locator("button.apply-btn-LUPP0D");
  const useButtons = (await styledButtons.count()) ? styledButtons : page.locator("button").filter({ hasText: /^使用$/ });
  const count = await useButtons.count();
  if (!count) throw error("推荐配乐列表为空。");
  await useButtons.nth(Math.floor(Math.random() * Math.min(5, count))).evaluate((button) => button.click());
}

export async function publishArticle(options) {
  if (loginContext) throw error("请先关闭登录浏览器，再开始发布。");
  if (publishContext) throw error("已有发布任务正在进行，请等待完成。");
  const article = validateArticle(options);
  options.onProgress("正在上传图片...");
  const imageUrl = await uploadImage(article.imagePath, options.s3Config);
  const importFile = await writeImportFile({ ...article, imageUrl, tempDir: options.tempDir || process.env.TEMP || "." });
  try {
    publishContext = await launchContext(options.profileDir);
    const page = await pageFor(publishContext);
    options.onProgress("正在打开抖音创作者平台...");
    await page.goto(creatorUrl(), { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1600);

    const articleTab = await visibleExactText(page, "发布文章");
    if (!articleTab) throw error(`没有找到“发布文章”入口，当前页面: ${await pageText(page)}`);
    await articleTab.click();
    await page.waitForTimeout(1600);
    const importButton = await visibleExactText(page, "一键导入");
    if (!importButton) throw error("没有找到“一键导入”按钮，请确认已登录抖音创作者平台。");
    await importButton.click();
    const markdownInput = await firstVisible(page, ["input[type=file][accept*='.md']"]);
    if (!markdownInput) throw error("没有找到 Markdown 导入控件。");
    await markdownInput.setInputFiles(importFile.path);
    await page.waitForURL(/\/content\/post\/article/, { timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(2600);

    const titleInput = await firstVisible(page, ["input[placeholder*='文章标题']", "input[placeholder*='标题']"]);
    const summaryInput = await firstVisible(page, ["input[placeholder*='摘要']", "textarea[placeholder*='摘要']"]);
    if (!titleInput || !summaryInput) throw error("文章导入后没有找到标题或摘要输入框。");
    await titleInput.fill(article.title);
    await summaryInput.fill(article.summary);
    const editor = await firstVisible(page, ["[contenteditable='true']", ".tiptap.ProseMirror"]);
    if (!editor || !(await editor.innerText().catch(() => "")).trim()) throw error("Markdown 导入后正文为空。");

    options.onProgress("正在设置文章头图、话题和配乐...");
    await uploadHeadImage(page, article.imagePath);
    await addTopic(page, article.topicTag);
    await chooseMusic(page);
    const publishButton = await visibleExactText(page, "发布");
    if (!publishButton || await publishButton.isDisabled().catch(() => false)) throw error("文章发布按钮当前不可用，请检查页面必填项。");
    await publishButton.click();
    await page.waitForTimeout(3500);
    options.onProgress("已点击发布，请在抖音浏览器窗口确认结果。");
    return { imageUrl };
  } finally {
    await publishContext?.close().catch(() => {});
    publishContext = undefined;
  }
}

export async function closePublisher() {
  await Promise.all([loginContext?.close(), publishContext?.close()].filter(Boolean));
  loginContext = undefined;
  publishContext = undefined;
}
