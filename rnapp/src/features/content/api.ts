/**
 * Edge Function 调用封装（M6 T30 / M7 T36）。
 * 经 Supabase 网关调用 generate-content：API Key 只在服务端，App 内不持有。
 */
import { FunctionsError } from '@supabase/supabase-js';
import type { GiftSuggestion } from '../../data/entities';
import { supabase } from '../../lib/supabase';
import { ContentError, type ContentContext, type ContentErrorReason } from './types';

const FUNCTION_NAME = 'generate-content';

/** 与 supabase/functions/generate-content/types.ts 的入参契约保持一致 */
interface RequestBody {
  kind: 'blessing' | 'gift';
  count?: number;
  occasion: ContentContext['occasion'];
  person: ContentContext['person'];
}

async function invoke(body: RequestBody): Promise<unknown> {
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
