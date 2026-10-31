/**
 * 电商搜索链接单测（T38，D7/A1 2026-10-31 拍板）：
 * 固定淘宝+京东两个平台、搜索词经 URL 编码、指向搜索结果页而非首页。
 */
import { GIFT_PLATFORMS } from './link';

declare const describe: (name: string, fn: () => void) => void;
declare const it: (name: string, fn: () => void) => void;
declare const expect: any;

describe('gift link', () => {
  it('固定两个平台：淘宝、京东', () => {
    expect(GIFT_PLATFORMS.map((p) => p.code)).toEqual(['taobao', 'jd']);
  });

  it('淘宝链接为搜索结果页且编码中文搜索词', () => {
    const url = GIFT_PLATFORMS[0].buildUrl('妈妈 颈椎 按摩仪');
    expect(url).toContain('s.taobao.com/search');
    expect(url).toContain('q=');
    expect(url).toContain(encodeURIComponent('妈妈 颈椎 按摩仪'));
    expect(url).not.toBe('https://s.taobao.com/');
  });

  it('京东链接为移动搜索域名且编码中文关键词（PC 域名会丢词/跳风控）', () => {
    const url = GIFT_PLATFORMS[1].buildUrl('客户 商务 钢笔');
    expect(url).toContain('so.m.jd.com/ware/search.action');
    expect(url).toContain('keyword=');
    expect(url).toContain(encodeURIComponent('客户 商务 钢笔'));
    expect(url).not.toContain('search.jd.com');
  });
});
