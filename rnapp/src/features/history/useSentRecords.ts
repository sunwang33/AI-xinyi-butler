/**
 * 「今年已送出 / 往年记录」状态（M11 T50–T52）：页面级 hook，串起仓储读取与标记写入。
 *
 * - 进入 / 聚焦屏幕时读取**同一人同一日子的全部年份**记录（T52 往年倒序直接可用，
 *   仓储已按 year DESC, marked_at DESC 排序）；
 * - 业务唯一键＝人 × 日子 × 年 × kind（G-A4 拍板），mark 走仓储 upsert：
 *   调用方先用 sentDecision.decideSentAction 判定 add / replace / unmark，
 *   replace 需用户确认后再调用本 mark；
 * - 通用版节日（personId 为 null）不读不写：T51 要求先选人、归属所选人后才能标记，
 *   hook 返回空列表，UI 层负责引导选人，误调 mark 直接抛错（不该发生）。
 * 纯展示组件只依赖返回的 records / mark / unmark，不直接碰仓储。
 */
import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import type { ContentKind, ContentPayload, SentRecord } from '../../data/entities';
import { getRepository } from '../../data/repository';
import type { FavoriteScope } from '../favorites/restore';

/** 传给标记按钮的最小接口形状（useSentRecords 返回值即满足） */
export interface SentStateApi {
  /** null 表示尚未完成首次读取；空数组为读取完但无记录（或通用版未选人） */
  records: SentRecord[] | null;
  /** 写入 / 更改一条已送出记录（同年同类 upsert，payload 为标记那一刻快照） */
  mark: (year: number, kind: ContentKind, payload: ContentPayload) => Promise<void>;
  /** 撤销：物理删除该记录行（data-model：撤销即删除本行） */
  unmark: (id: string) => Promise<void>;
}

export function useSentRecords(scope: FavoriteScope | null): SentStateApi {
  // 只解构原始字段进 hook 依赖：scope / key 对象每次渲染新建，不能直接作为依赖
  const personId = scope?.key.personId ?? null;
  const occasionType = scope?.key.occasionType ?? null;
  const anniversaryId = scope?.key.anniversaryId ?? null;
  const festivalCode = scope?.key.festivalCode ?? null;
  const [records, setRecords] = useState<SentRecord[] | null>(null);

  const query = useCallback(() => {
    // scope 缺失（参数非法页）或通用版节日（无归属人）：不查库
    if (!occasionType || !personId) {
      return Promise.resolve([]);
    }
    return getRepository().then((repo) =>
      repo.listSentRecords({
        personId,
        occasionType,
        anniversaryId: anniversaryId ?? null,
        festivalCode: festivalCode ?? null,
      }),
    );
  }, [personId, occasionType, anniversaryId, festivalCode]);

  // 每次聚焦重读：标记 / 撤销或跨页返回后即时反映
  useFocusEffect(
    useCallback(() => {
      let active = true;
      query()
        .then((list) => {
          if (active) {
            setRecords(list);
          }
        })
        .catch(() => {
          // 读取失败不致命：按空处理，不白屏（标记操作仍可在下次聚焦时恢复一致）
          if (active) {
            setRecords([]);
          }
        });
      return () => {
        active = false;
      };
    }, [query]),
  );

  const mark = useCallback(
    async (year: number, kind: ContentKind, payload: ContentPayload) => {
      if (!occasionType || !personId) {
        throw new Error('缺少日子作用域或归属人（通用版须先选人），不能标记已送出');
      }
      const repo = await getRepository();
      await repo.markSent({
        personId,
        occasionType,
        anniversaryId: anniversaryId ?? null,
        festivalCode: festivalCode ?? null,
        year,
        kind,
        payload,
      });
      // 写后回读：拿到正确的年份倒序与 marked_at
      setRecords(await query());
    },
    [personId, occasionType, anniversaryId, festivalCode, query],
  );

  const unmark = useCallback(async (id: string) => {
    const repo = await getRepository();
    await repo.unmarkSent(id);
    setRecords((prev) => (prev ? prev.filter((item) => item.id !== id) : prev));
  }, []);

  return { records, mark, unmark };
}
