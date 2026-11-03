import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { AppHeader, EmptyState, Screen } from '../../src/components';
import { FavoriteList } from '../../src/features/favorites/FavoriteList';
import { colors, fonts, fontSize, radius, spacing } from '../../src/theme/tokens';

/** 历史 Tab 分区：已送出流水（T69/T70 填充）/ 收藏（T49 填充） */
type HistorySection = 'sent' | 'favorites';

const SECTIONS: { key: HistorySection; label: string }[] = [
  { key: 'sent', label: '已送出' },
  { key: 'favorites', label: '收藏' },
];

/**
 * 历史 Tab（plan 3.1 /(tabs)/history，spec 全局规则 5 / D19，T64）：
 * 顶部原型 .seg 风格分段控件，纯本地 useState 切换、默认停在「已送出」。
 * - 收藏段（M10 T49）：FavoriteList 接 favorites，chips 筛类型、按收藏时间倒序、
 *   祝福复制 / 礼物去看看 / 贺卡导出 / 取消收藏，全部离线可见；
 * - 已送出段仍为空态（流水留 M11 的 T69/T70）。
 */
export default function HistoryScreen() {
  const [section, setSection] = useState<HistorySection>('sent');

  return (
    <Screen scroll edges={['top']}>
      <AppHeader title="历史" subtitle="送出的心意与收藏，都在这里" />

      {/* 分段控件，对应原型 .seg：纸底色胶囊，选中项白纸浮起带轻投影 */}
      <View
        style={{
          flexDirection: 'row',
          backgroundColor: colors.paperDim,
          borderWidth: 1,
          borderColor: colors.line,
          borderRadius: radius.pill,
          padding: 3,
          marginBottom: spacing.lg,
        }}
      >
        {SECTIONS.map((item) => {
          const active = section === item.key;
          return (
            <Pressable
              key={item.key}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              onPress={() => setSection(item.key)}
              style={{
                flex: 1,
                alignItems: 'center',
                borderRadius: radius.pill,
                paddingVertical: 8,
                backgroundColor: active ? colors.paper : 'transparent',
                ...(active
                  ? {
                      shadowColor: colors.ink,
                      shadowOpacity: 0.08,
                      shadowRadius: 4,
                      shadowOffset: { width: 0, height: 1 },
                      elevation: 1,
                    }
                  : null),
              }}
            >
              <Text
                style={{
                  fontFamily: active ? fonts.sansMedium : fonts.sans,
                  fontSize: fontSize.body,
                  color: active ? colors.pineDeep : colors.inkSoft,
                }}
              >
                {item.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {section === 'sent' ? (
        <EmptyState
          title="还没有标记过已送出的心意"
          description="标记过送出的祝福、礼物与贺卡会留在这里。"
        />
      ) : (
        // M10 T49：收藏分区（自带加载 / 空 / 筛选空三态）
        <FavoriteList />
      )}
    </Screen>
  );
}
