/**
 * 由本机档案拼装云函数入参（M6 T30 / M7 T36 的客户端侧）。
 * 纯函数，方便单测：纪念日周年数在客户端由 year - startYear 算好。
 */
import type { Anniversary, Person, Trait } from '../../data/entities';
import type { ContentContext } from './types';

export interface BuildContextInput {
  occasionType: ContentContext['occasion']['type'];
  /** 节日中文名；occasionType=festival 时必给 */
  festivalName?: string | null;
  festivalCode?: ContentContext['occasion']['festivalCode'];
  /** 纪念日实体；occasionType=anniversary 时必给 */
  anniversary?: Anniversary | null;
  /** 人员实体；通用版节日为 null */
  person: Person | null;
  traits: Trait[];
  /** 设备本地年份（query 中的 year） */
  year: number;
}

/** 特征按 position 排序后取文案（仓储通常已排序，这里再保一次底） */
function traitTexts(traits: Trait[]): string[] {
  return [...traits]
    .sort((a, b) => a.position - b.position)
    .map((t) => t.content)
    .filter((c) => c.trim().length > 0);
}

/** 拼装生成上下文；person 为 null 即通用版节日 */
export function buildContentContext(input: BuildContextInput): ContentContext {
  const occasion: ContentContext['occasion'] = { type: input.occasionType };

  if (input.occasionType === 'festival') {
    occasion.festivalCode = input.festivalCode ?? undefined;
    occasion.festivalName = input.festivalName ?? undefined;
  }
  if (input.occasionType === 'anniversary' && input.anniversary) {
    occasion.anniversaryName = input.anniversary.name;
    if (input.anniversary.startYear != null) {
      occasion.anniversaryYears = input.year - input.anniversary.startYear;
    }
  }

  const person =
    input.person === null
      ? null
      : {
          relation: input.person.relation,
          traits: traitTexts(input.traits),
          salutation: input.person.salutation,
          signature: input.person.signature,
        };

  return { occasion, person };
}
