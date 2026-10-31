/**
 * 生成编排单测（T31/T33/T34/T37）：成功落快照、失败计数、祝福 3 次兜底、
 * 礼物不兜底、已有祝福时不回退兜底、在途去重。
 */
/* eslint-disable @typescript-eslint/no-require-imports */
import type { DataRepository } from '../../data/repository';
import type { OccasionKey } from '../../data/entities';
import { FAIL_FALLBACK_THRESHOLD, generateContent } from './generator';
import { ContentError } from './types';
import { fetchBlessings, fetchGifts } from './api';

declare const describe: (name: string, fn: () => void) => void;
declare const it: (name: string, fn: () => void) => void;
declare const expect: any;
declare const beforeEach: (fn: () => void) => void;
declare const jest: any;

// 工厂在 import 初始化前执行，故在工厂内懒 require 辅助模块（同 scheduler.test 约定）
jest.mock('./api', () => require('./contentTestMocks').mockCreateContentApi());

const mockedFetchBlessings = fetchBlessings as any;
const mockedFetchGifts = fetchGifts as any;

const key: OccasionKey = {
  occasionType: 'birthday',
  personId: 'p1',
  anniversaryId: null,
  festivalCode: null,
  year: 2026,
};
const context = {
  occasion: { type: 'birthday' as const },
  person: { relation: '家人' as const, traits: [], salutation: null, signature: null },
};

function makeRepo(initialSnapshot: any = null) {
  // 模拟 SQLite：upsert 后 getSnapshot 读到最新行，fail_count 才能跨调用累积
  let current: any = initialSnapshot;
  const getSnapshot = jest.fn(async () => current);
  const upsertSnapshot = jest.fn().mockImplementation(async (input: any) => {
    current = {
      id: 's1',
      personId: 'p1',
      occasionType: 'birthday',
      anniversaryId: null,
      festivalCode: null,
      year: 2026,
      blessings: input.blessings === undefined ? current?.blessings ?? null : input.blessings,
      gifts: input.gifts === undefined ? current?.gifts ?? null : input.gifts,
      status: input.status ?? current?.status ?? 'pending',
      failCount: input.failCount ?? current?.failCount ?? 0,
      generatedAt:
        input.generatedAt === undefined ? current?.generatedAt ?? null : input.generatedAt,
      userId: null,
      createdAt: '',
      updatedAt: '',
      deleted: false,
    };
    return current;
  });
  return { getSnapshot, upsertSnapshot } as unknown as DataRepository & {
    getSnapshot: any;
    upsertSnapshot: any;
  };
}

const networkError = () => new ContentError('network');

beforeEach(() => {
  jest.clearAllMocks();
});

describe('generateContent · 祝福', () => {
  it('成功：写祝福、success、fail_count 归零', async () => {
    mockedFetchBlessings.mockResolvedValue(['甲', '乙', '丙']);
    const repo = makeRepo();
    const result = await generateContent(repo, 'blessing', key, context, { count: 3 });
    expect(result.fallbackUsed).toBe(false);
    expect(result.snapshot.blessings).toEqual(['甲', '乙', '丙']);
    expect(repo.upsertSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'success', failCount: 0 }),
    );
  });

  it('连续失败达到 3 次：写入通用兜底、success，不再抛出', async () => {
    mockedFetchBlessings.mockRejectedValue(networkError());
    const repo = makeRepo();

    await expect(generateContent(repo, 'blessing', key, context, { count: 3 })).rejects.toBeTruthy();
    expect(repo.upsertSnapshot).toHaveBeenLastCalledWith(
      expect.objectContaining({ status: 'failed', failCount: 1 }),
    );

    await expect(generateContent(repo, 'blessing', key, context, { count: 3 })).rejects.toBeTruthy();
    expect(repo.upsertSnapshot).toHaveBeenLastCalledWith(
      expect.objectContaining({ status: 'failed', failCount: 2 }),
    );

    const result = await generateContent(repo, 'blessing', key, context, { count: 3 });
    expect(result.fallbackUsed).toBe(true);
    expect(result.snapshot.blessings).toHaveLength(3);
    expect(repo.upsertSnapshot).toHaveBeenLastCalledWith(
      expect.objectContaining({
        status: 'success',
        failCount: FAIL_FALLBACK_THRESHOLD,
      }),
    );
  });

  it('已有祝福时重新生成失败：即使计数到 3 也不用兜底覆盖', async () => {
    mockedFetchBlessings.mockRejectedValue(networkError());
    const repo = makeRepo({
      id: 's1',
      blessings: ['旧祝福'],
      gifts: null,
      status: 'success',
      failCount: 2,
    });
    await expect(generateContent(repo, 'blessing', key, context, { count: 3 })).rejects.toBeTruthy();
    expect(repo.upsertSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'failed', failCount: 3 }),
    );
    // 没有以 success + 兜底内容写库
    const calls = repo.upsertSnapshot.mock.calls as [Record<string, unknown>][];
    expect(calls.every(([input]) => input.blessings === undefined)).toBe(true);
  });

  it('同一键并发调用复用在途 Promise，不重复请求', async () => {
    mockedFetchBlessings.mockImplementation(async () => {
      await Promise.resolve();
      return ['甲'];
    });
    const repo = makeRepo();
    await Promise.all([
      generateContent(repo, 'blessing', key, context, { count: 1 }),
      generateContent(repo, 'blessing', key, context, { count: 1 }),
    ]);
    expect(mockedFetchBlessings).toHaveBeenCalledTimes(1);
  });
});

describe('generateContent · 礼物', () => {
  it('成功：写 gifts、success', async () => {
    const gifts = Array.from({ length: 6 }, (_, i) => ({
      name: `礼物${i}`,
      reason: '适合 TA',
      search_term: '测试 搜索词',
    }));
    mockedFetchGifts.mockResolvedValue(gifts);
    const repo = makeRepo();
    const result = await generateContent(repo, 'gift', key, context);
    expect(result.snapshot.gifts).toHaveLength(6);
  });

  it('礼物连续失败 3 次也不兜底：始终抛出、从不写 gifts', async () => {
    mockedFetchGifts.mockRejectedValue(networkError());
    const repo = makeRepo();
    for (const expectedCount of [1, 2, 3]) {
      await expect(generateContent(repo, 'gift', key, context)).rejects.toBeTruthy();
      expect(repo.upsertSnapshot).toHaveBeenLastCalledWith(
        expect.objectContaining({ status: 'failed', failCount: expectedCount }),
      );
      expect(
        (repo.upsertSnapshot.mock.calls as [Record<string, unknown>][]).every(
          ([input]) => input.gifts === undefined,
        ),
      ).toBe(true);
    }
  });
});
