/**
 * 内容仓储真实 SQL 单测（T77）：内存 node:sqlite + 生产迁移 DDL。
 * 覆盖：快照当年固定与祝福/礼物字段互不覆盖、贺卡状态三字段部分更新、
 * 收藏快照完整性与过滤、已送出标记的业务键更新与年序、账号作用域隔离（T56）。
 */
/** @jest-environment node */
import type { OccasionKey } from '../../entities';
import { SqliteRepository } from './SqliteRepository';
import { SqliteContentRepository } from './SqliteContentRepository';
import { openTestDb } from './sqliteTestDb';

declare const describe: (name: string, fn: () => void) => void;
declare const it: (name: string, fn: () => Promise<void>) => void;
declare const expect: any;
declare const beforeEach: (fn: () => Promise<void>) => void;
declare const jest: any;

// 应用层 UUID 改为确定性自增，便于断言且不依赖 expo-crypto 原生实现
jest.mock('expo-crypto', () => {
  let n = 0;
  return { randomUUID: () => `test-uuid-${++n}` };
});

// personId 在 beforeEach 建人后赋值：快照/贺卡表对 person_id 有真实外键约束
let personId = '';

const birthdayKey = (year: number): OccasionKey => ({
  occasionType: 'birthday',
  personId,
  anniversaryId: null,
  festivalCode: null,
  year,
});

const festivalKey: OccasionKey = {
  occasionType: 'festival',
  personId: null,
  anniversaryId: null,
  festivalCode: 'christmas',
  year: 2026,
};

const gifts = [
  { name: '暖灯', reason: '适合夜读', search_term: '暖灯 台灯' },
  { name: '红茶', reason: '冬日暖意', search_term: '红茶礼盒' },
];

let db: any;
let repo: SqliteContentRepository;
let fullRepo: SqliteRepository;

beforeEach(async () => {
  db = await openTestDb();
  repo = new SqliteContentRepository(db, null);
  // 需要建人（快照/贺卡/sent_records 都有 person_id 外键）时用聚合仓储
  fullRepo = new SqliteRepository(db, null);
  const person = await fullRepo.createPerson({
    name: '测试对象',
    relation: '挚友',
    birthdayMonth: 5,
    birthdayDay: 20,
    birthYear: 1990,
    salutation: null,
    signature: null,
  });
  personId = person.id;
});

describe('内容快照：当年固定 + 字段级更新', () => {
  it('同「人×日子×年份」反复写入只更新同一行，祝福不覆盖礼物', async () => {
    const key = birthdayKey(2026);
    const first = await repo.upsertSnapshot({ ...key, blessings: ['甲', '乙'], status: 'success' });
    expect(first.gifts).toBeNull();
    expect(first.status).toBe('success');

    // 之后只写礼物：blessings 必须原样保留
    const second = await repo.upsertSnapshot({ ...key, gifts, status: 'success' });
    expect(second.id).toBe(first.id);
    expect(second.blessings).toEqual(['甲', '乙']);
    expect(second.gifts).toHaveLength(2);
    expect(second.gifts![0]).toEqual(gifts[0]);

    // 再写祝福：礼物不受影响（重新生成替换祝福，礼物为另一次生成）
    const third = await repo.upsertSnapshot({ ...key, blessings: ['丙'] });
    expect(third.id).toBe(first.id);
    expect(third.blessings).toEqual(['丙']);
    expect(third.gifts).toHaveLength(2);
  });

  it('不同年份是互不影响的两行（当年固定、跨年重新生成）', async () => {
    await repo.upsertSnapshot({ ...birthdayKey(2026), blessings: ['今年'], status: 'success' });
    await repo.upsertSnapshot({ ...birthdayKey(2027), blessings: ['明年'], status: 'success' });

    const s2026 = (await repo.getSnapshot(birthdayKey(2026)))!;
    const s2027 = (await repo.getSnapshot(birthdayKey(2027)))!;
    expect(s2026.blessings).toEqual(['今年']);
    expect(s2027.blessings).toEqual(['明年']);
    expect(s2026.id).not.toBe(s2027.id);
  });

  it('通用节日（无人）快照可正常写入与读回', async () => {
    const saved = await repo.upsertSnapshot({
      ...festivalKey,
      gifts,
      status: 'success',
    });
    expect(saved.personId).toBeNull();
    expect(saved.festivalCode).toBe('christmas');
    const read = (await repo.getSnapshot(festivalKey))!;
    expect(read.gifts).toHaveLength(2);
  });

  it('updateSnapshot 按 id 改祝福；id 不存在时抛错', async () => {
    const saved = await repo.upsertSnapshot({ ...birthdayKey(2026), gifts, status: 'success' });
    const updated = await repo.updateSnapshot(saved.id, { blessings: ['新祝福'], failCount: 0 });
    expect(updated.blessings).toEqual(['新祝福']);
    expect(updated.gifts).toHaveLength(2);

    await expect(repo.updateSnapshot('not-exist', { status: 'failed' })).rejects.toBeTruthy();
  });
});

