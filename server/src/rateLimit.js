/**
 * 内存滑动窗口限频（T57：登录用户按 user.id、匿名按来源 IP 两把独立窗口）。
 *
 * 单进程内强一致；PM2 必须只起 1 个实例（见 ecosystem 配置）。
 * 多实例/多机若以后需要，升级为 Redis 有序集合，接口保持 allow(key) 不变。
 */
export function createLimiter({ windowMs, max }) {
  const hits = new Map();

  return {
    /** 是否放行；false 表示该键已超限（本次不计入） */
    allow(key, nowMs = Date.now()) {
      const recent = (hits.get(key) ?? []).filter((t) => nowMs - t < windowMs);
      if (recent.length >= max) {
        hits.set(key, recent);
        return false;
      }
      recent.push(nowMs);
      hits.set(key, recent);
      return true;
    },
  };
}
