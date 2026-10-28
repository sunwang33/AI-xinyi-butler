/**
 * 设计令牌（视觉规范 D10 已拍板）
 * 严格对应 design/prototype.html 中 :root 的视觉变量：
 * 天青底、信纸白、松墨、松绿、蜜蜡、苔绿；宋体标题、正文黑体、贺卡祝福手写体。
 */

export const colors = {
  /** 天青底：App 页面底色 */
  mist: '#E9F0EB',
  mistDeep: '#DCE7E0',
  /** 信纸白：卡片 / 输入框 / 标签栏底色 */
  paper: '#FBFCF8',
  paperDim: '#F3F7F3',
  /** 松墨：主文字色 */
  ink: '#26332B',
  inkSoft: '#5E6E63',
  inkFaint: '#8FA196',
  /** 松绿：主操作色 */
  pine: '#356453',
  pineDeep: '#274C3E',
  /** 苔绿：分隔线、未选中控件 */
  sage: '#BFD0C5',
  sageSoft: '#D8E4DC',
  /** 蜜蜡：邮戳 / 红点 / 强调（spec 所称“红点”在本视觉体系中落为蜜蜡色） */
  honey: '#C98F3D',
  honeyDeep: '#A9732C',
  honeyWash: '#F2E6CE',
  /** 月夜模板深青（非黑） */
  night: '#23453F',
  /** 卡片描边 */
  line: '#D2DFD6',
  white: '#FFFFFF',
  /** 弹层遮罩 */
  mask: 'rgba(24, 38, 31, 0.42)',
} as const;

/** 字体族；字体在根布局 app/_layout.tsx 经 expo-font 加载 */
export const fonts = {
  /** 宋体标题（半粗） */
  serif: 'NotoSerifSC_600SemiBold',
  serifRegular: 'NotoSerifSC_400Regular',
  /** 正文黑体 */
  sans: 'NotoSansSC_400Regular',
  sansMedium: 'NotoSansSC_500Medium',
  /** 贺卡祝福手写体 */
  hand: 'MaShanZheng_400Regular',
  /** 数字 / 英文装饰字体 */
  num: 'CormorantGaramond_600SemiBold',
  numItalic: 'CormorantGaramond_500Medium_Italic',
} as const;

export const fontSize = {
  caption: 10.5,
  footnote: 11.5,
  small: 12,
  body: 13,
  base: 14,
  rowTitle: 16.5,
  title3: 18,
  title2: 21,
  title1: 24,
  display: 32,
} as const;

export const radius = {
  sm: 7,
  md: 12,
  lg: 14,
  sheet: 22,
  pill: 999,
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
} as const;

export type AppColor = keyof typeof colors;
