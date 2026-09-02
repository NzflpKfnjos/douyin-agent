import { spawnSync } from "node:child_process";
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

process.exit(result.status ?? 1);
