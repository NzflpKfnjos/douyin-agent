import { app, BrowserWindow, dialog, ipcMain } from "electron";
import { existsSync } from "node:fs";
import { join } from "node:path";
import {
  beginDouyinLogin,
  closeDouyinLogin,
  closePublisher,
  publishArticle,
} from "./publisher.mjs";
import { DEFAULT_S3_CONFIG } from "./default-config.mjs";

const DEFAULT_CONFIG = DEFAULT_S3_CONFIG;
let mainWindow;

function localDataDir() {
  return join(process.env.LOCALAPPDATA || app.getPath("userData"), "DouyinArticlePublisher");
}

function browserProfilePath() {
  return join(localDataDir(), "browser");
}

function isS3Configured() {
  const required = ["S3_BUCKET", "S3_ENDPOINT", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY", "S3_PUBLIC_BASE_URL"];
  return required.every((name) => {
    const value = String(DEFAULT_CONFIG[name] || "");
    return value && !value.toLowerCase().includes("replace-with");
  });
}

function sendProgress(message) {
  mainWindow?.webContents.send("publish-progress", message);
}

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1000,
    height: 790,
    minWidth: 840,
    minHeight: 680,
    backgroundColor: "#f6f7f8",
    webPreferences: {
      preload: join(import.meta.dirname, "preload.mjs"),
      contextIsolation: true,
      nodeIntegration: false,
      // The preload is an ES module. Electron requires an unsandboxed preload
      // for ESM; context isolation and disabled Node integration remain enabled.
      sandbox: false,
    },
  });
  await mainWindow.loadFile(join(import.meta.dirname, "index.html"));
}

app.whenReady().then(async () => {
  ipcMain.handle("publisher:state", async () => {
    return {
      s3Configured: isS3Configured(),
      profileDirectory: browserProfilePath(),
      profileExists: existsSync(browserProfilePath()),
    };
  });

  ipcMain.handle("publisher:choose-image", async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: "选择文章头图",
      properties: ["openFile"],
      filters: [{ name: "图片", extensions: ["jpg", "jpeg", "png", "webp", "gif"] }],
    });
    return result.canceled ? "" : result.filePaths[0];
  });

  ipcMain.handle("publisher:login", async () => {
    await beginDouyinLogin({ profileDir: browserProfilePath(), onProgress: sendProgress });
    return "浏览器已打开，请完成抖音登录后回到本窗口。";
  });

  ipcMain.handle("publisher:finish-login", async () => {
    await closeDouyinLogin();
    return "登录浏览器已关闭。登录状态已保存到当前 Windows 用户目录。";
  });

  ipcMain.handle("publisher:publish", async (_event, article) => {
    return publishArticle({
      ...article,
      s3Config: DEFAULT_CONFIG,
      profileDir: browserProfilePath(),
      tempDir: app.getPath("temp"),
      onProgress: sendProgress,
    });
  });

  // Register IPC handlers before loading the renderer so its initial state
  // request cannot race application startup.
  await createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("before-quit", () => {
  closePublisher().catch(() => {});
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