describe('贺卡状态：模板 / 选中下标 / 手写文字三者互不覆盖', () => {
  it('首次写入默认下标；后续局部更新只动传入字段，null 可显式清空手写', async () => {
    const key = birthdayKey(2026);
    const first = await repo.upsertCardState({ ...key, templateCode: 'mountain' });
    expect(first.selectedIndex).toBe(0);
    expect(first.editedText).toBeNull();

    const paged = await repo.upsertCardState({ ...key, templateCode: 'mountain', selectedIndex: 2 });
    expect(paged.templateCode).toBe('mountain');
    expect(paged.selectedIndex).toBe(2);
    expect(paged.editedText).toBeNull();

    const handwritten = await repo.upsertCardState({
      ...key,
      templateCode: 'mountain',
      editedText: '我的手写祝福',
    });
    expect(handwritten.selectedIndex).toBe(2); // 翻页下标不被手写覆盖
    expect(handwritten.editedText).toBe('我的手写祝福');

    const switched = await repo.upsertCardState({ ...key, templateCode: 'night' });
    expect(switched.templateCode).toBe('night');
    expect(switched.selectedIndex).toBe(2); // 换模板不丢下标与手写
    expect(switched.editedText).toBe('我的手写祝福');

    const reverted = await repo.upsertCardState({
      ...key,
      templateCode: 'night',
      editedText: null,
    });
    expect(reverted.editedText).toBeNull(); // null＝显式回到 AI 原文
    expect(reverted.selectedIndex).toBe(2);
  });
});

describe('收藏：快照完整保存、过滤与删除不影响原内容', () => {
  it('祝福/礼物两类收藏往返保存，list 可按 kind 过滤', async () => {
    await repo.addFavorite({
      kind: 'blessing',
      personId: null,
      personLabel: null,
      occasionType: 'festival',
      anniversaryId: null,
      festivalCode: 'christmas',
      occasionName: '圣诞节',
      year: 2026,
      payload: { text: '圣诞快乐' },
    });
    await repo.addFavorite({
      kind: 'gift',
      personId: null,
      personLabel: null,
      occasionType: 'festival',
      anniversaryId: null,
      festivalCode: 'christmas',
      occasionName: '圣诞节',
      year: 2026,
      payload: gifts[0],
    });

    const blessings = await repo.listFavorites({ kind: 'blessing' });
    expect(blessings).toHaveLength(1);
    expect(blessings[0].payload).toEqual({ text: '圣诞快乐' });
    expect(blessings[0].occasionName).toBe('圣诞节');

    const giftsOnly = await repo.listFavorites({ kind: 'gift' });
    expect(giftsOnly).toHaveLength(1);
    expect(giftsOnly[0].payload).toEqual(gifts[0]);
    expect((await repo.listFavorites())).toHaveLength(2);
  });

  it('允许重复收藏（无唯一约束）；取消收藏不碰心意快照', async () => {
    await repo.upsertSnapshot({ ...festivalKey, blessings: ['原祝福'], status: 'success' });
    const input = {
      kind: 'blessing' as const,
      personId: null,
      personLabel: null,
      occasionType: 'festival' as const,
      anniversaryId: null,
      festivalCode: 'christmas' as const,
      occasionName: '圣诞节',
      year: 2026,
      payload: { text: '圣诞快乐' },
    };
    const f1 = await repo.addFavorite(input);
    await repo.addFavorite(input);
    expect((await repo.listFavorites())).toHaveLength(2);

    await repo.removeFavorite(f1.id);
    expect((await repo.listFavorites())).toHaveLength(1);
    expect(await repo.getFavorite(f1.id)).toBeNull();
    // 原快照仍在
    expect((await repo.getSnapshot(festivalKey))!.blessings).toEqual(['原祝福']);
  });
});

