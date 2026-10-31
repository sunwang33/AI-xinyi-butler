/**
 * 祝福 / 礼物分区共用的状态小件（M6/M7）：虚线底盒与统一字号的标题、说明。
 */
import type { ReactNode } from 'react';
import { Text, View } from 'react-native';
import { colors, fonts, fontSize, radius, spacing } from '../../theme/tokens';

/** 虚线底盒：未生成 / 需要网络等状态的统一容器 */
export function DashedBox({ children }: { children: ReactNode }) {
  return (
    <View
      style={{
        borderWidth: 1,
        borderStyle: 'dashed',
        borderColor: colors.sage,
        borderRadius: radius.md,
        backgroundColor: colors.paperDim,
        padding: spacing.lg,
        gap: spacing.xs,
      }}
    >
      {children}
    </View>
  );
}

export function BoxTitle({ children }: { children: ReactNode }) {
  return (
    <Text style={{ fontFamily: fonts.sansMedium, fontSize: fontSize.base, color: colors.pineDeep }}>
      {children}
    </Text>
  );
}

export function BoxNote({ children }: { children: ReactNode }) {
  return (
    <Text style={{ fontFamily: fonts.sans, fontSize: fontSize.body, lineHeight: 22, color: colors.inkSoft }}>
      {children}
    </Text>
  );
}

/** 蜜蜡色提示条：通用兜底说明、或有旧内容但重新生成失败时的保留提示 */
export function NoticeBar({ children }: { children: ReactNode }) {
  return (
    <View
      style={{
        backgroundColor: colors.honeyWash,
        borderRadius: radius.sm,
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.sm,
      }}
    >
      <Text style={{ fontFamily: fonts.sans, fontSize: fontSize.small, lineHeight: 19, color: colors.honeyDeep }}>
        {children}
      </Text>
    </View>
  );
}
