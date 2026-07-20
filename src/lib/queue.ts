/**
 * Serialized min-spacing rate queue. CONTRACT (cache-before-queue):
 * callers MUST consult their cache before scheduling — a hit never consumes a slot.
 * Buckets are per-instance best-effort on serverless; 429 backoff in each client is the net.
 */
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class RateQueue {
  private nextFreeAt = 0;
  private tail: Promise<unknown> = Promise.resolve();
  constructor(private opts: { minSpacingMs: number; jitterMs?: number }) {}

  schedule<T>(fn: () => Promise<T>): Promise<T> {
    const run = async (): Promise<T> => {
      const now = Date.now();
      const wait = Math.max(0, this.nextFreeAt - now);
      this.nextFreeAt = Math.max(now, this.nextFreeAt)
        + this.opts.minSpacingMs
        + Math.floor(Math.random() * (this.opts.jitterMs ?? 0));
      if (wait > 0) await sleep(wait);
      return fn();
    };
    const p = this.tail.then(run, run);
    this.tail = p.catch(() => {});
    return p;
  }
}

// R1 rates — module-scope singletons, one per API.
// Ticketmaster's Apigee spike-arrest is 5/s with maxBurst=1 — a hard ~200ms
// floor and NO burst tolerance. 250ms left no margin once network jitter (and
// overlapping city builds sharing this best-effort per-instance queue) are in
// play, so we space more conservatively and jitter to de-sync concurrent builds.
export const tmQueue = new RateQueue({ minSpacingMs: 350, jitterMs: 150 }); // ~2.3 req/s, floor 350ms
export const itunesQueue = new RateQueue({ minSpacingMs: 3500 });     // ~17/min
export const mbQueue = new RateQueue({ minSpacingMs: 1000, jitterMs: 300 }); // 1/s + jitter
