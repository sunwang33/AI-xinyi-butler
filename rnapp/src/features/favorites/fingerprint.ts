/**
 * 收藏去重指纹与日子定位（M10 T48，B 组门禁 2026-11-03 拍板）。
 *
 * 规则：
 * - 收藏是「再点即取消」的 toggle：同一日子下，内容指纹相同即视为同一条，
 *   不产生重复收藏行；再点取消只删收藏行。
 * - 祝福指纹＝规范化后的文案；礼物＝名称＋理由＋搜索词；
 *   贺卡＝模板＋称呼＋祝福文案＋自称（完整图文）。贺卡改字 / 换模板后指纹变化，
 *   再收藏作为新版本并存，同一日子可以有多版贺卡收藏。
 * - 规范化只用于指纹比较，不改动收藏行里保存的原文快照：去掉首尾空白、
 *   把内部连续空白（含换行）折成一个空格，使排版差异不会被当成两条。
 * 本文件为纯函数，不依赖仓储与 React，便于单测。
 */
import type {
  BlessingPayload,
  CardPayload,
  ContentKind,
  ContentPayload,
  Favorite,
  FavoriteCreate,
  GiftPayload,
  OccasionKey,
} from '../../data/entities';

/** 收藏容量上限（B 组门禁④）：满 100 条后再收藏需先取消一些 */
export const FAVORITE_LIMIT = 100;

/** 指纹内部分隔符：选用正常文案不会出现的单元分隔符，避免字段粘连误判 */
const SEP = '␟';

/** 规范化文本：去首尾空白，内部连续空白折成单个空格（只用于指纹，不改原文） */
export function normalizeText(input: string): string {
  return input.trim().replace(/\s+/g, ' ');
}

/**
 * 计算内容指纹。kind 在外层（Favorite.kind / 入参）判别，payload 本身是
 * 无判别字段的联合体，故在此按 kind 收窄后取各自字段。
 */
export function payloadFingerprint(kind: ContentKind, payload: ContentPayload): string {
  if (kind === 'blessing') {
    const p = payload as BlessingPayload;
    return ['blessing', normalizeText(p.text)].join(SEP);
  }
  if (kind === 'gift') {
    const p = payload as GiftPayload;
    return [
      'gift',
      normalizeText(p.name),
      normalizeText(p.reason),
      normalizeText(p.search_term),
    ].join(SEP);
  }
  const p = payload as CardPayload;
  // signature 未填为 null，归一为空串；salutation 库内为 string（通用版为空串）
  return [
    'card',
    p.template_code,
    normalizeText(p.salutation),
    normalizeText(p.text),
    normalizeText(p.signature ?? ''),
  ].join(SEP);
}

/** 按钮级忙碌标识：与收藏行查找同源，保证按钮高亮 / 忙碌判定一致 */
export function busyKeyFor(kind: ContentKind, payload: ContentPayload): string {
  return payloadFingerprint(kind, payload);
}

/** 两个日子定位是否相同（undefined / null 统一按 null 比较） */
export function sameOccasion(fav: Favorite, key: OccasionKey): boolean {
  return (
    fav.occasionType === key.occasionType &&
    fav.year === key.year &&
    (fav.personId ?? null) === (key.personId ?? null) &&
    (fav.anniversaryId ?? null) === (key.anniversaryId ?? null) &&
    (fav.festivalCode ?? null) === (key.festivalCode ?? null)
  );
}

/**
 * 在已收藏列表中查找「同一日子 ＋ 同 kind ＋ 同内容指纹」的条目。
 * 命中即当前内容已收藏（按钮呈已收藏态，再点取消）；否则为未收藏。
 */
export function findFavorite(
  list: readonly Favorite[],
  key: OccasionKey,
  kind: ContentKind,
  payload: ContentPayload,
): Favorite | null {
  const fp = payloadFingerprint(kind, payload);
  return (
    list.find(
      (item) =>
        item.kind === kind &&
        sameOccasion(item, key) &&
        payloadFingerprint(item.kind, item.payload) === fp,
    ) ?? null
  );
}

/** toggle 判定结果：命中已收藏→删该行；未命中且满 100→拒绝；否则新增 */
export type ToggleDecision =
  | { type: 'remove'; favorite: Favorite }
  | { type: 'add' }
  | { type: 'full' };

/**
 * 依据库内最新列表决定本次点按是「取消 / 新增 / 已满拒绝」。
 * 抽成纯函数便于单测（100 条上限不便在真机逐条构造）。
 */
export function decideFavoriteAction(
  current: readonly Favorite[],
  input: FavoriteCreate,
): ToggleDecision {
  const existing = findFavorite(current, input, input.kind, input.payload);
  if (existing) {
    return { type: 'remove', favorite: existing };
  }
  if (current.length >= FAVORITE_LIMIT) {
    return { type: 'full' };
  }
  return { type: 'add' };
}
