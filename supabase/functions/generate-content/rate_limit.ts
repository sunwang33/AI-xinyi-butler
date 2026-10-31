/**
 * 基本限频（tasks.md T30：本期匿名访问 + 基本限频）。
 *
 * 边缘实例内存内的滑动窗口：按来源 IP 限流。注意 isolate 可能多实例且冷启动，
 * 这是「基本」限频而非强一致配额；阶段 12 引入登录后再升级为按用户配额。
 */
const WINDOW_MS = 60_000;
/** 每 IP 每分钟最多请求数 */
const MAX_PER_WINDOW = 24;

const hits = new Map<string, number[]>();

/** 是否放行；false 表示已超限 */
export function allow(ip: string, nowMs: number = Date.now()): boolean {
  const recent = (hits.get(ip) ?? []).filter((t) => nowMs - t < WINDOW_MS);
  if (recent.length >= MAX_PER_WINDOW) {
    hits.set(ip, recent);
    return false;
  }
  recent.push(nowMs);
  hits.set(ip, recent);
  return true;
}

/** 从请求头取来源 IP（Supabase 网关写入 x-forwarded-for，第一段为直连来源） */
export function clientIp(req: Request): string {
  const xff = req.headers.get('x-forwarded-for');
  if (xff) {
    const first = xff.split(',')[0]?.trim();
    if (first) return first;
  }
  return 'unknown';
}
