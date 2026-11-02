/**
 * 电子贺卡成品视图（M9 T44；T45 接入祝福翻页脚与点按编辑）。
 * 纯展示，不读状态、不直接落库：按门禁 A3 的画布比例（2560:1568）铺满模板
 * 背景，再在本机叠加左上日期圆圈、右上手写邮票虚线框、称呼、手写体祝福、角落落款。
 *
 * 规则（spec 第 10 条）：
 * - 称呼 / 落款为 null 时整块不渲染、不留位（通用版节日无称呼；未填自称无落款）；
 * - wish 为 null 表示当年祝福快照尚不存在，按门禁 A2（2026-11-01 拍板「留空、可手写」）
 *   呈现浅色引导语；
 * - 祝福文字可点（onEditWish），T45 起进入手写编辑；footer 为艺术区下方白纸脚，
 *   由 CardSection 传入祝福翻页器与「点按文字可编辑」药丸（对应原型 .pc-foot/.switcher）。
 *   纸脚是操作区，不属于成品画面——T46 导出截图只取艺术区，不含 footer。
 * - 超长祝福按门禁 B 组结论（2026-11-02「软上限 + 自适应缩小」）依字数分档缩小，
 *   不截断、不溢出；字号只取 tokens 既有档位。
 * 模板切换见 CardSection，截图导出在 T46。
 */
import { ReactNode } from 'react';
import { ImageBackground, Pressable, Text, View } from 'react-native';
import { colors, fonts, fontSize, radius, spacing } from '../../theme/tokens';
import type { CardTemplateDef } from './templates';

/** 祝福字号分档（按去空白后的字数）：全部复用 tokens 字号，仅在贺卡内收窄行高防溢出 */
function wishTypography(length: number): { fontSize: number; lineHeight: number } {
  if (length <= 24) return { fontSize: fontSize.title2, lineHeight: 36 };
  if (length <= 40) return { fontSize: fontSize.title3, lineHeight: 31 };
  if (length <= 60) return { fontSize: fontSize.base, lineHeight: 25 };
  return { fontSize: fontSize.body, lineHeight: 22 };
}

export interface PostcardProps {
  template: CardTemplateDef;
  /** 称呼原文（不含冒号）；通用版无人传 null，整行不渲染 */
  to: string | null;
  /** 当前祝福文字；null 表示尚无祝福（A2：留空 + 引导） */
  wish: string | null;
  /** 角落落款原文；null 时整块不渲染、不留白 */
  sign: string | null;
  /** 日期圆圈内文本，如「10·31」 */
  dateLabel: string;
  /** 无祝福时的浅色引导语（A2） */
  emptyHint?: string;
  /** 点按祝福文字（含空引导）进入手写编辑；不传则文字不可点 */
  onEditWish?: () => void;
  /** 艺术区下方白纸脚内容（祝福翻页器 + 编辑药丸）；操作区，不进 T46 导出图 */
  footer?: ReactNode;
}

export function Postcard({
  template,
  to,
  wish,
  sign,
  dateLabel,
  emptyHint = '在这里写下你的祝福',
  onEditWish,
  footer,
}: PostcardProps) {
  // 深底（月夜）给文字加柔和投影，保证可读；浅底不加
  const shadow = template.dark
    ? {
        textShadowColor: 'rgba(20,40,30,0.35)',
        textShadowOffset: { width: 0, height: 1 },
        textShadowRadius: 8,
      }
    : null;

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
      <ImageBackground
        source={template.art}
        resizeMode="cover"
        style={{ width: '100%', aspectRatio: 2560 / 1568 }}
      >
        {/* 左上日期圆圈 */}
        <View
          style={{
            position: 'absolute',
            top: 12,
            left: 14,
            width: 42,
            height: 42,
            borderRadius: 21,
            borderWidth: 1.5,
            borderColor: template.deco,
            backgroundColor: template.dark ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.28)',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text style={{ fontFamily: fonts.num, fontSize: 11, color: template.ink }}>{dateLabel}</Text>
        </View>

        {/* 右上邮票虚线框 */}
        <View
          style={{
            position: 'absolute',
            top: 14,
            right: 14,
            width: 52,
            height: 62,
            borderRadius: 6,
            borderWidth: 1.5,
            borderStyle: 'dashed',
            borderColor: template.deco,
            backgroundColor: template.dark ? 'rgba(255,255,255,0.14)' : 'rgba(255,255,255,0.40)',
          }}
        />

        {/* 文字区：顶部让开日期圆圈与邮票框 */}
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, padding: spacing.lg, paddingTop: 58 }}>
          {to ? (
            <Text style={[{ fontFamily: fonts.hand, fontSize: fontSize.title2, color: template.ink }, shadow]}>
              {to}：
            </Text>
          ) : null}

          {/* 祝福文字可点（T45）：点 AI 文案或空引导都进手写编辑 */}
          <Pressable
            onPress={onEditWish}
            disabled={!editable}
            hitSlop={{ top: 10, bottom: 10, left: 6, right: 6 }}
            accessibilityRole="button"
            accessibilityLabel="编辑贺卡祝福文字"
            style={({ pressed }) => ({ opacity: editable && pressed ? 0.65 : 1 })}
          >
            {wish ? (
              <Text
                style={[
                  {
                    fontFamily: fonts.hand,
                    fontSize: wishType.fontSize,
                    lineHeight: wishType.lineHeight,
                    marginTop: 6,
                    color: template.ink,
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
                    lineHeight: 36,
                    marginTop: 6,
                    color: template.ink,
                    opacity: 0.42,
                  },
                  shadow,
                ]}
              >
                {emptyHint}
              </Text>
            )}
          </Pressable>

          {sign ? (
            <Text
              style={[
                {
                  fontFamily: fonts.hand,
                  fontSize: fontSize.title3,
                  color: template.ink,
                  alignSelf: 'flex-end',
                  textAlign: 'right',
                  marginTop: 10,
                },
                shadow,
              ]}
            >
              {sign}
            </Text>
          ) : null}
        </View>
      </ImageBackground>

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
