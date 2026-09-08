import { config } from "dotenv";
import { extname, resolve } from "node:path";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { withRetry } from "../scripts/retry.mjs";

const projectRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
config({ path: resolve(projectRoot, ".env") });

function env(name, fallback = "") {
  return process.env[name] ?? fallback;
}

function accessKeyId() {
  return env("S3_ACCESS_KEY_ID") || env("S3_ACCESS_KEY");
}

function secretAccessKey() {
  return env("S3_SECRET_ACCESS_KEY") || env("S3_SECRET_KEY");
}

function publicBaseUrl() {
  return env("S3_PUBLIC_BASE_URL") || env("S3_PUBLIC_BASE");
}

function contentType(filePath) {
  const extension = extname(filePath).toLowerCase();
  return ({
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
    ".gif": "image/gif",
  })[extension] ?? "application/octet-stream";
}

function objectUrl(endpoint, bucket, key) {
  const publicBase = publicBaseUrl().replace(/\/$/, "");
  if (publicBase) return `${publicBase}/${key.split("/").map(encodeURIComponent).join("/")}`;

  const cleanEndpoint = endpoint.replace(/\/$/, "");
  if (env("S3_FORCE_PATH_STYLE", "false").toLowerCase() === "true") {
    return `${cleanEndpoint}/${encodeURIComponent(bucket)}/${key.split("/").map(encodeURIComponent).join("/")}`;
  }
  const parsed = new URL(cleanEndpoint);
  return `${parsed.protocol}//${bucket}.${parsed.host}/${key.split("/").map(encodeURIComponent).join("/")}`;
}

export async function uploadImage(filePath, { key } = {}) {
  const missing = [
    !env("S3_BUCKET") && "S3_BUCKET",
    !env("S3_ENDPOINT") && "S3_ENDPOINT",
    !accessKeyId() && "S3_ACCESS_KEY_ID (或 S3_ACCESS_KEY)",
    !secretAccessKey() && "S3_SECRET_ACCESS_KEY (或 S3_SECRET_KEY)",
  ].filter(Boolean);
  if (missing.length) {
    throw new Error(`缺少 S3 配置: ${missing.join(", ")}. 请复制 .env.example 并填写。`);
  }

  const absolutePath = resolve(filePath);
  const body = await readFile(absolutePath);
  const objectKey = key || `${env("S3_KEY_PREFIX", "douyin").replace(/^\/+|\/+$/g, "")}/${Date.now()}-${randomUUID()}${extname(absolutePath).toLowerCase()}`;
  const client = new S3Client({
    region: env("S3_REGION", "auto"),
    endpoint: env("S3_ENDPOINT"),
    forcePathStyle: env("S3_FORCE_PATH_STYLE", "false").toLowerCase() === "true",
    credentials: {
      accessKeyId: accessKeyId(),
      secretAccessKey: secretAccessKey(),
    },
  });

  await withRetry("S3 上传图片", async () => {
    await client.send(new PutObjectCommand({
      Bucket: env("S3_BUCKET"),
      Key: objectKey,
      Body: body,
      ContentType: contentType(absolutePath),
      CacheControl: "public, max-age=31536000, immutable",
    }));
  });

  return objectUrl(env("S3_ENDPOINT"), env("S3_BUCKET"), objectKey);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const filePath = process.argv[2];
  if (!filePath) {
    console.error("用法: npm run upload -- /path/to/image.png");
    process.exit(2);
  }
  const candidate = filePath.startsWith("/")
    ? filePath
    : resolve(projectRoot, filePath);
  uploadImage(candidate)
    .then((url) => console.log(url))
    .catch((error) => {
      console.error(error.message);
      process.exit(1);
    });
}
