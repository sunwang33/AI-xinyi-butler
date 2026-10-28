import { Text, View } from 'react-native';
import { PageHeader } from './PageHeader';
import { Screen } from './Screen';
import { colors, fonts, fontSize, radius, spacing } from '../theme/tokens';

/**
 * 非 Tab 页面的统一占位（M1 / T04）：
 * 返回头 + 信纸卡片，卡片内写清页面名称、路由路径、用途与计划实现的里程碑。
 */
export function PlaceholderScreen({
  title,
  route,
  description,
  milestone,
}: {
  title: string;
  route: string;
  description: string;
  milestone: string;
}) {
  return (
    <Screen scroll edges={['top', 'bottom']}>
      <PageHeader title={title} />
      <View
        style={{
          marginTop: spacing.xxl,
          backgroundColor: colors.paper,
          borderWidth: 1,
          borderColor: colors.line,
          borderRadius: radius.lg,
          paddingHorizontal: spacing.xl,
          paddingVertical: 36,
          alignItems: 'center',
        }}
      >
        <Text style={{ fontFamily: fonts.serif, fontSize: fontSize.title1, color: colors.pineDeep }}>{title}</Text>
        <Text style={{ marginTop: 6, fontFamily: fonts.numItalic, fontSize: fontSize.small, color: colors.inkFaint }}>
          {route}
        </Text>
        <Text
          style={{
            marginTop: spacing.lg,
            fontFamily: fonts.sans,
            fontSize: fontSize.body,
            lineHeight: 22,
            color: colors.inkSoft,
            textAlign: 'center',
          }}
        >
          {description}
        </Text>
        <View
          style={{
            marginTop: spacing.xl,
            backgroundColor: colors.honeyWash,
            borderRadius: radius.sm,
            paddingHorizontal: 10,
            paddingVertical: 4,
          }}
        >
          <Text style={{ fontFamily: fonts.sansMedium, fontSize: fontSize.footnote, color: colors.honeyDeep }}>
            {milestone}
          </Text>
        </View>
        <Text style={{ marginTop: spacing.lg, fontSize: fontSize.caption, color: colors.inkFaint }}>
          页面占位 · M1 搭骨架
        </Text>
      </View>
    </Screen>
  );
}
