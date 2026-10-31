/**
 * buildContentContext 单测（M6 T30）：
 * 特征排序、纪念日周年数（year - startYear）、通用版节日 person=null、不收姓名。
 */
import { buildContentContext } from './context';
import type { Anniversary, Person, Trait } from '../../data/entities';

// 工程未引入 @types/jest，沿用既有 *.test.ts 的最小测试全局声明
declare const describe: (name: string, fn: () => void) => void;
declare const it: (name: string, fn: () => void) => void;
declare const expect: any;

const person: Person = {
  id: 'p1',
  name: '张伟',
  relation: '客户',
  birthdayMonth: 3,
  birthdayDay: 4,
  birthYear: 1980,
  salutation: '王总',
  signature: null,
  userId: null,
  createdAt: '',
  updatedAt: '',
  deleted: false,
};

const traits: Trait[] = [
  { id: 't2', personId: 'p1', content: '爱喝茶', position: 1, userId: null, createdAt: '', updatedAt: '', deleted: false },
  { id: 't1', personId: 'p1', content: '马拉松爱好者', position: 0, userId: null, createdAt: '', updatedAt: '', deleted: false },
];

describe('buildContentContext', () => {
  it('生日上下文：按 position 排序特征，不带出生年份与姓名', () => {
    const ctx = buildContentContext({
      occasionType: 'birthday',
      person,
      traits,
      year: 2026,
    });
    expect(ctx.occasion.type).toBe('birthday');
    expect(ctx.person?.relation).toBe('客户');
    expect(ctx.person?.traits).toEqual(['马拉松爱好者', '爱喝茶']);
    expect(ctx.person?.salutation).toBe('王总');
    expect(JSON.stringify(ctx)).not.toContain('张伟');
    expect(JSON.stringify(ctx)).not.toContain('1980');
  });

  it('纪念日：填了起始年份时输出周年数', () => {
    const anniversary: Anniversary = {
      id: 'a1',
      personId: 'p1',
      name: '合作纪念日',
      month: 6,
      day: 1,
      startYear: 2021,
      userId: null,
      createdAt: '',
      updatedAt: '',
      deleted: false,
    };
    const ctx = buildContentContext({
      occasionType: 'anniversary',
      person,
      traits: [],
      anniversary,
      year: 2026,
    });
    expect(ctx.occasion.anniversaryName).toBe('合作纪念日');
    expect(ctx.occasion.anniversaryYears).toBe(5);
  });

  it('纪念日未填起始年份时不杜撰周年数', () => {
    const anniversary: Anniversary = {
      id: 'a2',
      personId: 'p1',
      name: '乔迁',
      month: 5,
      day: 2,
      startYear: null,
      userId: null,
      createdAt: '',
      updatedAt: '',
      deleted: false,
    };
    const ctx = buildContentContext({
      occasionType: 'anniversary',
      person,
      traits: [],
      anniversary,
      year: 2026,
    });
    expect(ctx.occasion.anniversaryYears).toBeUndefined();
  });

  it('通用版节日：person 为 null，带节日名', () => {
    const ctx = buildContentContext({
      occasionType: 'festival',
      person: null,
      traits: [],
      festivalName: '母亲节',
      festivalCode: 'mothers_day',
      year: 2027,
    });
    expect(ctx.person).toBeNull();
    expect(ctx.occasion.festivalName).toBe('母亲节');
    expect(ctx.occasion.festivalCode).toBe('mothers_day');
  });
});
