/** Bounded retries for flaky network / slow SPA loads. */
export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function withRetry(label, fn, options = {}) {
  const attempts = Math.max(1, Number(options.attempts ?? process.env.DOUYIN_RETRY_ATTEMPTS ?? 3));
  const delayMs = Math.max(0, Number(options.delayMs ?? process.env.DOUYIN_RETRY_DELAY_MS ?? 1500));
  const backoff = Number(options.backoff ?? 1.6);
  const shouldRetry = options.shouldRetry ?? (() => true);
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await fn(attempt);
    } catch (error) {
      lastError = error;
      const message = error instanceof Error ? error.message : String(error);
      if (attempt >= attempts || !shouldRetry(error)) {
        throw error instanceof Error ? error : new Error(message);
      }
      const wait = Math.round(delayMs * backoff ** (attempt - 1));
      console.warn(`[retry] ${label} 第 ${attempt}/${attempts} 次失败: ${message}；${wait}ms 后重试`);
      await sleep(wait);
    }
  }
  throw lastError;
}
