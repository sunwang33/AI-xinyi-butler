/**
 * 已送出全局流水的聚合与展示文案纯函数（M11 T69/T70，门禁 G-A4 行形态）。
 *
 * 仓储 listSentTimeline 返回扁平行（一条 sent_records ＋ JOIN 出的人名 / 纪念日名），
 * 本文件按「人 × 日子 × 年」聚合成 UI 一行（分条存储、聚合展示，G-A4③）：
 * - 组排序按组内最新 marked_at 倒序；
 * - 红邮戳数字照原型 .sent-mark 取年份后两位（2026→26、2025→25），不是标记日 / 日子的日；
 * - 标题 / 副行文案照原型 .pickrow：「陈叔的生日 2026」「妈妈 · 母亲节 2026」，
 *   副行「10 月 28 日送出 · 祝福 · 贺卡」；
 * - 节日名从 FESTIVALS 常量表按 code 派生（data 层不依赖 features，故放在这里）。
 * 不依赖 React 与仓储，便于单测。
 */
import type {
  FestivalCode,
  OccasionType,
  SentRecord,
  SentTimelineRow,
} from '../../data/entities';
import { FESTIVALS } from '../occasions/festivals';
import { SENT_KIND_LABEL, SENT_KIND_ORDER } from './sentDecision';

/** 流水聚合组：UI 一行（T70 点按回看组内全部快照） */
export interface SentTimelineGroup {
  personId: string;
  occasionType: OccasionType;
  anniversaryId: string | null;
  festivalCode: FestivalCode | null;
  year: number;
  personName: string;
  personSalutation: string | null;
  /** 生日固定「生日」；纪念日取档案名；节日取常量表名 */
  occasionName: string;
  /** 组内记录（marked_at 倒序；同类同年业务唯一，最多祝福 / 礼物 / 贺卡各一条） */
  records: SentRecord[];
  /** 组内最新标记时间，决定组排序与副行「M月D日送出」 */
  lastMarkedAt: string;
}


/** 取日子展示名：生日固定；纪念日取 join 出的档案名（缺失兜底「纪念日」）；节日查常量表 */
export function occasionNameOf(row: SentTimelineRow): string {
  const { record, anniversaryName } = row;
  if (record.occasionType === 'birthday') {
    return '生日';
  }
  if (record.occasionType === 'anniversary') {
    return anniversaryName ?? '纪念日';
  }
  if (record.festivalCode) {
    return FESTIVALS.find((item) => item.code === record.festivalCode)?.name ?? '节日';
  }
  return '节日';
}

/** 聚合业务键：人 × 日子 × 年（kind 不入键——三类合一行） */
function groupKeyOf(row: SentTimelineRow): string {
  const r = row.record;
  return `${r.personId}|${r.occasionType}|${r.anniversaryId ?? ''}|${r.festivalCode ?? ''}|${r.year}`;
}

/** 扁平行聚合为流水组，按组内最新标记时间倒序 */
export function groupSentTimeline(rows: readonly SentTimelineRow[]): SentTimelineGroup[] {
  const map = new Map<string, SentTimelineGroup>();
  for (const row of rows) {
    const key = groupKeyOf(row);
    const existing = map.get(key);
    if (existing) {
      existing.records.push(row.record);
      if (row.record.markedAt > existing.lastMarkedAt) {
        existing.lastMarkedAt = row.record.markedAt;
      }
    } else {
      const r = row.record;
      map.set(key, {
        personId: r.personId,
        occasionType: r.occasionType,
        anniversaryId: r.anniversaryId,
        festivalCode: r.festivalCode,
        year: r.year,
        personName: row.personName,
        personSalutation: row.personSalutation,
        occasionName: occasionNameOf(row),
        records: [r],
        lastMarkedAt: r.markedAt,
      });
    }
  }
  return [...map.values()]
    .map((group) => ({
      ...group,
      // 不依赖入参顺序：组内也按标记时间倒序（仓储本身已 DESC，这里双保险）
      records: group.records.sort((a, b) => b.markedAt.localeCompare(a.markedAt)),
    }))
    .sort((a, b) => b.lastMarkedAt.localeCompare(a.lastMarkedAt));
}

/** 称呼优先（你怎么称呼 TA），未填用姓名 */
export function timelineWho(group: SentTimelineGroup): string {
  return group.personSalutation?.trim() || group.personName;
}

/** 行标题：生日 / 纪念日为「谁的什么日子」，节日为「谁 · 节日名」（照原型） */
export function timelineTitle(group: SentTimelineGroup): string {
  const who = timelineWho(group);
  if (group.occasionType === 'festival') {
    return `${who} · ${group.occasionName}`;
  }
  return `${who}的${group.occasionName}`;
}

/** ISO 转「M月D日」；非法日期返回 null */
export function monthDayOf(iso: string): string | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    return null;
  }
  return `${d.getMonth() + 1}月${d.getDate()}日`;
}

/** 红邮戳上的数字：年份后两位（原型 .sent-mark，2026→26、2025→25、2000→0） */
export function stampYearOf(year: number): number {
  return year % 100;
}

/** 副行：「M月D日送出 · 祝福 · 贺卡」（只列组内实际送出的种类，固定顺序） */
export function timelineSubtitle(group: SentTimelineGroup): string {
  const when = monthDayOf(group.lastMarkedAt) ?? '早些时候';
  const kinds = new Set(group.records.map((r) => r.kind));
  const labels = SENT_KIND_ORDER.filter((kind) => kinds.has(kind)).map((kind) => SENT_KIND_LABEL[kind]);
  return `${when}送出 · ${labels.join(' · ')}`;
}
