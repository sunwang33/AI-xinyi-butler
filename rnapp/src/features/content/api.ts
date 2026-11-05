/**
 * 内容生成调用封装（M6 T30 / M7 T36；M12 T57 增加上海主机网关通道）。
 * 默认经 Supabase Edge 调用 generate-content；T57 开关打开后走备案子域 Node 网关。
 * 两条通道响应/错误契约一致，DeepSeek API Key 都只在服务端，App 内不持有。
 */
import { FunctionsError } from '@supabase/supabase-js';
import type { GiftSuggestion } from '../../data/entities';
import { supabase } from '../../lib/supabase';
import { SUPABASE_ANON_KEY, SHANGHAI_GATEWAY_URL, USE_SHANGHAI_GATEWAY } from '../../lib/gateway';
import { ContentError, type ContentContext, type ContentErrorReason } from './types';

const FUNCTION_NAME = 'generate-content';

/**
 * 上海网关客户端兜底超时（T58 真机联调抓出，2026-11-05）。
 * 裸 fetch 在 RN/OkHttp 下 read 默认无超时，手机网络静默丢包时 Promise 永不 settle、
 * 页面永久转圈只能杀进程。取值依据：网关上游 25s 超时必回（成功或 502），
 * Nginx 兜底 60s，30s 让客户端在两者之间先醒，按 network 错误走「需要网络」重试路径。
 */
const RELAY_TIMEOUT_MS = 30_000;

/**
 * 登录态读取兜底超时（T58 真机联调抓出，2026-11-05）。
 * 数据通道切到备案反代前，supabase-js 直连被墙域名刷新 token 时，其内部锁/重试
 * 会让 getSession() 排队挂起，连带生成请求卡死。取不到登录态就降级匿名通道
 * （未登录本就可完整使用），绝不让鉴权依赖阻塞生成。
 */
const SESSION_TIMEOUT_MS = 5_000;

/** 带超时的登录态读取：失败、超时一律降级为匿名（返回 undefined） */
async function getAuthTokenWithFallback(): Promise<string | undefined> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('getSession_timeout')), SESSION_TIMEOUT_MS);
    });
    const { data } = await Promise.race([supabase.auth.getSession(), timeout]);
    return data.session?.access_token;
  } catch {
    // 网络被墙 / 锁等待 / 超时 / 会话异常：降级匿名，网关 x-api-key 通道仍完整可用
    return undefined;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** 与服务端入参契约（server/src/types.js、Edge types.ts）保持一致 */
interface RequestBody {
  kind: 'blessing' | 'gift';
  count?: number;
  occasion: ContentContext['occasion'];
  person: ContentContext['person'];
}

/** 通道 A（回退）：Supabase Edge Functions */
async function invokeEdge(body: RequestBody): Promise<unknown> {
  const result = await supabase.functions.invoke(FUNCTION_NAME, { body });
  if (result.error) {
    const status = (result.error as FunctionsError & { context?: { status?: number } }).context
      ?.status;
    let reason: ContentErrorReason;
    if (result.error.name === 'FunctionsFetchError') {
      // 设备无网络 / DNS / TLS 失败：页面显示「需要网络」
      reason = 'network';
    } else if (status === 429) {
      reason = 'ratelimit';
    } else {
      // 4xx（除 429）/5xx/502 均按服务失败处理，计入连续失败
      reason = 'service';
    }
    throw new ContentError(reason, result.error.message);
  }
  return result.data;
}

/** 通道 B（T57）：上海备案主机 Node 网关，登录带 JWT、匿名带 anon key */
async function invokeRelay(body: RequestBody): Promise<unknown> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    // 匿名通道标识（anon key 本就公开）；有登录态时服务端优先走 JWT 分支
    'x-api-key': SUPABASE_ANON_KEY,
  };
  // 带 5s 兜底：auth 域名被墙/锁挂起时降级匿名，不阻塞生成
  const token = await getAuthTokenWithFallback();
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  // 客户端超时兜底：网络静默丢包时主动 abort，避免请求无限挂起、UI 永久 loading
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), RELAY_TIMEOUT_MS);

  let resp: Response;
  try {
    resp = await fetch(SHANGHAI_GATEWAY_URL, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (err) {
    // 设备无网络 / DNS / TLS 失败 / 30s 超时 abort：与 Edge 通道口径一致，页面显示「需要网络」
    const detail = err instanceof Error ? err.message : 'network request failed';
    throw new ContentError('network', detail);
  } finally {
    clearTimeout(timer);
  }

  if (resp.ok) {
    return resp.json();
  }

  // 错误体契约：{ error: { code, message? } }（解析失败不影响原因分类）
  let code = '';
  try {
    const errBody = (await resp.json()) as { error?: { code?: string } };
    code = errBody.error?.code ?? '';
  } catch {
    // 非 JSON 错误页（如网关 502 默认页）：按状态码兜底
  }
  if (resp.status === 429 || code === 'rate_limited') {
    throw new ContentError('ratelimit', code || 'rate_limited');
  }
  // 401/400/502 等一律按服务失败处理，计入连续失败与祝福 3 次兜底
  throw new ContentError('service', code || `http_${resp.status}`);
}

function invoke(body: RequestBody): Promise<unknown> {
  return USE_SHANGHAI_GATEWAY ? invokeRelay(body) : invokeEdge(body);
}

/** 生成 N 条祝福（N 取生成时的 blessing_count，1–10） */
export async function fetchBlessings(
  context: ContentContext,
  count: number,
): Promise<string[]> {
  const data = await invoke({
    kind: 'blessing',
    count,
    occasion: context.occasion,
    person: context.person,
  });
  if (
    !data ||
    typeof data !== 'object' ||
    !Array.isArray((data as { blessings?: unknown }).blessings)
  ) {
    throw new ContentError('bad_response');
  }
  const list = (data as { blessings: unknown[] }).blessings;
  if (list.some((item) => typeof item !== 'string' || item.trim().length === 0)) {
    throw new ContentError('bad_response');
  }
  return list.map((item) => (item as string).trim());
}

/** 生成礼物建议（不少于五个） */
export async function fetchGifts(context: ContentContext): Promise<GiftSuggestion[]> {
  const data = await invoke({ kind: 'gift', occasion: context.occasion, person: context.person });
  if (!data || typeof data !== 'object' || !Array.isArray((data as { gifts?: unknown }).gifts)) {
    throw new ContentError('bad_response');
  }
  const list = (data as { gifts: unknown[] }).gifts;
  if (list.length < 5) {
    throw new ContentError('bad_response');
  }
  return list.map((item) => {
    const row = item as Record<string, unknown>;
    if (
      typeof row.name !== 'string' ||
      typeof row.reason !== 'string' ||
      typeof row.search_term !== 'string' ||
      !row.name.trim() ||
      !row.reason.trim() ||
      !row.search_term.trim()
    ) {
      throw new ContentError('bad_response');
    }
    return {
      name: (row.name as string).trim(),
      reason: (row.reason as string).trim(),
      search_term: (row.search_term as string).trim(),
    };
  });
}
