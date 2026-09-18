type Bucket = {
  timestamps: number[];
  last: number;
};

const buckets = new Map<string, Bucket>();

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function acquireRateLimit(opts: {
  provider: string;
  requestsPerSecond: number;
  requestsPerMinute: number;
}): Promise<void> {
  const key = opts.provider;
  const rps = Math.max(1, opts.requestsPerSecond);
  const rpm = Math.max(1, opts.requestsPerMinute);
  for (let i = 0; i < 40; i += 1) {
    const now = Date.now();
    const bucket = buckets.get(key) ?? { timestamps: [], last: 0 };
    bucket.timestamps = bucket.timestamps.filter((t) => now - t < 60_000);
    const sinceLast = now - bucket.last;
    const minGap = Math.ceil(1000 / rps);
    if (bucket.timestamps.length >= rpm || sinceLast < minGap) {
      const wait = Math.max(minGap - sinceLast, 250);
      await sleep(wait);
      continue;
    }
    bucket.timestamps.push(now);
    bucket.last = now;
    buckets.set(key, bucket);
    return;
  }
}

export async function withBackoff<T>(
  retries: number,
  fn: () => Promise<T>,
  isRetryable: (err: unknown) => boolean,
): Promise<T> {
  let last: unknown;
  const max = Math.max(0, retries);
  for (let attempt = 0; attempt <= max; attempt += 1) {
    try {
      return await fn();
    } catch (err) {
      last = err;
      if (attempt === max || !isRetryable(err)) throw err;
      const delay = Math.min(16_000, 500 * 2 ** attempt);
      await sleep(delay);
    }
  }
  throw last;
}
