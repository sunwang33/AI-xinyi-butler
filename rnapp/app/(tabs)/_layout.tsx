import { Text, View } from 'react-native';
import { Tabs } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BookmarkIcon, GearIcon, HomeIcon } from '../../src/components';
import { colors, fonts } from '../../src/theme/tokens';

/** 底部标签：图标 + 文字，选中时文字下方出现蜜蜡色小圆点（对应原型 .tab.on） */
function TabLabel({ focused, children }: { focused: boolean; children: string }) {
  return (
    <View style={{ alignItems: 'center', gap: 3 }}>
      <Text
        style={{
          fontSize: 11.5,
          lineHeight: 14,
          fontFamily: focused ? fonts.sansMedium : fonts.sans,
          color: focused ? colors.pineDeep : colors.inkFaint,
        }}
      >
        {children}
      </Text>
      <View
        style={{
          width: 5,
          height: 5,
          borderRadius: 3,
          backgroundColor: focused ? colors.honey : 'transparent',
        }}
      />
    </View>
  );
}

/**
 * 底部标签栏，严格为 spec 全局规则 5 规定的三个：首页 / 收藏 / 设置。
 */
export default function TabsLayout() {
  const insets = useSafeAreaInsets();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarLabelPosition: 'below-icon',
        tabBarStyle: {
          backgroundColor: 'rgba(251, 252, 248, 0.96)',
          borderTopColor: colors.line,
          borderTopWidth: 1,
          height: 62 + insets.bottom,
          paddingTop: 8,
          paddingBottom: 6 + insets.bottom,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: '首页',
          tabBarIcon: ({ focused }) => (
            <HomeIcon color={focused ? colors.pineDeep : colors.inkFaint} />
          ),
          tabBarLabel: ({ focused, children }) => <TabLabel focused={focused}>{children}</TabLabel>,
        }}
      />
      <Tabs.Screen
        name="favorites"
        options={{
          title: '收藏',
          tabBarIcon: ({ focused }) => (
            <BookmarkIcon color={focused ? colors.pineDeep : colors.inkFaint} />
          ),
          tabBarLabel: ({ focused, children }) => <TabLabel focused={focused}>{children}</TabLabel>,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: '设置',
          tabBarIcon: ({ focused }) => (
            <GearIcon color={focused ? colors.pineDeep : colors.inkFaint} />
          ),
          tabBarLabel: ({ focused, children }) => <TabLabel focused={focused}>{children}</TabLabel>,
        }}
      />
    </Tabs>
  );
}
