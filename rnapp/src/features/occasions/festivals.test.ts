/**
 * 节日常量单元测试（T40 补）：重点覆盖浮动星期节日的中文规则描述，
 * 母亲节 / 父亲节 / 感恩节的「月第 N 个星期 X」映射最容易写错。
 * 工程未引入 @types/jest，此处仅声明最小测试全局类型。
 */
import { festivalRuleLabel, FESTIVALS } from './festivals';

declare const describe: (name: string, fn: () => void) => void;
declare const it: (name: string, fn: () => void) => void;
declare const expect: any;

describe('festivalRuleLabel', () => {
  it('固定公历日期节日不显示星期规则后缀', () => {
    expect(festivalRuleLabel('new_year')).toBeNull();
    expect(festivalRuleLabel('valentines_day')).toBeNull();
    expect(festivalRuleLabel('christmas')).toBeNull();
  });

  it('浮动星期节日返回口语化规则', () => {
    expect(festivalRuleLabel('mothers_day')).toBe('五月第二个星期日');
    expect(festivalRuleLabel('fathers_day')).toBe('六月第三个星期日');
    expect(festivalRuleLabel('thanksgiving')).toBe('十一月第四个星期四');
  });

  it('规则描述的「星期几 / 第几个」与 dateOf 实际日期一致（2026 年）', () => {
    const checks = [
      { code: 'mothers_day' as const, weekday: 0, nth: 2 },
      { code: 'fathers_day' as const, weekday: 0, nth: 3 },
      { code: 'thanksgiving' as const, weekday: 4, nth: 4 },
    ];
    for (const { code, weekday, nth } of checks) {
      const dateStr = FESTIVALS.find((f) => f.code === code)!.dateOf(2026);
      const day = Number(dateStr.slice(8, 10));
      // dateOf 返回 UTC 日期，用 UTC 取星期几；落在该月第几个该星期为 ceil(day/7)
      expect(new Date(`${dateStr}T00:00:00Z`).getUTCDay()).toBe(weekday);
      expect(Math.ceil(day / 7)).toBe(nth);
    }
  });
});
