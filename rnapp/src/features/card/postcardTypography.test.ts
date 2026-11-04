/**
 * 贺卡祝福字号分档单测（T77）：按去空白后的字数在四档之间切换，
 * 边界为 16/30/48 字（2026-11-03 真机反馈后第二次拍板的档位）。
 */
/** @jest-environment node */
import { fontSize } from '../../theme/tokens';
import { wishTypography } from './Postcard';

declare const describe: (name: string, fn: () => void) => void;
declare const it: (name: string, fn: () => void) => void;
declare const expect: any;

describe('wishTypography · 超长祝福分档缩字', () => {
  it('0–16 字：最大档（title1 / 行高 44）', () => {
    expect(wishTypography(0)).toEqual({ size: fontSize.title1, lineHeight: 44 });
    expect(wishTypography(16)).toEqual({ size: fontSize.title1, lineHeight: 44 });
  });

  it('17–30 字：第二档（title2 / 行高 37）', () => {
    expect(wishTypography(17)).toEqual({ size: fontSize.title2, lineHeight: 37 });
    expect(wishTypography(30)).toEqual({ size: fontSize.title2, lineHeight: 37 });
  });

  it('31–48 字：第三档（title3 / 行高 31）', () => {
    expect(wishTypography(31)).toEqual({ size: fontSize.title3, lineHeight: 31 });
    expect(wishTypography(48)).toEqual({ size: fontSize.title3, lineHeight: 31 });
  });

  it('49 字以上（80 字硬上限）：统一最小档不再继续缩（rowTitle / 行高 29）', () => {
    expect(wishTypography(49)).toEqual({ size: fontSize.rowTitle, lineHeight: 29 });
    expect(wishTypography(80)).toEqual({ size: fontSize.rowTitle, lineHeight: 29 });
  });
});
