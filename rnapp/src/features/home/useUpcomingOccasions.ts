/**
 * 提醒页临近日子数据（T65 返工，原 T17；T66 接入 F11 关注过滤）：
 * - useFocusEffect：每次进入/聚焦提醒页都重新读取，人员或纪念日改动返回后即时反映；
 * - 数据走 Repository：listPersons 后逐人 listAnniversaries（无全量纪念日接口），Promise.all 并发后拍平；
 * - today 取设备本地日期（new Date() 本地口径，自写 YYYY-MM-DD 格式化，不引日期库）；
 * - 命中交给日子引擎 listUpcoming（未来 30 天含今天，已过滤已过、按临近程度排序）；
 *   窗口大小属 B 组未拍板项，沿用在制 30 天口径，不新定；
 * - T66：读取 festival_settings，把 disabled=1（已取关）的节日代号传给引擎过滤，
 *   festivalHits 只含已关注节日；followedCount 为六节日中已关注个数（管理 Sheet 标题用）；
 * - 命中按提醒页三段拆为 personHits（生日/纪念日）与 festivalHits（通用节日）；
 * - 不过滤人员 disabled：关闭提醒只停推送，日子仍在提醒页（spec 第 5 条）；
 * - 读取异常时 error=true 且不再转圈，由页面展示失败态与「重试」（reload）。
 */
import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { getRepository } from '../../data/repository';
import type { Anniversary, FestivalCode } from '../../data/entities';
import { listUpcoming } from '../occasions/engine';
import type { OccasionHit } from '../occasions/engine';

export interface UpcomingOccasionsState {
  /** 首次加载未完成时为 true；聚焦刷新期间不回到加载态 */
  loading: boolean;
  /** 未来 30 天（含今天）的生日/纪念日命中，按临近程度由近到远，供主卡与近期日子列表使用 */
  personHits: OccasionHit[];
  /** 未来 30 天（含今天）且已关注的通用节日命中（F11，取关节日不出现） */
  festivalHits: OccasionHit[];
  /** 六个内置节日中当前已关注的个数（0–6，节日区「已关注 N 个」与全取关空态用） */
  followedCount: number;
  /** 已加载完成且没有任何在档人员 */
  personsEmpty: boolean;
  /** Repository 读取异常时为 true，调用方展示失败态与「重试」 */
  error: boolean;
  /** 手动重新加载（失败态「重试」用，回到加载态） */
  reload: () => void;
  /** 静默重新读取（关注/取关写库后用，不闪骨架） */
  refresh: () => void;
}

/** 设备本地今天，格式 YYYY-MM-DD */
function formatTodayLocal(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function useUpcomingOccasions(): UpcomingOccasionsState {
  const [loading, setLoading] = useState(true);
  const [personHits, setPersonHits] = useState<OccasionHit[]>([]);
  const [festivalHits, setFestivalHits] = useState<OccasionHit[]>([]);
  const [followedCount, setFollowedCount] = useState(6);
  const [personsEmpty, setPersonsEmpty] = useState(false);
  const [error, setError] = useState(false);

  /**
   * 读取一版数据。showLoading=true 时回到骨架态（失败重试）；
   * 关注/取关后的刷新传 false，避免弹层/星标操作时页面闪骨架。
   */
  const runLoad = useCallback((showLoading: boolean) => {
    let active = true;
    if (showLoading) {
      setLoading(true);
      setError(false);
    }
    getRepository()
      .then(async (repo) => {
        const [persons, festivalSettings] = await Promise.all([
          repo.listPersons(),
          repo.listFestivalSettings(),
        ]);
        // Repository 无全量纪念日接口：逐人拉取，Promise.all 并发后拍平
        const perPerson = await Promise.all(
          persons.map((person) => repo.listAnniversaries(person.id)),
        );
        const anniversaries: Anniversary[] = perPerson.flat();
        // F11：disabled=1 即已取关，交给引擎过滤
        const disabledFestivalCodes: FestivalCode[] = festivalSettings
          .filter((item) => item.disabled)
          .map((item) => item.festivalCode);
        return {
          persons,
          followedCount: festivalSettings.filter((item) => !item.disabled).length,
          hits: listUpcoming(formatTodayLocal(), persons, anniversaries, disabledFestivalCodes),
        };
      })
      .then(({ persons, hits: nextHits, followedCount: nextFollowedCount }) => {
        if (!active) {
          return;
        }
        // 三段拆分：主卡与近期日子列表只取人员日子；节日区单独取已关注节日命中
        setPersonHits(nextHits.filter((hit) => hit.occasionType !== 'festival'));
        setFestivalHits(nextHits.filter((hit) => hit.occasionType === 'festival'));
        setFollowedCount(nextFollowedCount);
        setPersonsEmpty(persons.length === 0);
        setError(false);
        setLoading(false);
      })
      .catch(() => {
        if (active) {
          setError(true);
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, []);

  // 每次聚焦都静默刷新；runLoad 引用稳定，聚焦即重读
  useFocusEffect(useCallback(() => runLoad(false), [runLoad]));

  return {
    loading,
    personHits,
    festivalHits,
    followedCount,
    personsEmpty,
    error,
    reload: () => runLoad(true),
    refresh: () => runLoad(false),
  };
}
