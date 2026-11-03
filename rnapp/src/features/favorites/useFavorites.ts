/**
 * 收藏状态（M10 T48/T49）：页面级 hoo­k，串起仓储读取与 toggle 去重 / 容量上限。
 *
 * - 进入 / 聚焦屏幕时全量读取（最多 100 条，开销很小），仓储已按收藏时间倒序；
 * - toggle 以库内最新数据为准查重，避免本地 state 滞后：
 *   · 命中同日子 + 同内容指纹 → 删除该行（再点取消）；
 *   · 未命中且已满 FAVORITE_LIMIT → 返回 'full'，由界面提示先取消一些，不写库；
 *   · 否则新增一行（贺卡改字 / 换模板即新指纹，自然成为并存的新版本）。
 * 纯展示组件只依赖返回的 favorites / toggle，不直接碰仓储。
 */
import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import type { Favorite, FavoriteCreate } from '../../data/entities';
import { getRepository } from '../../data/repository';
import { decideFavoriteAction } from './fingerprint';

/** toggle 结果：added＝已收藏；removed＝已取消；full＝收藏夹满 100，未写库 */
export type ToggleResult = 'added' | 'removed' | 'full';

/** 传给收藏按钮的最小接口形状（useFavorites 返回值即满足） */
export interface FavoriteStateApi {
  /** null 表示尚未完成首次读取；空数组为读取完但无收藏 */
  favorites: Favorite[] | null;
  toggle: (input: FavoriteCreate) => Promise<ToggleResult>;
}

export function useFavorites(): FavoriteStateApi & {
  refresh: () => Promise<void>;
  /** 收藏分区「取消收藏」：按行 id 删除（行内已知是哪条，无需再算指纹） */
  removeById: (id: string) => Promise<void>;
} {
  const [favorites, setFavorites] = useState<Favorite[] | null>(null);

  const refresh = useCallback(async () => {
    const repo = await getRepository();
    const list = await repo.listFavorites();
    setFavorites(list);
  }, []);

  // 每次聚焦重读：在历史页取消收藏、或跨页变化后返回详情页都能即时反映
  useFocusEffect(
    useCallback(() => {
      let active = true;
      getRepository()
        .then((repo) => repo.listFavorites())
        .then((list) => {
          if (active) {
            setFavorites(list);
          }
        })
        .catch(() => {
          // 读取失败不致命：保留 null，界面可按未加载 / 空态处理（不白屏）
          if (active) {
            setFavorites([]);
          }
        });
      return () => {
        active = false;
      };
    }, []),
  );

  const toggle = useCallback(
    async (input: FavoriteCreate): Promise<ToggleResult> => {
      const repo = await getRepository();
      // 以库内最新列表查重并计数（不依赖可能滞后的本地 state）
      const current = await repo.listFavorites();
      const decision = decideFavoriteAction(current, input);

      if (decision.type === 'full') {
        // 已满 100：不写库，界面据此提示先取消一些
        return 'full';
      }
      if (decision.type === 'remove') {
        await repo.removeFavorite(decision.favorite.id);
      } else {
        await repo.addFavorite(input);
      }

      // 写后回读：顺带拿到正确的倒序与 created_at
      const next = await repo.listFavorites();
      setFavorites(next);
      return decision.type === 'remove' ? 'removed' : 'added';
    },
    [],
  );

  const removeById = useCallback(async (id: string) => {
    const repo = await getRepository();
    await repo.removeFavorite(id);
    // 取消收藏只删收藏行（不影响心意详情原内容）；本地同步摘掉该行
    setFavorites((prev) => (prev ? prev.filter((item) => item.id !== id) : prev));
  }, []);

  return { favorites, toggle, refresh, removeById };
}
