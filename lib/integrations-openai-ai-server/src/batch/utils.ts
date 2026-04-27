/**
 * Batch Processing Utilities
 *
 * Generic batch processing with built-in rate limiting and automatic retries.
 * Use for any task that requires processing multiple items through an LLM
 * or external API.
 *
 * @example
 * ```typescript
 * import { batchProcess } from "@workspace/integrations-openai-ai-server/batch";
 * import { openai } from "@workspace/integrations-openai-ai-server";
 *
 * const results = await batchProcess(
 *   artworks,
 *   async (artwork) => {
 *     const response = await openai.chat.completions.create({
 *       model: "gpt-4o",
 *       messages: [{ role: "user", content: `Categorize: ${artwork.name}` }],
 *       response_format: { type: "json_object" },
 *     });
 *     return JSON.parse(response.choices[0]?.message?.content || "{}");
 *   },
 *   { concurrency: 2, retries: 5 },
 * );
 * ```
 */
import pLimit from "p-limit";
import pRetry, { AbortError } from "p-retry";

/* -------------------------------------------------------------------------- */
/*  Types                                                                      */
/* -------------------------------------------------------------------------- */

export interface BatchOptions {
  /** Maximum number of concurrent operations (default: 2). */
  concurrency?: number;
  /** Maximum number of retry attempts per item (default: 7). */
  retries?: number;
  /** Minimum delay between retries in ms (default: 2000). */
  minTimeout?: number;
  /** Maximum delay between retries in ms (default: 128000). */
  maxTimeout?: number;
  /** Callback invoked after each item completes. */
  onProgress?: (completed: number, total: number, item: unknown) => void;
}

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Check if an error is a rate-limit error from the API.
 * Rate-limit errors should be retried; other errors should not.
 */
export function isRateLimitError(error: unknown): boolean {
  const errorMsg = error instanceof Error ? error.message : String(error);
  return (
    errorMsg.includes("429") ||
    errorMsg.includes("RATELIMIT_EXCEEDED") ||
    errorMsg.toLowerCase().includes("quota") ||
    errorMsg.toLowerCase().includes("rate limit")
  );
}

/* -------------------------------------------------------------------------- */
/*  Concurrent batch processing                                                */
/* -------------------------------------------------------------------------- */

/**
 * Process an array of items concurrently with rate limiting and retries.
 *
 * - Rate-limit errors are retried with exponential backoff.
 * - All other errors abort immediately (no retry).
 *
 * @returns An array of results in the same order as the input items.
 */
export async function batchProcess<T, R>(
  items: T[],
  processor: (item: T, index: number) => Promise<R>,
  options: BatchOptions = {},
): Promise<R[]> {
  const {
    concurrency = 2,
    retries = 7,
    minTimeout = 2000,
    maxTimeout = 128000,
    onProgress,
  } = options;

  const limit = pLimit(concurrency);
  let completed = 0;

  const promises = items.map((item, index) =>
    limit(() =>
      pRetry(
        async () => {
          try {
            const result = await processor(item, index);
            completed++;
            onProgress?.(completed, items.length, item);
            return result;
          } catch (error: unknown) {
            // Only retry rate-limit errors; abort on all others
            if (isRateLimitError(error)) {
              throw error;
            }
            throw new AbortError(
              error instanceof Error ? error : new Error(String(error)),
            );
          }
        },
        { retries, minTimeout, maxTimeout, factor: 2 },
      ),
    ),
  );

  return Promise.all(promises);
}

/* -------------------------------------------------------------------------- */
/*  Sequential batch processing with SSE progress                              */
/* -------------------------------------------------------------------------- */

/**
 * Process items sequentially, sending Server-Sent Events (SSE) for each step.
 *
 * Unlike `batchProcess`, this processes one item at a time (no concurrency)
 * and streams progress events to the client via the `sendEvent` callback.
 *
 * Events emitted:
 * - `{ type: "started", total }` — processing begins
 * - `{ type: "processing", index, item }` — item is being processed
 * - `{ type: "progress", index, result | error }` — item completed or failed
 * - `{ type: "complete", processed, errors }` — all items done
 */
export async function batchProcessWithSSE<T, R>(
  items: T[],
  processor: (item: T, index: number) => Promise<R>,
  sendEvent: (event: { type: string; [key: string]: unknown }) => void,
  options: Omit<BatchOptions, "concurrency" | "onProgress"> = {},
): Promise<R[]> {
  const { retries = 5, minTimeout = 1000, maxTimeout = 15000 } = options;

  sendEvent({ type: "started", total: items.length });

  const results: R[] = [];
  let errors = 0;

  for (let index = 0; index < items.length; index++) {
    const item = items[index];
    sendEvent({ type: "processing", index, item });

    try {
      const result = await pRetry(() => processor(item, index), {
        retries,
        minTimeout,
        maxTimeout,
        factor: 2,
        onFailedAttempt: (error) => {
          // Only retry rate-limit errors
          if (!isRateLimitError(error)) {
            throw new AbortError(
              error instanceof Error ? error : new Error(String(error)),
            );
          }
        },
      });
      results.push(result);
      sendEvent({ type: "progress", index, result });
    } catch (error) {
      errors++;
      results.push(undefined as R);
      sendEvent({
        type: "progress",
        index,
        error: error instanceof Error ? error.message : "Processing failed",
      });
    }
  }

  sendEvent({ type: "complete", processed: items.length, errors });
  return results;
}
