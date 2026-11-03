/**
 * 收藏的展示还原与写入装配（M10 T48/T49）。
 *
 * - 收藏写入时统一装配 FavoriteCreate（人 / 日子定位 / 日子名 / 完整快照）；
 * - personLabel 落库快照：具体人「姓名（关系）」，通用版节日「通用（未指定人）」；
 * - T49 收藏分区里贺卡要能离屏重渲并导出：贺卡行不存图片，只存模板与图文参数，
 *   导出时按收藏行的日子定位字段 ＋ year 重新派生完整日期。
 *   birthday / anniversary 的收藏行因外键 ON DELETE CASCADE，人或纪念日删除时
 *   收藏行一并消失，所以能读到的这两类行，其 person / anniversary 必然仍在。
 */
import type {
  ContentKind,
  ContentPayload,
  FavoriteCreate,
  OccasionKey,
  Person,
} from '../../data/entities';
import type { DataRepository } from '../../data/repository/types';
import { FESTIVALS } from '../occasions/festivals';

/** 通用版节日（未指定人）的对象快照文案（与 entities.Favorite 注释一致） */
export const GENERIC_PERSON_LABEL = '通用（未指定人）';

/** 收藏所需的「日子作用域」：定位键 ＋ 收藏时刻的对象 / 日子名快照 */
export interface FavoriteScope {
  key: OccasionKey;
  /** 具体人「姓名（关系）」；通用版为「通用（未指定人）」 */
  personLabel: string;
  /** 日子名，如「生日」「领证日」「母亲节」 */
  occasionName: string;
}

/** 由人员档案生成对象快照标签；无人（通用版节日）给固定文案 */
export function personLabelFor(person: Person | null): string {
  if (!person) {
    return GENERIC_PERSON_LABEL;
  }
  return `${person.name}（${person.relation}）`;
}

/** 装配一条待写入的收藏（payload 为收藏那一刻的完整内容快照） */
export function buildFavoriteCreate(
  scope: FavoriteScope,
  kind: ContentKind,
  payload: ContentPayload,
): FavoriteCreate {
  return {
    kind,
    payload,
    personId: scope.key.personId ?? null,
    personLabel: scope.personLabel,
    occasionType: scope.key.occasionType,
    anniversaryId: scope.key.anniversaryId ?? null,
    festivalCode: scope.key.festivalCode ?? null,
    occasionName: scope.occasionName,
    year: scope.key.year,
  };
}

/** 收藏行副标题：「{对象} · {日子名} · {year} 年」 */
export function favoriteMetaLine(fav: {
  personLabel: string | null;
  occasionName: string;
  year: number;
}): string {
  const who = fav.personLabel ?? GENERIC_PERSON_LABEL;
  return `为 ${who} · ${fav.occasionName} · ${fav.year} 年收藏`;
}

/**
 * 按收藏行的日子定位字段 ＋ year 重新派生贺卡完整日期（YYYY年M月D日）。
 * 取不到月日（数据异常）时返回空串，Postcard 仍可渲染、只是无日期。
 */
export async function favoriteCardDate(
  repo: Pick<
    DataRepository,
    'getPerson' | 'listAnniversaries'
  >,
  fav: {
    occasionType: OccasionKey['occasionType'];
    personId: string | null;
    anniversaryId: string | null;
    festivalCode: OccasionKey['festivalCode'];
    year: number;
  },
): Promise<string> {
  const { year } = fav;

  if (fav.occasionType === 'festival' && fav.festivalCode) {
    const md = FESTIVALS.find((f) => f.code === fav.festivalCode)?.dateOf(year).slice(5) ?? '';
    const [m, d] = md.split('-').map((v) => Number(v));
    return m ? `${year}年${m}月${d}日` : '';
  }

  if (fav.occasionType === 'birthday' && fav.personId) {
    const person = await repo.getPerson(fav.personId);
    return person ? `${year}年${person.birthdayMonth}月${person.birthdayDay}日` : '';
  }

  if (fav.occasionType === 'anniversary' && fav.personId && fav.anniversaryId) {
    const list = await repo.listAnniversaries(fav.personId);
    const anniversary = list.find((item) => item.id === fav.anniversaryId) ?? null;
    return anniversary ? `${year}年${anniversary.month}月${anniversary.day}日` : '';
  }

  return '';
}
