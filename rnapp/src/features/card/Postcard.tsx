/**
 * 电子贺卡成品视图（M9 T44；T45 接入祝福翻页脚与点按编辑；2026-11-02 门禁重开后改竖版写实摄影）。
 * 纯展示，不读状态、不直接落库：按门禁 A3（新）竖版 3:4（1860:2480）铺满写实摄影
 * 背景，再在本机叠加——上部靠左手写体称呼、中部手写体祝福、右下角竖排落款（上为自称、
 * 下为本次日子完整日期）。
 * 2026-11-03 真机复验：顶部「日子名」小字（如「乔迁」）被开发者拍板移除——成品贺卡
 * 不写场合名，不自然；occasionLabel 链路一并删除（详见 tasks.md M9 门禁记录）。
 *
 * 可读性：摄影底图本身压暗，本机再叠一张柔暗遮罩 scrim-mask.png（顶/中/底三段
 * 停点烘焙进 alpha；不引入 expo-linear-gradient 等原生依赖），白字在任意模板上都清晰。
 * 初版用多个细条 View 插值模拟渐变，真机在连续摄影背景上有明显水平色带，2026-11-03
 * 改为窄条 PNG 经 GPU 双线性拉伸，平滑无 banding（见 .card-probe/gen_scrim.py）。
 *
 * 规则（spec 第 10 条）：
 * - 称呼 / 落款为 null 时整块不渲染、不留位（通用版节日无称呼；未填自称无落款）；
 * - wish 为 null 表示当年祝福快照尚不存在，按门禁 A2（留空、可手写）呈现浅色引导语；
 * - 祝福文字可点（onEditWish），进入手写编辑；footer 为艺术区下方白纸脚（翻页器+编辑药丸），
 *   纸脚是操作区，不属于成品画面——T46 导出截图只取艺术区，不含 footer。
 * - 超长祝福按 B 组「软上限 + 自适应缩小」依字数分档缩小，不截断、不溢出。
 *   竖版收窄后档位比横版更密（见 wishTypography）。
 * - 2026-11-02 起：右上邮票框/火苗、左上日期圆圈均已移除（见 tasks.md M9 门禁重开记录）。
 */
import { ComponentRef, ReactNode, Ref } from 'react';
import { Image, Pressable, Text, View } from 'react-native';
import { colors, fonts, fontSize, radius } from '../../theme/tokens';
import type { CardTemplateDef } from './templates';

/** 贺卡艺术区宿主节点类型（Fabric 下的公共根实例） */
export type CardArtHost = ComponentRef<typeof View>;

/**
 * 祝福字号分档（按去空白后的字数）：竖版较窄，档位更密，行高同步收窄防溢出。
 * 2026-11-03 真机两轮反馈长文案偏小（开发者：「字太小看着不舒服」），
 * 第二次拍板：49 字以上不再继续缩，统一 16.5px——80 字硬上限最多约 6 行，
 * 祝福区纵向余量充足，不压称呼与右下落款。
 */
export function wishTypography(length: number): { size: number; lineHeight: number } {
  if (length <= 16) return { size: fontSize.title1, lineHeight: 44 };
  if (length <= 30) return { size: fontSize.title2, lineHeight: 37 };
  if (length <= 48) return { size: fontSize.title3, lineHeight: 31 };
  return { size: fontSize.rowTitle, lineHeight: 29 };
}

export interface PostcardProps {
  template: CardTemplateDef;
  /** 右下落款区的完整日期，如「2026年11月3日」（排在自称下方） */
  dateFull: string;
  /** 称呼原文（不含冒号）；通用版无人传 null，整行不渲染 */
  to: string | null;
  /** 当前祝福文字；null 表示尚无祝福（A2：留空 + 引导） */
  wish: string | null;
  /** 角落落款原文；null 时整块不渲染、不留白 */
  sign: string | null;
  /** 无祝福时的浅色引导语（A2） */
  emptyHint?: string;
  /** 点按祝福文字（含空引导）进入手写编辑；不传则文字不可点 */
  onEditWish?: () => void;
  /** 艺术区下方白纸脚内容（祝福翻页器 + 编辑药丸）；操作区，不进 T46 导出图 */
  footer?: ReactNode;
  /**
   * 艺术区宿主 View 的 ref（T46 截图目标）。截图只取这层（摄影背景 +
   * 称呼/祝福/日期/落款，顶部永不渲染场合名），不含纸脚与外部按钮。ref 挂到普通宿主 View 上、
   * collapsable=false；外层卡片负责屏幕上的圆角裁剪，这层自身直角，截出的即满幅竖图。
   */
  artRef?: Ref<CardArtHost>;
}

