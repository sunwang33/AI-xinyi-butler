/**
 * 六个内置节日常量（T15；门禁 G-D9 已拍板，严格六个，不增删）。
 * 代号取自 entities 的 FestivalCode，中文名逐字取自 data-model.md 1.3 节，
 * 日期规则取自 spec.md 第 7 条：具体日期不建表，由 dateOf(year) 按年派生。
 */
import { FESTIVAL_CODES } from '../../data/entities';
import type { FestivalCode } from '../../data/entities';

/** 内置节日定义：代号 + 固定中文展示名 */
export interface FestivalDef {
  code: FestivalCode;
  /** 页面展示名，固定不改写：元旦 / 情人节 / 母亲节 / 父亲节 / 感恩节 / 圣诞节 */
  name: string;
}

/** 固定公历日期 */
type FixedDateRule = { kind: 'fixed'; month: number; day: number };
/** 「month 月第 nth 个 weekday」规则；weekday：0=周日 … 6=周六 */
type NthWeekdayRule = {
  kind: 'nthWeekday';
  month: number;
  weekday: number;
  nth: number;
};
type FestivalRule = FixedDateRule | NthWeekdayRule;

/** 代号 → 中文名（data-model.md 1.3 节逐字） */
const FESTIVAL_NAMES: Record<FestivalCode, string> = {
  new_year: '元旦',
  valentines_day: '情人节',
  mothers_day: '母亲节',
  fathers_day: '父亲节',
  thanksgiving: '感恩节',
  christmas: '圣诞节',
};

/** 代号 → 日期规则（spec.md 第 7 条） */
const FESTIVAL_RULES: Record<FestivalCode, FestivalRule> = {
  new_year: { kind: 'fixed', month: 1, day: 1 },
  valentines_day: { kind: 'fixed', month: 2, day: 14 },
  // 母亲节：五月第二个星期日
  mothers_day: { kind: 'nthWeekday', month: 5, weekday: 0, nth: 2 },
  // 父亲节：六月第三个星期日
  fathers_day: { kind: 'nthWeekday', month: 6, weekday: 0, nth: 3 },
  // 感恩节：十一月第四个星期四
  thanksgiving: { kind: 'nthWeekday', month: 11, weekday: 4, nth: 4 },
  christmas: { kind: 'fixed', month: 12, day: 25 },
};

/** 取 year 年 month 月第 nth 个 weekday 的日（1–31，UTC 计算避免时区漂移） */
function nthWeekdayDay(
  year: number,
  month: number,
  weekday: number,
  nth: number,
): number {
  const firstWeekday = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  return 1 + ((weekday - firstWeekday + 7) % 7) + (nth - 1) * 7;
}

function formatDate(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/**
 * 六个内置节日，顺序同 FESTIVAL_CODES。
 * dateOf(year) 返回该节日在 year 年的设备本地日期（YYYY-MM-DD）。
 */
export const FESTIVALS: readonly (FestivalDef & {
  dateOf: (year: number) => string;
})[] = FESTIVAL_CODES.map((code) => {
  const rule = FESTIVAL_RULES[code];
  return {
    code,
    name: FESTIVAL_NAMES[code],
    dateOf(year: number): string {
      const day =
        rule.kind === 'fixed'
          ? rule.day
          : nthWeekdayDay(year, rule.month, rule.weekday, rule.nth);
      return formatDate(year, rule.month, day);
    },
  };
});
