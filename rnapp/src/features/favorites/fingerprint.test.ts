/**
 * 收藏去重指纹单测（M10 T48）。重点：
 * - 规范化只折叠空白、不改原文；空白差异不应被当成两条收藏；
 * - 三类内容各自的指纹构成（贺卡改字 / 换模板即新版本）；
 * - findFavorite 同时要求「同一日子 ＋ 同一指纹」，日子不同不算重复。
 * 工程未引入 @types/jest，此处仅声明最小测试全局类型。
 */
import type { CardPayload, Favorite, FavoriteCreate, OccasionKey } from '../../data/entities';
import {
  FAVORITE_LIMIT,
  decideFavoriteAction,
  findFavorite,
  normalizeText,
  payloadFingerprint,
  sameOccasion,
} from './fingerprint';

declare const describe: (name: string, fn: () => void) => void;
declare const it: (name: string, fn: () => void) => void;
declare const expect: any;

/** 构造收藏行测试夹具，仅覆盖关心的字段 */
function makeFavorite(
  partial: Pick<Favorite, 'kind' | 'payload'> & Partial<Omit<Favorite, 'kind' | 'payload'>>,
): Favorite {
  return {
    id: 'f1',
    personId: null,
    personLabel: null,
    occasionType: 'birthday',
    anniversaryId: null,
    festivalCode: null,
    occasionName: '生日',
    year: 2026,
    userId: null,
    createdAt: '2026-11-03T00:00:00.000Z',
    updatedAt: '2026-11-03T00:00:00.000Z',
    deleted: false,
    ...partial,
  } as Favorite;
}

const cardPayload = (over: Partial<CardPayload> = {}): CardPayload => ({
  template_code: 'mountain',
  salutation: '妈妈',
  text: '生日快乐',
  signature: '小明',
  occasion_type: 'birthday',
  occasion_name: '生日',
  ...over,
});

const birthdayKey: OccasionKey = {
  occasionType: 'birthday',
  personId: 'p1',
  anniversaryId: null,
  festivalCode: null,
  year: 2026,
};

describe('FAVORITE_LIMIT', () => {
  it('容量上限固定为 100（B 组门禁④）', () => {
    expect(FAVORITE_LIMIT).toBe(100);
  });
});

describe('normalizeText', () => {
  it('去首尾空白，并把内部连续空白/换行折成一个空格', () => {
    expect(normalizeText('  你好  世界 \n')).toBe('你好 世界');
    expect(normalizeText('a\t\tb\nc')).toBe('a b c');
  });
});

describe('payloadFingerprint', () => {
  it('祝福：仅空白差异视为同一条', () => {
    const a = payloadFingerprint('blessing', { text: '生日快乐， 妈' });
    const b = payloadFingerprint('blessing', { text: '  生日快乐， 妈\n' });
    expect(a).toBe(b);
  });

  it('祝福：文案不同则指纹不同', () => {
    expect(payloadFingerprint('blessing', { text: '甲' })).not.toBe(
      payloadFingerprint('blessing', { text: '乙' }),
    );
  });

  it('礼物：名称/理由/搜索词任一不同即新指纹；全等（含空白差异）才相同', () => {
    const base = { name: '花盆', reason: '她爱养花', search_term: '陶瓷 花盆' };
    const same = { name: ' 花盆', reason: '她爱养花 ', search_term: '陶瓷  花盆' };
    expect(payloadFingerprint('gift', same)).toBe(payloadFingerprint('gift', base));
    expect(payloadFingerprint('gift', { ...base, name: '花瓶' })).not.toBe(
      payloadFingerprint('gift', base),
    );
    expect(payloadFingerprint('gift', { ...base, reason: '别的理由' })).not.toBe(
      payloadFingerprint('gift', base),
    );
    expect(payloadFingerprint('gift', { ...base, search_term: '别的词' })).not.toBe(
      payloadFingerprint('gift', base),
    );
  });

  it('贺卡：模板/称呼/文案/自称任一不同即新版本；signature null 与空串等价', () => {
    const base = cardPayload();
    expect(payloadFingerprint('card', cardPayload({ text: ' 生日快乐 ' }))).toBe(
      payloadFingerprint('card', base),
    );
    expect(payloadFingerprint('card', cardPayload({ text: '天天开心' }))).not.toBe(
      payloadFingerprint('card', base),
    );
    expect(payloadFingerprint('card', cardPayload({ template_code: 'night' }))).not.toBe(
      payloadFingerprint('card', base),
    );
    expect(payloadFingerprint('card', cardPayload({ salutation: '妈' }))).not.toBe(
      payloadFingerprint('card', base),
    );
    expect(payloadFingerprint('card', cardPayload({ signature: null }))).toBe(
      payloadFingerprint('card', cardPayload({ signature: '' })),
    );
  });

  it('不同 kind 即便文本巧合相同也不撞指纹', () => {
    expect(payloadFingerprint('blessing', { text: 'x' })).not.toBe(
      payloadFingerprint('gift', { name: 'x', reason: '', search_term: '' }),
    );
  });
});

