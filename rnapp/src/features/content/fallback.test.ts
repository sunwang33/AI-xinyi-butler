/**
 * 通用兜底祝福单测（T34）：条数、节日名替换、不针对个人、上限 10 条（超池长循环）。
 */
import { pickFallbackBlessings } from './fallback';

declare const describe: (name: string, fn: () => void) => void;
declare const it: (name: string, fn: () => void) => void;
declare const expect: any;

describe('pickFallbackBlessings', () => {
  it('按设置条数返回，默认生日场景不出现年龄', () => {
    const list = pickFallbackBlessings('birthday', 3);
    expect(list).toHaveLength(3);
    expect(new Set(list).size).toBe(3);
    list.forEach((text) => {
      expect(text).not.toMatch(/\d+\s*岁/);
    });
  });

  it('节日兜底替换节日名', () => {
    const list = pickFallbackBlessings('festival', 2, '元旦');
    expect(list.length).toBeGreaterThan(0);
    expect(list.join('')).toContain('元旦');
  });

  it('未给节日名时用「节日」泛称，不出现 undefined', () => {
    const list = pickFallbackBlessings('festival', 1);
    expect(list[0]).toContain('节日');
    expect(list[0]).not.toContain('undefined');
  });

  it('纪念日兜底不杜撰具体周年数', () => {
    const list = pickFallbackBlessings('anniversary', 2);
    list.forEach((text) => {
      expect(text).not.toMatch(/[一二三四五六七八九十\d]+周年/);
    });
  });

  it('条数与设置对齐：1–10 如实返回，超过 10 截断，0 兜底为 1', () => {
    // 池子只有 6 条：取 10 条时循环补足，允许前 4 条与池首重复
    const ten = pickFallbackBlessings('birthday', 10);
    expect(ten).toHaveLength(10);
    expect(ten.slice(0, 6)).toEqual(pickFallbackBlessings('birthday', 6));
    expect(ten[6]).toBe(ten[0]);
    expect(pickFallbackBlessings('birthday', 30)).toHaveLength(10);
    expect(pickFallbackBlessings('birthday', 0)).toHaveLength(1);
  });
});
