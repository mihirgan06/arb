type RetryConfig = {
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
};

const DEFAULTS: RetryConfig = {
  maxAttempts: 4,
  baseDelayMs: 250,
  maxDelayMs: 5_000,
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableStatus(status: number) {
  return status === 429 || status === 502 || status === 503 || status === 504;
}

function parseRetryAfterMs(value: string | null) {
  if (!value) return null;
  const seconds = Number.parseInt(value, 10);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
  return null;
}

function isRetryableFetchError(err: unknown) {
  if (!err || typeof err !== "object") return false;

  const anyErr = err as {
    name?: unknown;
    message?: unknown;
    cause?: { code?: unknown; name?: unknown } | null;
  };

  if (anyErr.name === "AbortError") return false;

  const causeCode = anyErr.cause && typeof anyErr.cause === "object" ? anyErr.cause.code : undefined;
  const causeName = anyErr.cause && typeof anyErr.cause === "object" ? anyErr.cause.name : undefined;
  const message = typeof anyErr.message === "string" ? anyErr.message : "";

  return (
    causeCode === "UND_ERR_CONNECT_TIMEOUT" ||
    causeCode === "UND_ERR_HEADERS_TIMEOUT" ||
    causeCode === "UND_ERR_SOCKET" ||
    causeCode === "ECONNRESET" ||
    causeCode === "ETIMEDOUT" ||
    causeCode === "EAI_AGAIN" ||
    causeCode === "ENOTFOUND" ||
    causeName === "ConnectTimeoutError" ||
    message.includes("fetch failed")
  );
}

export async function fetchWithRetry(input: RequestInfo | URL, init: RequestInit = {}) {
  const { maxAttempts, baseDelayMs, maxDelayMs } = DEFAULTS;

  let lastErr: unknown = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const res = await fetch(input, init);

      if (!isRetryableStatus(res.status) || attempt === maxAttempts) return res;

      try {
        res.body?.cancel();
      } catch {
        // ignore
      }

      const retryAfterMs = parseRetryAfterMs(res.headers.get("retry-after"));
      const backoffMs = Math.min(maxDelayMs, baseDelayMs * 2 ** (attempt - 1));
      const delayMs = retryAfterMs ? Math.max(retryAfterMs, backoffMs) : backoffMs;
      await sleep(delayMs);
    } catch (err) {
      lastErr = err;
      if (!isRetryableFetchError(err) || attempt === maxAttempts) throw err;
      const delayMs = Math.min(maxDelayMs, baseDelayMs * 2 ** (attempt - 1));
      await sleep(delayMs);
    }
  }

  throw lastErr ?? new Error("fetchWithRetry exhausted");
}
