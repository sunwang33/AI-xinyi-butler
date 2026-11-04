/**
 * 调用方鉴权（T57）：两条通道，对应 tasks 要求的「JWT 校验 + 匿名限频通道」。
 *
 * 1. 已登录：Authorization: Bearer <Supabase JWT>。
 *    向 Supabase Auth 的 /auth/v1/user 校验（不做本地验签，省去 JWKS 轮换处理），
 *    通过后按 user.id 限频；结果做 60 秒正缓存，减少上海→首尔的校验往返。
 *    （JWT 无状态，用户退出后旧 token 在自然过期前仍能通过校验，与 Supabase 自身口径一致；
 *     缓存只缩短到 60 秒，且仅缓存成功结果。）
 * 2. 匿名：无 Authorization，必须带 x-api-key: <anon key>。
 *    anon key 本就是公开值，安全意义有限——它的作用是挡住完全不拿 App 的裸刷，
 *    真正的闸门是按来源 IP 的限频（与原 Edge Function 匿名口径一致）。
 */

/** JWT 校验结果正缓存毫秒数 */
const JWT_CACHE_MS = 60_000;
/** 调用 Supabase Auth 的超时 */
const AUTH_TIMEOUT_MS = 8_000;

export function createCallerResolver(config) {
  /** token → { userId, expireAt } */
  const jwtCache = new Map();

  /** 调 Supabase 校验 JWT，成功返回 user id */
  async function verifyJwt(token) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), AUTH_TIMEOUT_MS);
    try {
      const resp = await fetch(`${config.supabaseUrl}/auth/v1/user`, {
        headers: {
          apikey: config.supabaseAnonKey,
          Authorization: `Bearer ${token}`,
        },
        signal: controller.signal,
      });
      if (!resp.ok) return null;
      const data = await resp.json();
      return typeof data?.id === 'string' ? data.id : null;
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * 解析调用方。
   * @returns {ok:true, channel:'user'|'anon', rateKey:string} 或
   *          {ok:false, status:number, code:string}
   */
  return async function resolveCaller({ authorization, apiKey, ip }) {
    const bearer = /^Bearer\s+(.+)$/i.exec(authorization?.trim() ?? '');
    if (bearer) {
      const token = bearer[1].trim();
      const now = Date.now();
      const cached = jwtCache.get(token);
      let userId = cached && cached.expireAt > now ? cached.userId : null;
      if (!userId) {
        userId = await verifyJwt(token);
        if (!userId) {
          jwtCache.delete(token);
          return { ok: false, status: 401, code: 'invalid_token' };
        }
        jwtCache.set(token, { userId, expireAt: now + JWT_CACHE_MS });
      }
      return { ok: true, channel: 'user', rateKey: `u:${userId}` };
    }

    // 匿名通道：必须持有 anon key（公开共享密钥），再按 IP 限频
    if (apiKey && apiKey === config.supabaseAnonKey) {
      return { ok: true, channel: 'anon', rateKey: `ip:${ip}` };
    }
    return { ok: false, status: 401, code: 'unauthorized' };
  };
}
