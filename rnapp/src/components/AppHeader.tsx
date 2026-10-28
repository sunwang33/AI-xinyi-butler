import { ReactNode } from 'react';
import { Text, View } from 'react-native';
import { colors, fonts, fontSize } from '../theme/tokens';

/**
 * 页面顶部问候式标题，对应原型 .apphdr：
 * 宋体大字标题 + 一行灰色说明，右侧可放邮戳等附加元素。
 */
export function AppHeader({ title, subtitle, right }: { title: string; subtitle?: string; right?: ReactNode }) {
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'flex-end',
        justifyContent: 'space-between',
        gap: 12,
        paddingTop: 6,
        paddingHorizontal: 4,
        paddingBottom: 14,
      }}
    >
      <View style={{ flex: 1 }}>
        <Text style={{ fontFamily: fonts.serif, fontSize: fontSize.title1, color: colors.ink, letterSpacing: 0.3 }}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={{ marginTop: 3, fontSize: fontSize.small, color: colors.inkSoft }}>{subtitle}</Text>
        ) : null}
      </View>
      {right}
    </View>
  );
}
