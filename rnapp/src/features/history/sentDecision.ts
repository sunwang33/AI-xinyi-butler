/**
 * 「今年已送出」标记判定纯函数（M11 T50，门禁 G-A4 2026-11-04 拍板）。
 *
 * 规则（拍板口径）：
 * - 分条标记：祝福 / 礼物 / 贺卡各自独立，同一「人 × 日子 × 年 × kind」业务唯一；
 * - 标记是 toggle 语义，但「更改」与「撤销」要区分：
 *   · 该年该种类还没有记录 → 新增（add）；
 *   · 已有记录且内容指纹相同（就是标记时那条）→ 撤销该记录（unmark）；
 *   · 已有记录但内容已变（重新生成 / 换了礼物或贺卡版本）→ 用当前内容更改（replace，
 *     仓储 upsert 覆盖 payload 与 marked_at）；调用方需先让用户确认。
 * - 指纹比较复用收藏的 payloadFingerprint（规范化规则一致：空白折叠、贺卡 null/空串等价）。
 * 本文件不依赖 React 与仓储，便于单测。
 */
import type { ContentKind, ContentPayload, SentRecord } from '../../data/entities';
import { payloadFingerprint } from '../favorites/fingerprint';

export type SentDecision =
  | { type: 'add' }
  | { type: 'replace'; existing: SentRecord }
  | { type: 'unmark'; existing: SentRecord };

/** 找到某一年某一种类的已送出记录（同年同类业务唯一，取即一条） */
export function findYearKind(
  records: readonly SentRecord[],
  year: number,
  kind: ContentKind,
): SentRecord | null {
  return records.find((item) => item.year === year && item.kind === kind) ?? null;
}

/** 依据已加载记录与当前内容，决定本次点按是新增 / 更改 / 撤销 */
export function decideSentAction(
  records: readonly SentRecord[],
  year: number,
  kind: ContentKind,
  payload: ContentPayload,
): SentDecision {
  const existing = findYearKind(records, year, kind);
  if (!existing) {
    return { type: 'add' };
  }
  const samePayload =
    payloadFingerprint(kind, payload) ===
    payloadFingerprint(existing.kind, existing.payload);
  return samePayload
    ? { type: 'unmark', existing }
    : { type: 'replace', existing };
}

/** 种类中文名（确认弹层 / 状态章文案共用） */
export const SENT_KIND_LABEL: Record<ContentKind, string> = {
  blessing: '祝福',
  gift: '礼物',
  card: '贺卡',
};

/** 三类内容的固定展示顺序（状态章、往年组、流水回看 / 副行共用） */
export const SENT_KIND_ORDER: readonly ContentKind[] = ['blessing', 'gift', 'card'];

/** 往年分组：某年的全部已送出记录（T52 按年倒序回顾） */
export interface YearGroup {
  year: number;
  /** 组内沿用仓储顺序（year DESC, marked_at DESC） */
  records: SentRecord[];
}

/**
 * 把同一人同一日子的记录按年份分组并排除「今年」（当前详情页年份），
 * 年份倒序（T52）。不依赖入参顺序：组与组之间显式按年排，组内按 marked_at 倒序，
 * 这样仓储排序将来若变化，回顾区顺序也不漂移。
 */
export function groupPastYears(
  records: readonly SentRecord[],
  currentYear: number,
): YearGroup[] {
  const byYear = new Map<number, SentRecord[]>();
  for (const record of records) {
    if (record.year === currentYear) {
      continue;
    }
    const list = byYear.get(record.year);
    if (list) {
      list.push(record);
    } else {
      byYear.set(record.year, [record]);
    }
  }
  return [...byYear.entries()]
    .map(([year, list]) => ({
      year,
      records: list.sort((a, b) => b.markedAt.localeCompare(a.markedAt)),
    }))
    .sort((a, b) => b.year - a.year);
}
