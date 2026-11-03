/**
 * 收藏装配 / 还原纯函数单测（M10 T48/T49）。
 * 重点：通用版节日的对象标签固定为「通用（未指定人）」；具体人用「姓名（关系）」；
 * 贺卡导出日期能按收藏行的日子定位字段 ＋ year 重新派生（节日同步、生日查人）。
 */
import type { Anniversary, Person } from '../../data/entities';
import {
  GENERIC_PERSON_LABEL,
  buildFavoriteCreate,
  favoriteCardDate,
  favoriteMetaLine,
  personLabelFor,
} from './restore';

declare const describe: (name: string, fn: () => void) => void;
declare const it: (name: string, fn: () => void | Promise<void>) => void;
declare const expect: any;

const person = {
  id: 'p1',
  name: '张伟',
  relation: '客户',
  birthdayMonth: 11,
  birthdayDay: 1,
} as Person;

describe('personLabelFor', () => {
  it('具体人为「姓名（关系）」', () => {
    expect(personLabelFor(person)).toBe('张伟（客户）');
  });
  it('无人（通用版节日）为固定通用文案', () => {
    expect(personLabelFor(null)).toBe(GENERIC_PERSON_LABEL);
    expect(GENERIC_PERSON_LABEL).toBe('通用（未指定人）');
  });
});

describe('buildFavoriteCreate', () => {
  it('把日子作用域与快照装配成待写入对象，定位字段可空', () => {
    const created = buildFavoriteCreate(
      {
        key: { occasionType: 'festival', personId: null, anniversaryId: null, festivalCode: 'mothers_day', year: 2026 },
        personLabel: GENERIC_PERSON_LABEL,
        occasionName: '母亲节',
      },
      'blessing',
      { text: '节日快乐' },
    );
    expect(created).toMatchObject({
      kind: 'blessing',
      personId: null,
      personLabel: '通用（未指定人）',
      occasionType: 'festival',
      festivalCode: 'mothers_day',
      anniversaryId: null,
      occasionName: '母亲节',
      year: 2026,
    });
    expect(created.payload).toEqual({ text: '节日快乐' });
  });
});

describe('favoriteMetaLine', () => {
  it('拼出「为 谁 · 日子 · 年份收藏」，personLabel 缺失时回退通用文案', () => {
    expect(
      favoriteMetaLine({ personLabel: '张伟（客户）', occasionName: '生日', year: 2026 }),
    ).toBe('为 张伟（客户） · 生日 · 2026 年收藏');
    expect(favoriteMetaLine({ personLabel: null, occasionName: '母亲节', year: 2026 })).toBe(
      '为 通用（未指定人） · 母亲节 · 2026 年收藏',
    );
  });
});

describe('favoriteCardDate', () => {
  // repo 仅在生日 / 纪念日分支使用；节日分支不应发起查询
  const unusedRepo = {
    getPerson: async () => {
      throw new Error('节日不应查人');
    },
    listAnniversaries: async (): Promise<Anniversary[]> => {
      throw new Error('节日不应查纪念日');
    },
  };

  it('节日：按 year 直接派生（2026 母亲节＝5 月 10 日）', async () => {
    const date = await favoriteCardDate(unusedRepo, {
      occasionType: 'festival',
      personId: null,
      anniversaryId: null,
      festivalCode: 'mothers_day',
      year: 2026,
    });
    expect(date).toBe('2026年5月10日');
  });

  it('生日：用收藏行 year ＋ 档案里的月日派生', async () => {
    const repo = { getPerson: async () => person, listAnniversaries: async () => [] };
    const date = await favoriteCardDate(repo, {
      occasionType: 'birthday',
      personId: 'p1',
      anniversaryId: null,
      festivalCode: null,
      year: 2030,
    });
    expect(date).toBe('2030年11月1日');
  });

  it('纪念日：从该人的纪念日列表中找到对应月日', async () => {
    const anniv = { id: 'a1', month: 11, day: 3 } as Anniversary;
    const repo = { getPerson: async () => person, listAnniversaries: async () => [anniv] };
    const date = await favoriteCardDate(repo, {
      occasionType: 'anniversary',
      personId: 'p1',
      anniversaryId: 'a1',
      festivalCode: null,
      year: 2026,
    });
    expect(date).toBe('2026年11月3日');
  });
});
