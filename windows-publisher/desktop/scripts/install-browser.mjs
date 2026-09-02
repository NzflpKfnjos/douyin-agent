import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const projectDir = dirname(scriptDir);
const cliPath = join(projectDir, "node_modules", "playwright", "cli.js");
const result = spawnSync(process.execPath, [cliPath, "install", "chromium"], {
  cwd: projectDir,
  env: { ...process.env, PLAYWRIGHT_BROWSERS_PATH: "0" },
  stdio: "inherit",
});

if ((result.status ?? 1) !== 0) process.exit(result.status ?? 1);

const browserDir = join(projectDir, "node_modules", "playwright-core", ".local-browsers");
if (!existsSync(browserDir)) {
  console.error(`Playwright Chromium 下载完成但目录不存在: ${browserDir}`);
  process.exit(1);
}
console.log(`Playwright Chromium 已准备: ${browserDir}`);
