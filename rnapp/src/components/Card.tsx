import { PropsWithChildren } from 'react';
import { View, ViewStyle } from 'react-native';
import { colors, radius, spacing } from '../theme/tokens';

/**
 * 信纸白卡片容器，对应原型 .pc-row / .cardpanel 的底板：
 * 信纸白底、细描边、14 圆角。
 */
export function Card({ children, style, padded = true }: PropsWithChildren<{ style?: ViewStyle; padded?: boolean }>) {
  return (
    <View
      style={[
        {
          backgroundColor: colors.paper,
          borderWidth: 1,
          borderColor: colors.line,
          borderRadius: radius.lg,
          padding: padded ? spacing.lg : undefined,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}
