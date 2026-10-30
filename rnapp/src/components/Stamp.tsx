import type { ReactNode } from 'react';
import { StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { colors, fonts } from '../theme/tokens';

/**
 * D20 邮戳 / 印章（纯展示组件，不含任何业务逻辑），对应原型三种用途：
 * - ready：提醒主卡「心意已就绪」大印章（原型 .seal SVG，默认 90px，双圆＋外圈做旧点环，整体 -9°）
 * - sent：历史「已送出」流水小章（原型 .sent-mark，默认 42px，日期数字＋极小字「已送」）
 * - mark：收藏小章（原型 .sent-mark 的 30px 用法，圆内单字，默认「藏」）
 * 颜色全部取 tokens 的 seal 印泥红色板；RN 不支持圆形虚线边，外圈以小点阵列近似。
 */
export type StampVariant = 'ready' | 'sent' | 'mark';

export interface StampProps {
  variant: StampVariant;
  /** ready：倒计时天数大字（如 1）；sent：送出日期数字（如 26）；mark 不用 */
  day?: string | number;
  /** 仅 ready：数字旁的单位，默认「天」；传空串省略 */
  unit?: string;
  /** ready 默认「已备好」、sent 默认「已送」；mark 不用 */
  label?: string;
  /** 仅 mark：中央单字，默认「藏」 */
  char?: string;
  /** 仅 ready：顶部一行极小装饰字（RN 无 textPath，原型环形字改为平直小字），默认「心意邮局」，传空串省略 */
  topText?: string;
  /** 覆盖默认尺寸：ready 90 / sent 42 / mark 30；内部字号线宽等比缩放 */
  size?: number;
  /** 仅 ready：是否做旧倾斜 -9°，默认 true */
  rotated?: boolean;
  style?: StyleProp<ViewStyle>;
}

const DEFAULT_SIZE: Record<StampVariant, number> = {
  ready: 90,
  sent: 42,
  mark: 30,
};

/** 外圈做旧点环：用小点阵列近似原型的 stroke-dasharray 虚线圆 */
function DotRing({
  size,
  ringRadius,
  dotSize,
  count,
}: {
  size: number;
  ringRadius: number;
  dotSize: number;
  count: number;
}) {
  const dots: ReactNode[] = [];
  for (let i = 0; i < count; i += 1) {
    const angle = (i / count) * Math.PI * 2;
    dots.push(
      <View
        key={i}
        style={{
          position: 'absolute',
          width: dotSize,
          height: dotSize,
          borderRadius: dotSize / 2,
          backgroundColor: colors.seal,
          opacity: 0.8,
          left: size / 2 + ringRadius * Math.sin(angle) - dotSize / 2,
          top: size / 2 - ringRadius * Math.cos(angle) - dotSize / 2,
        }}
      />,
    );
  }
  return <View style={StyleSheet.absoluteFill}>{dots}</View>;
}

/** sent / mark 共用的圆描边外壳（原型 .sent-mark：1.4px 红边＋4% 印泥红底） */
function Circle({
  size,
  borderWidth,
  style,
  children,
}: {
  size: number;
  borderWidth: number;
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
}) {
  return (
    <View
      style={[
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          borderWidth,
          borderColor: colors.seal,
          alignItems: 'center',
          justifyContent: 'center',
        },
        style,
      ]}
    >
      <View
        style={{
          position: 'absolute',
          top: borderWidth,
          left: borderWidth,
          right: borderWidth,
          bottom: borderWidth,
          borderRadius: size / 2,
          backgroundColor: colors.seal,
          opacity: 0.04,
        }}
      />
      {children}
    </View>
  );
}

export function Stamp({
  variant,
  day,
  unit,
  label,
  char,
  topText,
  size,
  rotated = true,
  style,
}: StampProps) {
  const finalSize = size ?? DEFAULT_SIZE[variant];

  if (variant === 'ready') {
    // 原型为 110 视框的 SVG 按 90px 呈现，以下比例均按 90px 基准等比换算
    const s = finalSize / DEFAULT_SIZE.ready;
    const innerSize = finalSize * (88 / 110);
    const innerOffset = (finalSize - innerSize) / 2;
    const top = topText ?? '心意邮局';
    const readyUnit = unit === undefined ? '天' : unit;
    return (
      <View
        style={[
          {
            width: finalSize,
            height: finalSize,
            transform: rotated ? [{ rotate: '-9deg' }] : undefined,
          },
          style,
        ]}
      >
        <DotRing
          size={finalSize}
          ringRadius={finalSize * (52 / 110)}
          dotSize={2 * s}
          count={Math.round(50 * s)}
        />
        <View
          style={{
            position: 'absolute',
            left: innerOffset,
            top: innerOffset,
            width: innerSize,
            height: innerSize,
            borderRadius: innerSize / 2,
            borderWidth: 1.1 * s,
            borderColor: colors.seal,
          }}
        />
        {topText !== '' ? (
          <Text
            style={{
              position: 'absolute',
              top: finalSize * 0.105,
              width: finalSize,
              textAlign: 'center',
              fontFamily: fonts.sans,
              fontSize: 7.5 * s,
              letterSpacing: 2 * s,
              color: colors.seal,
            }}
          >
            {top}
          </Text>
        ) : null}
        <View
          style={[
            StyleSheet.absoluteFill,
            { alignItems: 'center', justifyContent: 'center', paddingTop: 6 * s },
          ]}
        >
          <Text
            style={{
              fontFamily: fonts.num,
              fontSize: 24.5 * s,
              lineHeight: 28 * s,
              color: colors.seal,
            }}
          >
            {day}
            {readyUnit ? (
              <Text style={{ fontFamily: fonts.sans, fontSize: 11.5 * s }}>{readyUnit}</Text>
            ) : null}
          </Text>
          <Text
            style={{
              marginTop: 1 * s,
              fontFamily: fonts.serifRegular,
              fontSize: 9 * s,
              lineHeight: 12 * s,
              letterSpacing: 1.6 * s,
              color: colors.seal,
            }}
          >
            {label ?? '已备好'}
          </Text>
        </View>
      </View>
    );
  }

  if (variant === 'sent') {
    const s = finalSize / DEFAULT_SIZE.sent;
    return (
      <Circle size={finalSize} borderWidth={1.4 * s} style={style}>
        <Text
          style={{
            fontFamily: fonts.num,
            fontSize: 14 * s,
            lineHeight: 16 * s,
            color: colors.seal,
          }}
        >
          {day}
        </Text>
        <Text
          style={{
            marginTop: 2 * s,
            fontFamily: fonts.sans,
            fontSize: 8 * s,
            lineHeight: 9.5 * s,
            letterSpacing: 0.8 * s,
            color: colors.seal,
          }}
        >
          {label ?? '已送'}
        </Text>
      </Circle>
    );
  }

  // variant === 'mark'
  const s = finalSize / DEFAULT_SIZE.mark;
  return (
    <Circle size={finalSize} borderWidth={1.4 * s} style={style}>
      <Text
        style={{
          fontFamily: fonts.serif,
          fontSize: 12 * s,
          lineHeight: 14 * s,
          color: colors.seal,
        }}
      >
        {char ?? '藏'}
      </Text>
    </Circle>
  );
}