describe('sameOccasion / findFavorite', () => {
  const fav = makeFavorite({
    kind: 'blessing',
    payload: { text: '生日快乐' },
    occasionType: 'birthday',
    personId: 'p1',
    year: 2026,
  });

  it('OccasionKey 中缺席(undefined)与 null 等价', () => {
    expect(sameOccasion(fav, { ...birthdayKey, anniversaryId: undefined })).toBe(true);
  });

  it('同日子同指纹命中（再点即取消的前提）', () => {
    const hit = findFavorite([fav], birthdayKey, 'blessing', { text: '生日快乐' });
    expect(hit?.id).toBe('f1');
    // 空白差异仍命中
    expect(findFavorite([fav], birthdayKey, 'blessing', { text: ' 生日快乐\n' })).not.toBeNull();
  });

  it('不同年份 / 不同人 / 不同日子类型都不算同一条', () => {
    expect(
      findFavorite([fav], { ...birthdayKey, year: 2027 }, 'blessing', { text: '生日快乐' }),
    ).toBeNull();
    expect(
      findFavorite([fav], { ...birthdayKey, personId: 'p2' }, 'blessing', { text: '生日快乐' }),
    ).toBeNull();
    expect(
      findFavorite([fav], { ...birthdayKey, occasionType: 'anniversary' }, 'blessing', {
        text: '生日快乐',
      }),
    ).toBeNull();
  });

  it('同日子但内容指纹不同（贺卡改版）不命中，应作为新版本并存', () => {
    const cardFav = makeFavorite({ kind: 'card', payload: cardPayload() });
    const changed = cardPayload({ template_code: 'night' });
    expect(
      findFavorite(
        [cardFav],
        birthdayKey,
        'card',
        changed,
      ),
    ).toBeNull();
  });

  it('空列表返回 null', () => {
    expect(findFavorite([], birthdayKey, 'blessing', { text: 'x' })).toBeNull();
  });
});

describe('decideFavoriteAction（toggle 编排）', () => {
  const makeCreate = (text: string): FavoriteCreate => ({
    kind: 'blessing',
    personId: 'p1',
    personLabel: '某人（家人）',
    occasionType: 'birthday',
    anniversaryId: null,
    festivalCode: null,
    occasionName: '生日',
    year: 2026,
    payload: { text },
  });

  it('未收藏时决定新增', () => {
    expect(decideFavoriteAction([], makeCreate('甲')).type).toBe('add');
  });

  it('已收藏（同日子同指纹）时决定取消该行', () => {
    const fav = makeFavorite({ kind: 'blessing', payload: { text: '甲' }, personId: 'p1' });
    const decision = decideFavoriteAction([fav], makeCreate('  甲\n'));
    expect(decision.type).toBe('remove');
    if (decision.type === 'remove') {
      expect(decision.favorite.id).toBe('f1');
    }
  });

  it('收藏夹满 100 且是新内容时拒绝（full），不再新增', () => {
    // 造 100 条互不相同的已有收藏
    const full: Favorite[] = Array.from({ length: FAVORITE_LIMIT }, (_, i) =>
      makeFavorite({ id: `x${i}`, kind: 'blessing', payload: { text: `文案${i}` }, personId: 'p1' }),
    );
    expect(full).toHaveLength(100);
    expect(decideFavoriteAction(full, makeCreate('全新的一条')).type).toBe('full');
  });

  it('满 100 但点的是已收藏项时仍可取消（不被上限拦住）', () => {
    const full: Favorite[] = Array.from({ length: FAVORITE_LIMIT }, (_, i) =>
      makeFavorite({ id: `x${i}`, kind: 'blessing', payload: { text: `文案${i}` }, personId: 'p1' }),
    );
    expect(decideFavoriteAction(full, makeCreate('文案0')).type).toBe('remove');
  });
});