export function Postcard({
  template,
  dateFull,
  to,
  wish,
  sign,
  emptyHint = '在这里写下你的祝福',
  onEditWish,
  footer,
  artRef,
}: PostcardProps) {
  // 摄影底统一白字，加柔和投影保证在亮部也能读
  const shadow = {
    textShadowColor: 'rgba(10,16,14,0.55)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 10,
  } as const;

  const wishType = wishTypography(wish ? wish.trim().length : 0);
  const editable = typeof onEditWish === 'function';

  return (
    <View
      style={{
        borderRadius: radius.lg,
        borderWidth: 1,
        borderColor: colors.line,
        overflow: 'hidden',
        backgroundColor: colors.mistDeep,
      }}
    >
      {/* T46 截图目标：普通宿主 View（直角、禁止折叠）；屏幕圆角由外层卡片裁剪 */}
      <View ref={artRef} collapsable={false} style={{ width: '100%', aspectRatio: 1860 / 2480 }}>
        {/* 写实摄影背景（绝对定位铺满，替代已弃用的 ImageBackground） */}
        <Image source={template.art} resizeMode="cover" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} />

        {/* 柔暗遮罩：顶部托起日子名/称呼，底部托起日期/落款，中部极轻压暗让祝福不糊；
            停点烘焙在 scrim-mask.png 中，stretch 由 GPU 平滑拉伸 */}
        <Image
          source={require('../../../assets/cards/scrim-mask.png')}
          resizeMode="stretch"
          pointerEvents="none"
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
        />

        {/* 文字层：上（称呼）／中（祝福）／下（日期+落款） */}
        <View
          pointerEvents="box-none"
          style={{ position: 'absolute', inset: 0, paddingHorizontal: 28, paddingTop: 34, paddingBottom: 26 }}
        >
          {to ? (
            <Text
              style={[
                {
                  fontFamily: fonts.hand,
                  fontSize: fontSize.title1,
                  color: template.ink,
                  // 2026-11-03 真机拍板：称呼靠左（不居中），符合真实贺卡抬头习惯
                  textAlign: 'left',
                  marginTop: 16,
                },
                shadow,
              ]}
            >
              {to}：
            </Text>
          ) : null}

          {/* 祝福居中可点：点 AI 文案或空引导都进手写编辑 */}
          <View style={{ flex: 1, justifyContent: 'center' }}>
            <Pressable
              onPress={onEditWish}
              disabled={!editable}
              hitSlop={{ top: 12, bottom: 12, left: 6, right: 6 }}
              accessibilityRole="button"
              accessibilityLabel="编辑贺卡祝福文字"
              style={({ pressed }) => ({ opacity: editable && pressed ? 0.7 : 1 })}
            >
              {wish ? (
                <Text
                  style={[
                    {
                      fontFamily: fonts.hand,
                      fontSize: wishType.size,
                      lineHeight: wishType.lineHeight,
                      color: template.ink,
                      textAlign: 'center',
                    },
                    shadow,
                  ]}
                >
                  {wish}
                </Text>
              ) : (
                <Text
                  style={[
                    {
                      fontFamily: fonts.hand,
                      fontSize: fontSize.title2,
                      lineHeight: 38,
                      color: template.ink,
                      textAlign: 'center',
                      opacity: 0.55,
                    },
                    shadow,
                  ]}
                >
                  {emptyHint}
                </Text>
              )}
            </Pressable>
          </View>

          {/* 右下落款区：上为自称、下为完整日期（2026-11-03 真机拍板，日期从左下
              挪到自称下方，符合真实贺卡署名在上、日期在下的惯例）；无自称时仅日期 */}
          <View style={{ alignItems: 'flex-end' }}>
            {sign ? (
              <Text
                style={[
                  {
                    fontFamily: fonts.hand,
                    fontSize: fontSize.title3,
                    color: template.ink,
                    textAlign: 'right',
                  },
                  shadow,
                ]}
              >
                {sign}
              </Text>
            ) : null}
            <Text
              style={[
                {
                  fontFamily: fonts.num,
                  fontSize: fontSize.small,
                  color: template.ink,
                  opacity: 0.92,
                  textAlign: 'right',
                  marginTop: 3,
                },
                shadow,
              ]}
            >
              {dateFull}
            </Text>
          </View>
        </View>
      </View>

      {/* 艺术区下方白纸脚（原型 .pc-foot）：操作区，不进导出图 */}
      {footer !== undefined ? (
        <View
          style={{
            backgroundColor: colors.paper,
            paddingHorizontal: 14,
            paddingVertical: 11,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 8,
          }}
        >
          {footer}
        </View>
      ) : null}
    </View>
  );
}
