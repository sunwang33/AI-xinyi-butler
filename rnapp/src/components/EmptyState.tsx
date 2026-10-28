import { ReactNode } from 'react';
import { Text, View } from 'react-native';
import { colors, fonts, fontSize, radius, spacing } from '../theme/tokens';

/**
 * 空状态占位，对应原型 .recap 风格：
 * 信纸白虚线苔绿卡片，居中展示醒目标题、说明文字与可选操作。
 */
export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <View
      style={{
        borderWidth: 1,
        borderStyle: 'dashed',
        borderColor: colors.sage,
        borderRadius: radius.md,
        backgroundColor: colors.paperDim,
        paddingHorizontal: spacing.xl,
        paddingVertical: 40,
        alignItems: 'center',
      }}
    >
      <Text style={{ fontFamily: fonts.serif, fontSize: fontSize.display, color: colors.pineDeep }}>{title}</Text>
      {description ? (
        <Text
          style={{
            marginTop: spacing.md,
            fontFamily: fonts.sans,
            fontSize: fontSize.body,
            lineHeight: 22,
            color: colors.inkSoft,
            textAlign: 'center',
          }}
        >
          {description}
        </Text>
      ) : null}
      {action ? <View style={{ marginTop: spacing.xl }}>{action}</View> : null}
    </View>
  );
}