describe('已送出：业务键幂等更新、撤销、年序与流水 JOIN', () => {
  it('同人同日子同年同 kind 重复标记只更新不新增；撤销按行删除', async () => {
    const person = await fullRepo.createPerson({
      name: '李明',
      relation: '挚友',
      birthdayMonth: 5,
      birthdayDay: 20,
      birthYear: 1990,
      salutation: null,
      signature: null,
    });
    // 显式列出必填外键列（OccasionKey 中它们是可选，SentRecordCreate 要求非 undefined）
    const key = {
      personId: person.id,
      occasionType: 'birthday' as const,
      anniversaryId: null,
      festivalCode: null,
      year: 2026,
    };

    const first = await repo.markSent({ ...key, kind: 'blessing', payload: { text: '旧文案' } });
    const again = await repo.markSent({ ...key, kind: 'blessing', payload: { text: '新文案' } });
    expect(again.id).toBe(first.id);
    const list = await repo.listSentRecords({
      personId: person.id,
      occasionType: 'birthday',
      anniversaryId: null,
      festivalCode: null,
    });
    expect(list).toHaveLength(1);
    expect(list[0].payload).toEqual({ text: '新文案' });
    // 列对齐回归（T57 夜修复）：marked_at 必须是时间戳、匿名行 user_id 必须为 NULL，
    // 不能再出现 scopeUserId 误插进 marked_at 的错位
    expect(typeof list[0].markedAt).toBe('string');
    expect(list[0].userId).toBeNull();

    await repo.markSent({ ...key, kind: 'gift', payload: gifts[0] });
    expect(
      (
        await repo.listSentRecords({
          personId: person.id,
          occasionType: 'birthday',
          anniversaryId: null,
          festivalCode: null,
        })
      ).length,
    ).toBe(2);

    await repo.unmarkSent(first.id);
    expect(await repo.getSentRecord(first.id)).toBeNull();
  });

  it('listSentRecords 年份倒序；流水行 JOIN 出人员姓名', async () => {
    const person = await fullRepo.createPerson({
      name: '王芳',
      relation: '家人',
      birthdayMonth: 8,
      birthdayDay: 1,
      birthYear: null,
      salutation: '妈妈',
      signature: null,
    });
    const base = {
      personId: person.id,
      occasionType: 'birthday' as const,
      anniversaryId: null,
      festivalCode: null,
      kind: 'blessing' as const,
      payload: { text: 'x' },
    };
    await repo.markSent({ ...base, year: 2025 });
    await repo.markSent({ ...base, year: 2026 });

    const list = await repo.listSentRecords({
      personId: person.id,
      occasionType: 'birthday',
      anniversaryId: null,
      festivalCode: null,
    });
    expect(list.map((row) => row.year)).toEqual([2026, 2025]);

    const timeline = await repo.listSentTimeline();
    expect(timeline).toHaveLength(2);
    expect(timeline[0].personName).toBe('王芳');
    expect(timeline[0].personSalutation).toBe('妈妈');
    expect(timeline[0].record.year).toBe(2026);
  });
});

describe('账号作用域隔离（T56）：匿名行与账号缓存行互不可见', () => {
  it('同一业务键在 null 与具体账号下是两行，收藏也按账号过滤', async () => {
    const anon = new SqliteContentRepository(db, null);
    const user = new SqliteContentRepository(db, 'user-123');
    // 用无人的通用节日键，规避 person 行本身也按账号归属的问题
    const key: OccasionKey = festivalKey;

    await anon.upsertSnapshot({ ...key, blessings: ['匿名版'], status: 'success' });
    expect(await user.getSnapshot(key)).toBeNull();

    await user.upsertSnapshot({ ...key, blessings: ['账号版'], status: 'success' });
    expect((await anon.getSnapshot(key))!.blessings).toEqual(['匿名版']);
    expect((await user.getSnapshot(key))!.blessings).toEqual(['账号版']);

    await anon.addFavorite({
      kind: 'blessing',
      personId: null,
      personLabel: null,
      occasionType: 'festival',
      anniversaryId: null,
      festivalCode: 'christmas',
      occasionName: '圣诞节',
      year: 2026,
      payload: { text: '匿名收藏' },
    });
    expect((await anon.listFavorites())).toHaveLength(1);
    expect((await user.listFavorites())).toHaveLength(0);
  });
});
