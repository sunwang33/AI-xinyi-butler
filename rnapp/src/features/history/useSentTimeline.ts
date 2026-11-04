/**
 * 历史 Tab「已送出」全局流水数据 hook（M11 T69）。
 *
 * - 进入 / 聚焦屏幕时读仓储 listSentTimeline（已 JOIN 人员 / 纪念日名，按 marked_at 倒序）；
 * - null 表示首次加载中；读取失败给 error=true（空列表兜底），UI 出错误态与「重试」，
 *   不白屏、不与空状态混淆（spec 全局规则 3）；
 * - 标记 / 撤销发生在详情页，返回本 Tab 时聚焦刷新即可反映；reload 供手动重试。
 */
import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import type { SentTimelineRow } from '../../data/entities';
import { getRepository } from '../../data/repository';

export interface SentTimelineApi {
  /** null＝首次加载中；读取完为扁平流水行（可能空数组） */
  rows: SentTimelineRow[] | null;
  /** 最近一次读取是否失败 */
  error: boolean;
  /** 手动重新读取（错误态重试） */
  reload: () => void;
}

export function useSentTimeline(): SentTimelineApi {
  const [rows, setRows] = useState<SentTimelineRow[] | null>(null);
  const [error, setError] = useState(false);

  // 纯读取 Promise，聚焦自动刷新与手动重试共用
  const fetchRows = useCallback(
    () => getRepository().then((repo) => repo.listSentTimeline()),
    [],
  );

  useFocusEffect(
    useCallback(() => {
      let active = true;
      fetchRows()
        .then((list) => {
          if (active) {
            setRows(list);
            setError(false);
          }
        })
        .catch((e) => {
          console.warn('[T69] listSentTimeline failed:', e);
          if (active) {
            setRows([]);
            setError(true);
          }
        });
      return () => {
        active = false;
      };
    }, [fetchRows]),
  );

  // 手动重试必发生在挂载中的屏幕上，不需要 active 守卫
  const reload = useCallback(() => {
    setRows(null);
    fetchRows()
      .then((list) => {
        setRows(list);
        setError(false);
      })
      .catch((e) => {
        console.warn('[T69] listSentTimeline reload failed:', e);
        setRows([]);
        setError(true);
      });
  }, [fetchRows]);

  return { rows, error, reload };
}
