// Simple in-memory limits for a public server, so nobody can run up the
// Anthropic bill: a cap per client per hour and a cap for the whole server per day.
// Counts reset when the server restarts, which is fine for a single small instance.

export class FixedWindowLimiter {
  private readonly counts = new Map<string, { windowStart: number; count: number }>();
  private readonly limit: number;
  private readonly windowMs: number;
  private readonly now: () => number;

  constructor(limit: number, windowMs: number, now: () => number = Date.now) {
    this.limit = limit;
    this.windowMs = windowMs;
    this.now = now;
  }

  /** Count one request for `key`. Returns false when the key is over its limit. */
  take(key: string): boolean {
    const t = this.now();
    const entry = this.counts.get(key);
    if (!entry || t - entry.windowStart >= this.windowMs) {
      this.counts.set(key, { windowStart: t, count: 1 });
      this.prune(t);
      return true;
    }
    if (entry.count >= this.limit) return false;
    entry.count++;
    return true;
  }

  private prune(t: number) {
    if (this.counts.size < 10_000) return;
    for (const [k, v] of this.counts) {
      if (t - v.windowStart >= this.windowMs) this.counts.delete(k);
    }
  }
}

export interface Limits {
  /** Requests to /v1/scan or /v1/case per client per hour. */
  perClientPerHour: number;
  /** Requests to /v1/scan or /v1/case across all clients per day. */
  perDay: number;
}

export function limitsFromEnv(env: NodeJS.ProcessEnv = process.env): Limits {
  const num = (v: string | undefined, fallback: number) => {
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? n : fallback;
  };
  return {
    perClientPerHour: num(env.ALIBI_LIMIT_PER_CLIENT_PER_HOUR, 60),
    perDay: num(env.ALIBI_LIMIT_PER_DAY, 3000),
  };
}

/** The client's address. Behind Render's proxy the first X-Forwarded-For entry is the client. */
export function clientKey(headers: Record<string, string | string[] | undefined>, remote?: string): string {
  const fwd = headers["x-forwarded-for"];
  const first = (Array.isArray(fwd) ? fwd[0] : fwd)?.split(",")[0]?.trim();
  return first || remote || "unknown";
}
