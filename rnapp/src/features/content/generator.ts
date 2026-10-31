/**
 * 内容生成编排（M6 T31/T33/T34，M7 T37）：
 * 按「人 × 日子 × 年份」调用云函数并写入 content_snapshots，当年固定；
 * 祝福连续失败 3 次写入通用兜底；礼物不兜底（B 组门禁）。
 *
 * 规则：
 * - 成功：写内容、status='success'、fail_count 归零、generated_at=now；
 * - 失败：status='failed'、fail_count +1（祝福/礼物共用本行计数；
 *   仅当 blessings 为空且达到 3 次时写祝福兜底，礼物永不兜底）；
 * - 重新生成 = 再调一次本函数，结果直接替换对应字段。
 */
import type { ContentSnapshot, OccasionKey } from '../../data/entities';
import type { DataRepository } from '../../data/repository';
import { fetchBlessings, fetchGifts } from './api';
import { pickFallbackBlessings } from './fallback';
import type { ContentContext, ContentError } from './types';

/** 连续失败达到此次数后，祝福写入通用兜底（spec 全局规则 3） */
export const FAIL_FALLBACK_THRESHOLD = 3;

export interface GenerateOptions {
  /** 祝福条数（取生成时设置的 blessing_count）；礼物忽略 */
  count?: number;
  /** 兜底文案需要的节日展示名 */
  festivalName?: string | null;
}

export interface GenerateResult {
  snapshot: ContentSnapshot;
  /** true：本次失败已达 3 次，返回的是通用兜底祝福 */
  fallbackUsed: boolean;
}

/** 同一快照行同一类内容的在途请求去重键，避免详情页 effect 重复触发 */
const inFlight = new Map<string, Promise<GenerateResult>>();

function flightKey(key: OccasionKey, kind: 'blessing' | 'gift'): string {
  return [
    kind,
    key.personId ?? '',
    key.occasionType,
    key.anniversaryId ?? '',
    key.festivalCode ?? '',
    key.year,
  ].join('|');
}

async function runGenerate(
  repo: DataRepository,
  kind: 'blessing' | 'gift',
  key: OccasionKey,
  context: ContentContext,
  options: GenerateOptions,
): Promise<GenerateResult> {
  const existing = await repo.getSnapshot(key);
  try {
    if (kind === 'blessing') {
      const count = options.count ?? 3;
      const blessings = await fetchBlessings(context, count);
      const snapshot = await repo.upsertSnapshot({
        ...key,
        blessings,
        status: 'success',
        failCount: 0,
        generatedAt: new Date().toISOString(),
      });
      return { snapshot, fallbackUsed: false };
    }

    const gifts = await fetchGifts(context);
    const snapshot = await repo.upsertSnapshot({
      ...key,
      gifts,
      status: 'success',
      failCount: 0,
      generatedAt: new Date().toISOString(),
    });
    return { snapshot, fallbackUsed: false };
  } catch (err) {
    const prevFailCount = existing?.failCount ?? 0;
    const failCount = prevFailCount + 1;

    // 祝福兜底：此前没有任何祝福、连续失败达到阈值
    if (kind === 'blessing' && !existing?.blessings && failCount >= FAIL_FALLBACK_THRESHOLD) {
      const fallback = pickFallbackBlessings(
        key.occasionType,
        options.count ?? 3,
        options.festivalName,
      );
      const snapshot = await repo.upsertSnapshot({
        ...key,
        blessings: fallback,
        status: 'success',
        failCount,
        generatedAt: new Date().toISOString(),
      });
      return { snapshot, fallbackUsed: true };
    }

    await repo.upsertSnapshot({ ...key, status: 'failed', failCount });
    throw err as ContentError;
  }
}

/**
 * 生成（或重新生成）一类心意内容。
 * 同一键的重复调用复用在途 Promise；调用方负责 T28 告知同意门禁。
 */
export function generateContent(
  repo: DataRepository,
  kind: 'blessing' | 'gift',
  key: OccasionKey,
  context: ContentContext,
  options: GenerateOptions = {},
): Promise<GenerateResult> {
  const dedupeKey = flightKey(key, kind);
  const pending = inFlight.get(dedupeKey);
  if (pending) return pending;

  const promise = runGenerate(repo, kind, key, context, options).finally(() => {
    inFlight.delete(dedupeKey);
  });
  inFlight.set(dedupeKey, promise);
  return promise;
}
