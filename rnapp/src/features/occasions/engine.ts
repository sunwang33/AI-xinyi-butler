/**
 * 日子计算引擎（T16，纯 TypeScript）。
 *
 * 约定：
 * - 纯函数模块：不碰 Repository、不读系统时间，today 一律由参数注入；
 * - 入参出参均为设备本地口径的 YYYY-MM-DD 字符串；
 * - 内部一律用 UTC 零点的 Date 计算，避免设备时区造成日期漂移，不引入任何日期库；
 * - 生日 2 月 29 日仅在派生时折算（平年 2/28、闰年 2/29），存储数据不改；
 * - 纪念日每年重复，startYear 非空时输出周年数（year - startYear）供 AI 使用；
 * - 节日按 F11 关注机制过滤：入参 disabledFestivalCodes 中的节日不产出
 *   （festival_settings.disabled=1=已取关）；不传则六个节日默认全关注；
 * - 人员 disabled 语义不同：只停推送、不过滤列表，引擎不读单人提醒开关。
 */
import type { Anniversary, FestivalCode, OccasionKey, Person } from '../../data/entities';
import { FESTIVALS } from './festivals';

/** 首页临近列表与提醒调度共用的窗口天数（含今天共 30 天） */
export const WINDOW_DAYS = 30;

/** 一个日子在某一年的派生结果（人 × 日子 × 年份） */
export interface OccasionHit extends OccasionKey {
  /** 当年发生日期，设备本地 YYYY-MM-DD */
  date: string;
  /** date 与 today 的本地自然日天数差；可为负（已过），由调用方按需过滤 */
  daysFromToday: number;
  /** 日子名称：生日固定「生日」、纪念日取其名称、节日取中文节日名 */
  title: string;
  /** 对象称呼（person.salutation ?? person.name）；通用节日为 null */
  subjectName: string | null;
  /** 周年数：仅纪念日且 startYear 非空时为 year - startYear，其余为 null */
  anniversaryYears: number | null;
}

export interface ComputeHitsArgs {
  /** 设备本地今天，YYYY-MM-DD */
  today: string;
  /** 区间起（含），YYYY-MM-DD，可跨年 */
  from: string;
  /** 区间止（含），YYYY-MM-DD，可跨年 */
  to: string;
  persons: Person[];
  anniversaries: Anniversary[];
  /** 是否包含六个内置节日，默认 true */
  includeFestivals?: boolean;
  /** 已取关节日代号（F11，festival_settings.disabled=1）：这些节日不产出；不传为全关注 */
  disabledFestivalCodes?: readonly FestivalCode[];
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** 解析本地 YYYY-MM-DD 为 UTC 零点时间戳对应的 Date */
function parseDate(value: string): Date {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function formatDate(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** 两个本地日期的天数差（a - b），差为整数天 */
function diffDays(a: string, b: string): number {
  return (parseDate(a).getTime() - parseDate(b).getTime()) / MS_PER_DAY;
}

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/** 公历某年某月的天数 */
function daysInMonth(year: number, month: number): number {
  if (month === 2) {
    return isLeapYear(year) ? 29 : 28;
  }
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

/**
 * 把月/日折算到某年的实际日期：2 月 29 日平年落到 2/28，其余日期原样。
 * 仅用于运行时派生，不改存储值。
 */
function deriveDate(year: number, month: number, day: number): string {
  return formatDate(year, month, Math.min(day, daysInMonth(year, month)));
}

/**
 * 计算 [from, to] 闭区间内（可跨年）发生的全部日子。
 * 同一天的多个日子全部保留；结果按 (date 升序, title 升序) 稳定排序。
 */
export function computeHitsInRange(args: ComputeHitsArgs): OccasionHit[] {
  const { today, from, to, persons, anniversaries } = args;
  const includeFestivals = args.includeFestivals ?? true;
  // F11：取关节日不产出（展示与调度共用此过滤）
  const disabledFestivals = new Set<string>(args.disabledFestivalCodes ?? []);

  // 非法区间（from 晚于 to）直接返回空
  if (parseDate(from).getTime() > parseDate(to).getTime()) {
    return [];
  }

  const personById = new Map<string, Person>(persons.map((person) => [person.id, person]));
  const hits: OccasionHit[] = [];

  const pushIfInRange = (date: string, hit: Omit<OccasionHit, 'date' | 'daysFromToday'>) => {
    // YYYY-MM-DD 零填充，字典序与日期先后一致
    if (date >= from && date <= to) {
      hits.push({ ...hit, date, daysFromToday: diffDays(date, today) });
    }
  };

  // 区间可能跨年：从 from 所在年到 to 所在年逐年派生
  const startYear = Number(from.slice(0, 4));
  const endYear = Number(to.slice(0, 4));

  for (let year = startYear; year <= endYear; year += 1) {
    if (includeFestivals) {
      for (const festival of FESTIVALS) {
        if (disabledFestivals.has(festival.code)) {
          continue;
        }
        pushIfInRange(festival.dateOf(year), {
          occasionType: 'festival',
          personId: null,
          anniversaryId: null,
          festivalCode: festival.code,
          year,
          title: festival.name,
          subjectName: null,
          anniversaryYears: null,
        });
      }
    }

    for (const person of persons) {
      pushIfInRange(deriveDate(year, person.birthdayMonth, person.birthdayDay), {
        occasionType: 'birthday',
        personId: person.id,
        anniversaryId: null,
        festivalCode: null,
        year,
        title: '生日',
        subjectName: person.salutation ?? person.name,
        anniversaryYears: null,
      });
    }

    for (const anniversary of anniversaries) {
      const owner = personById.get(anniversary.personId);
      pushIfInRange(deriveDate(year, anniversary.month, anniversary.day), {
        occasionType: 'anniversary',
        personId: anniversary.personId,
        anniversaryId: anniversary.id,
        festivalCode: null,
        year,
        title: anniversary.name,
        // 纪念日必属于某位在档人员；档案缺失时退化为 null
        subjectName: owner ? (owner.salutation ?? owner.name) : null,
        anniversaryYears:
          anniversary.startYear != null ? year - anniversary.startYear : null,
      });
    }
  }

  // Array.prototype.sort 为稳定排序：date、title 都相同的条目保持生成顺序
  return hits.sort((a, b) => {
    if (a.date < b.date) {
      return -1;
    }
    if (a.date > b.date) {
      return 1;
    }
    if (a.title < b.title) {
      return -1;
    }
    if (a.title > b.title) {
      return 1;
    }
    return 0;
  });
}

/**
 * 首页临近列表：区间 [today, today + WINDOW_DAYS - 1]（含今天共 30 天），
 * 仅返回 daysFromToday >= 0 的条目；六个内置节日默认全关注，传入
 * disabledFestivalCodes（F11 取关）可过滤掉对应节日。
 */
export function listUpcoming(
  today: string,
  persons: Person[],
  anniversaries: Anniversary[],
  disabledFestivalCodes?: readonly FestivalCode[],
): OccasionHit[] {
  const end = new Date(
    parseDate(today).getTime() + (WINDOW_DAYS - 1) * MS_PER_DAY,
  );
  const to = formatDate(end.getUTCFullYear(), end.getUTCMonth() + 1, end.getUTCDate());

  return computeHitsInRange({
    today,
    from: today,
    to,
    persons,
    anniversaries,
    disabledFestivalCodes,
  }).filter((hit) => hit.daysFromToday >= 0);
}
