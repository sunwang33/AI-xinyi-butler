/**
 * Supabase / PostgREST 报错的中文翻译（T56 仓储写与同步编排共用）。
 * 鉴权类错误统一引导重新登录；网络类错误提示重试；其余保留原始信息便于排查。
 */
import type { PostgrestError } from '@supabase/supabase-js';

export function translateCloudError(
  error: PostgrestError | null | undefined,
  fallback: string,
): Error {
  const raw = error?.message ?? '';
  const code = error?.code ?? '';
  const haystack = `${raw} ${code}`;
  if (/PGRST116|0 rows|no rows/i.test(raw)) {
    return new Error('目标数据不存在或已被删除');
  }
  if (/network request failed|failed to fetch|NetworkError|timeout/i.test(raw)) {
    return new Error('网络连接异常，改动尚未保存到云端，请检查网络后重试');
  }
  if (/42501|row-level security|jwt|401|403/i.test(haystack)) {
    return new Error('登录状态已失效或无权限，请退出后重新登录');
  }
  if (/23505|duplicate key|unique constraint/i.test(haystack)) {
    return new Error('该记录已存在，请勿重复操作');
  }
  return new Error(raw || fallback);
}
