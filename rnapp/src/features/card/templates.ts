/**
 * 内置贺卡模板注册表（T43；门禁 G-D8 + A3 已于 2026-11-01 拍板）。
 *
 * 固定三套模板（spec 第 10 条「不少于三套、风格明显不同」），命名与
 * design/prototype.html 贺卡屏图注一致：
 *   远山（天青，浅底深字）/ 月夜（深青，深底白字）/ 暖阳（蜜蜡，暖底深字）。
 * 三套素材为开发期用火山引擎 doubao-seedream 生成的「纯背景插画」，
 * 横版 2560×1568（门禁 A3），打包进 assets/cards；App 运行时不调用任何
 * 图像生成服务（贺卡仍按 spec 第 10 条由模板与祝福在本机组合，见 plan.md 选型注记）。
 * 画面上的称呼、祝福、落款、日期圈与邮票框均为 T44 在本机叠加，不烘焙进素材。
 *
 * 本文件只登记代号、展示名与背景素材；图文本机组合渲染在 T44，导出在 T46。
 */

/** 内置模板代号；落库 card_states.template_code（entities 以 string 存储） */
export type CardTemplateCode = 'mountain' | 'night' | 'warm';

/** 内置模板定义：代号 + 切换器展示名 + 横版背景素材 */
export interface CardTemplateDef {
  code: CardTemplateCode;
  /** 模板切换器中的中文展示名：远山 / 月夜 / 暖阳 */
  name: string;
  /**
   * 横版纯背景插画（见 CARD_ART_SIZE）。
   * Metro 静态 require：运行时解析为图片资源引用（number）。
   */
  art: number;
}

/**
 * 门禁 A3 拍板的模板画布：横版 2560×1568（比例 80:49，
 * 与设计稿贺卡艺术区 320:196 严格同比）。素材按此画布出图，
 * T44 按此比例布局、T46 view-shot 按此比例导出。
 */
export const CARD_ART_SIZE = {
  width: 2560,
  height: 1568,
} as const;

/** 内置模板，顺序即切换器从左到右的固定顺序 */
export const CARD_TEMPLATES: readonly CardTemplateDef[] = [
  {
    code: 'mountain',
    name: '远山',
    art: require('../../assets/cards/mountain.jpg'),
  },
  {
    code: 'night',
    name: '月夜',
    art: require('../../assets/cards/night.jpg'),
  },
  {
    code: 'warm',
    name: '暖阳',
    art: require('../../assets/cards/warm.jpg'),
  },
];

/** 进详情首次自动组合时的默认模板（card_states.template_code 初值） */
export const DEFAULT_CARD_TEMPLATE: CardTemplateCode = 'mountain';

const TEMPLATE_BY_CODE: Readonly<Record<CardTemplateCode, CardTemplateDef>> = Object.fromEntries(
  CARD_TEMPLATES.map((tpl) => [tpl.code, tpl]),
) as Record<CardTemplateCode, CardTemplateDef>;

/** 按代号取模板；未知代号（理论上不应出现）回退默认模板，保证渲染不崩 */
export function getCardTemplate(code: string | null | undefined): CardTemplateDef {
  if (code && code in TEMPLATE_BY_CODE) {
    return TEMPLATE_BY_CODE[code as CardTemplateCode];
  }
  return TEMPLATE_BY_CODE[DEFAULT_CARD_TEMPLATE];
}
