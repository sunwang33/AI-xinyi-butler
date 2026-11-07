/**
 * 贺卡文案画面净化单测（2026-11-07 真机发现的两类重复，方案 A）：
 * ① stripLeadingSalutation 剥离开场称呼（与左上抬头重复）
 * ② stripTrailingSignature 剥离末尾「——自称」落款行（与右下署名重复）
 * 两函数都只作用于 Postcard 渲染派生，存储/复制的祝福原文一律不改。
 * 2026-11-07 拍板：AI 文案与手写文案同规则（手写弹层预填 AI 原文直接保存时，
 * 不净化会与贺卡抬头/署名重复），三个 Postcard 渲染点统一套用。
 */
import {
  stripLeadingSalutation,
  stripTrailingSignature,
} from './Postcard';

declare const describe: (name: string, fn: () => void) => void;
declare const it: (name: string, fn: () => void) => void;
declare const expect: any;

describe('stripLeadingSalutation · 开场称呼剥离', () => {
  it('真机原文：中文逗号开场，剥掉抬头与标点后从「毕业典礼」起头，尾部落款不动', () => {
    const wish = '测试大佬，毕业典礼十九周年快乐！愿友情永远不丢档。\n——人生不设限';
    expect(stripLeadingSalutation(wish, '测试大佬')).toBe(
      '毕业典礼十九周年快乐！愿友情永远不丢档。\n——人生不设限',
    );
  });

  it('英文逗号（含后续空格）、冒号、顿号及标点后换行/空白都可剥离', () => {
    expect(stripLeadingSalutation('测试大佬, happy birthday', '测试大佬')).toBe(
      'happy birthday',
    );
    expect(stripLeadingSalutation('测试大佬：你好呀', '测试大佬')).toBe('你好呀');
    expect(stripLeadingSalutation('测试大佬、生日快乐', '测试大佬')).toBe('生日快乐');
    expect(stripLeadingSalutation('测试大佬：\n  生日快乐', '测试大佬')).toBe('生日快乐');
  });

  it('前缀但非标点承接：不剥离，防「大佬」误伤「大佬们好」', () => {
    expect(stripLeadingSalutation('大佬们好，生日快乐', '大佬')).toBe('大佬们好，生日快乐');
    expect(stripLeadingSalutation('测试大佬本人启', '测试大佬')).toBe('测试大佬本人启');
  });

  it('称呼不在开头、无抬头通用版、无祝福 null、空串：原样或 null 返回', () => {
    const wish = '祝你快乐，测试大佬，新的一岁顺顺利利';
    expect(stripLeadingSalutation(wish, '测试大佬')).toBe(wish);
    expect(stripLeadingSalutation('节日快乐，万事顺意', null)).toBe('节日快乐，万事顺意');
    expect(stripLeadingSalutation(null, '测试大佬')).toBeNull();
    expect(stripLeadingSalutation('', '测试大佬')).toBe('');
  });

  it('整条只有称呼（剥后为空）：不剥；抬头带空白也能 trim 匹配', () => {
    expect(stripLeadingSalutation('测试大佬，', '测试大佬')).toBe('测试大佬，');
    expect(stripLeadingSalutation('测试大佬: ', '测试大佬')).toBe('测试大佬: ');
    expect(stripLeadingSalutation('测试大佬，生日快乐', '  测试大佬  ')).toBe('生日快乐');
  });
});

describe('stripTrailingSignature · 尾部落款剥离', () => {
  it('真机原文：独立成行的 em-dash 落款被剥，正文保留', () => {
    const wish = '毕业典礼十九周年快乐！愿友情永远不丢档。\n——人生不设限';
    expect(stripTrailingSignature(wish, '人生不设限')).toBe(
      '毕业典礼十九周年快乐！愿友情永远不丢档。',
    );
  });

  it('连字符/en-dash/双 em-dash 变体都识别', () => {
    expect(stripTrailingSignature('正文内容\n-人生不设限', '人生不设限')).toBe('正文内容');
    expect(stripTrailingSignature('正文内容\n– 人生不设限', '人生不设限')).toBe('正文内容');
    expect(stripTrailingSignature('正文内容\n—— 人生不设限', '人生不设限')).toBe('正文内容');
  });

  it('落款带末尾标点也剥；落款行前后空白不影响', () => {
    expect(stripTrailingSignature('正文内容。\n——人生不设限。', '人生不设限')).toBe(
      '正文内容。',
    );
    expect(stripTrailingSignature('正文内容。\n  ——人生不设限  \n\n', '人生不设限')).toBe(
      '正文内容。',
    );
  });

  it('自称出现在正文中间而非末行：不剥，防误伤', () => {
    const wish = '人生不设限是你常说的话，生日快乐。\n——朋友';
    expect(stripTrailingSignature(wish, '人生不设限')).toBe(wish);
  });

  it('末行有破折号但文本不等于自称：不剥', () => {
    const wish = '正文内容\n——隔壁老王';
    expect(stripTrailingSignature(wish, '人生不设限')).toBe(wish);
  });

  it('整条祝福只有落款行、无 sign、无祝福 null：不剥或返回对应空态', () => {
    expect(stripTrailingSignature('——人生不设限', '人生不设限')).toBe('——人生不设限');
    expect(stripTrailingSignature('正文内容', null)).toBe('正文内容');
    expect(stripTrailingSignature(null, '人生不设限')).toBeNull();
  });

  it('自称含正则特殊字符也能字面匹配，不破坏正则', () => {
    expect(stripTrailingSignature('正文\n——A·B（测试）', 'A·B（测试）')).toBe('正文');
  });

  it('两函数组合：首尾各剥一次，中间正文与换行完整保留', () => {
    const wish = '测试大佬，毕业典礼十九周年快乐！愿友情永远不丢档。\n——人生不设限';
    const headed = stripLeadingSalutation(wish, '测试大佬');
    expect(stripTrailingSignature(headed, '人生不设限')).toBe(
      '毕业典礼十九周年快乐！愿友情永远不丢档。',
    );
  });
});
