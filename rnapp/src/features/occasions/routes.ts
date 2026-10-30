/**
 * 日子相关路由构造（T16；M4 首页、M5 通知响应共用的唯一定义处）。
 * 路由结构严格对应 plan.md 第 3.1 节，本文件只负责拼 href，不新增页面。
 */
import type { FestivalCode, OccasionKey } from '../../data/entities';

/**
 * 拼接心意详情页 href：/occasion-detail?kind=...&year=...
 * personId / anniversaryId / festivalCode 仅在非空时追加，空值不出现在 query 中。
 */
export function buildOccasionHref(ref: OccasionKey): string {
  const query = [
    `kind=${encodeURIComponent(ref.occasionType)}`,
    `year=${ref.year}`,
  ];
  if (ref.personId) {
    query.push(`personId=${encodeURIComponent(ref.personId)}`);
  }
  if (ref.anniversaryId) {
    query.push(`anniversaryId=${encodeURIComponent(ref.anniversaryId)}`);
  }
  if (ref.festivalCode) {
    query.push(`festivalCode=${encodeURIComponent(ref.festivalCode)}`);
  }
  return `/occasion-detail?${query.join('&')}`;
}

/** 拼接节日选人页 href：/festival/[festivalCode]/select?year=... */
export function buildFestivalSelectHref(code: FestivalCode, year: number): string {
  return `/festival/${code}/select?year=${year}`;
}

/** 拼接当日清单页 href：/day-list?date=YYYY-MM-DD */
export function buildDayListHref(date: string): string {
  return `/day-list?date=${encodeURIComponent(date)}`;
}
