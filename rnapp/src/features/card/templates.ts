/**
 * 内置贺卡模板注册表（T43；门禁 G-D8 + A3 于 2026-11-01 首版拍板，
 * 2026-11-02 重开——改为竖版写实氛围摄影）。
 *
 * 固定三套模板（spec 第 10 条「不少于三套、风格明显不同」），不按日子分组、
 * 对生日 / 纪念日 / 节日通用。2026-11-02 起：
 *   - 画布由横版 2560×1568 改为**竖版 3:4（1860×2480，门禁 A3 新结论）**，
 *     这是火山 seedream 单图面积上限 4,624,220 像素下 3:4 的最大整数比；
 *   - 素材由「淡水彩山水纯背景」改为「写实氛围摄影」（门禁 D8 新结论）：
 *     暖光窗景 / 柔光花卉 / 静谧夜色一类质感照片，全部压暗到足以承载白字；
 *   - 画面上的日子名、称呼、祝福、日期、落款仍由 RN 端叠加，不烘焙进素材，
 *     可读性由 Postcard 的本机柔暗渐变保证（不引入渐变原生依赖）。
 *
 * 内部代号沿用 `mountain`/`night`/`warm` 与 assets/cards 下同名文件，
 * 因此 card_states 里已存的 template_code 无需迁移，老选择会直接落到新图。
 * 展示名为暂定，T43 重做出图后可随成品微调（仅是字符串）。
 *
 * App 运行时不调用任何图像生成服务（贺卡仍按 spec 第 10 条由模板与祝福在本机
 * 组合，见 plan.md 选型注记与记忆 volc-seedream-card-art）。
 * 本文件只登记代号、展示名、背景素材与叠加文字配色；图文本机组合渲染在 T44，导出在 T46。
 */
import { colors } from '../../theme/tokens';

/** 内置模板代号；落库 card_states.template_code（entities 以 string 存储） */
export type CardTemplateCode = 'mountain' | 'night' | 'warm';

/** 内置模板定义：代号 + 切换器展示名 + 竖版背景素材 + 本机叠加层配色 */
export interface CardTemplateDef {
  code: CardTemplateCode;
  /** 模板切换器中的中文展示名 */
  name: string;
  /**
   * 竖版写实氛围摄影素材（见 CARD_ART_SIZE）。
   * Metro 静态 require：运行时解析为图片资源引用（number）。
   */
  art: number;
  /** 称呼 / 祝福 / 落款文字色（三套均为压暗摄影底，统一白字） */
  ink: string;
}

/**
 * 门禁 A3（2026-11-02 重开）拍板的模板画布：竖版 3:4，1860×2480。
 * 素材按此画布出图，T44 按此比例布局、T46 view-shot 按此比例导出。
 */
export const CARD_ART_SIZE = {
  width: 1860,
  height: 2480,
} as const;

/** 内置模板，顺序即切换器从左到右的固定顺序 */
export const CARD_TEMPLATES: readonly CardTemplateDef[] = [
  {
    code: 'mountain',
    // 柔光白日（花事 / 晴光氛围）
    name: '晴光',
    art: require('../../../assets/cards/mountain.jpg'),
    ink: colors.white,
  },
  {
    code: 'night',
    // 静谧夜色（窗灯 / 夜灯氛围）
    name: '夜色',
    art: require('../../../assets/cards/night.jpg'),
    ink: colors.white,
  },
  {
    code: 'warm',
    // 暖光室内（烛光 / 餐桌氛围）
    name: '暖庐',
    art: require('../../../assets/cards/warm.jpg'),
    ink: colors.white,
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
