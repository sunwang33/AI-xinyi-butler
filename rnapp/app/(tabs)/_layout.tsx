import { Text, View } from 'react-native';
import { Tabs } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ContactsIcon, GearIcon, HistoryIcon, RemindIcon } from '../../src/components';
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
 * 底部标签栏，严格为 spec 全局规则 5（D15/D19/D20）规定的四个：
 * 提醒 / 联系人 / 历史 / 设置。
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
        name="remind"
        options={{
          title: '提醒',
          tabBarIcon: ({ focused }) => (
            <RemindIcon color={focused ? colors.pineDeep : colors.inkFaint} />
          ),
          tabBarLabel: ({ focused, children }) => <TabLabel focused={focused}>{children}</TabLabel>,
        }}
      />
      <Tabs.Screen
        name="contacts"
        options={{
          title: '联系人',
          tabBarIcon: ({ focused }) => (
            <ContactsIcon color={focused ? colors.pineDeep : colors.inkFaint} />
          ),
          tabBarLabel: ({ focused, children }) => <TabLabel focused={focused}>{children}</TabLabel>,
        }}
      />
      <Tabs.Screen
        name="history"
        options={{
          title: '历史',
          tabBarIcon: ({ focused }) => (
            <HistoryIcon color={focused ? colors.pineDeep : colors.inkFaint} />
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
