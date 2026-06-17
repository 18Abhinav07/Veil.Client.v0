type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

interface FetchJsonWithRetryOptions {
  serviceName: string;
  tries: number;
  delayMs: number;
  isRetryableStatus: (status: number, body: string) => boolean;
  retryFetchErrors?: boolean;
  fetcher?: FetchLike;
  sleep?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function formatFetchError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  const cause =
    error instanceof Error && "cause" in error && error.cause
      ? `: ${String(error.cause)}`
      : "";
  return `${message}${cause}`;
}

function attemptLabel(attempt: number) {
  return `${attempt} ${attempt === 1 ? "attempt" : "attempts"}`;
}

export async function fetchJsonWithRetry<T>(
  url: string,
  init: RequestInit,
  options: FetchJsonWithRetryOptions,
): Promise<T> {
  const runFetch = options.fetcher ?? fetch;
  const sleep = options.sleep ?? defaultSleep;
  const retryFetchErrors = options.retryFetchErrors ?? true;
  let lastText = "";
  let lastFetchError = "";

  for (let attempt = 1; attempt <= options.tries; attempt += 1) {
    let response: Response;
    try {
      response = await runFetch(url, init);
    } catch (error) {
      lastFetchError = formatFetchError(error);
      if (retryFetchErrors && attempt < options.tries) {
        await sleep(options.delayMs);
        continue;
      }
      throw new Error(
        `${options.serviceName} fetch failed after ${attemptLabel(attempt)}: ${lastFetchError}`,
      );
    }

    if (response.ok) return (await response.json()) as T;

    lastText = await response.text();
    const transient = options.isRetryableStatus(response.status, lastText);
    if (transient && attempt < options.tries) {
      await sleep(options.delayMs);
      continue;
    }
    throw new Error(
      `${options.serviceName} failed: ${response.status} ${lastText.slice(0, 300)}`,
    );
  }

  const reason = lastFetchError || lastText || "unknown upstream failure";
  throw new Error(`${options.serviceName} exhausted retries: ${reason.slice(0, 300)}`);
}
