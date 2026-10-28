import { PropsWithChildren } from 'react';
import { ScrollView, View, ViewStyle } from 'react-native';
import { Edge, SafeAreaView } from 'react-native-safe-area-context';
import { colors, spacing } from '../theme/tokens';

type ScreenProps = PropsWithChildren<{
  /** true 时页面内容纵向滚动 */
  scroll?: boolean;
  contentStyle?: ViewStyle;
  /** 应用安全区的边；Tab 页底部由标签栏承载，只传 ['top'] */
  edges?: Edge[];
}>;

/**
 * 页面根容器：天青底 + 安全区。
 * 对应原型 .screen / .scroll 的天青色页面底板。
 */
export function Screen({ children, scroll = false, contentStyle, edges = ['top', 'bottom'] }: ScreenProps) {
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.mist }} edges={edges}>
      {scroll ? (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={[
            { paddingHorizontal: spacing.xl, paddingTop: spacing.sm, paddingBottom: spacing.xxl },
            contentStyle,
          ]}
          showsVerticalScrollIndicator={false}
        >
          {children}
        </ScrollView>
      ) : (
        <View style={[{ flex: 1, paddingHorizontal: spacing.xl }, contentStyle]}>{children}</View>
      )}
    </SafeAreaView>
  );
}
