import { useState, type ReactNode } from 'react';
import { Alert, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { AppHeader, Button, ListRow, Screen } from '../../src/components';
import { colors, fontSize, spacing } from '../../src/theme/tokens';
import { useAccountStore } from '../../src/features/account/authStore';
import type { AppSettings } from '../../src/data/entities';
import { GlobalSettingsSection } from '../../src/features/settings/GlobalSettingsSection';
import { PersonReminderSection } from '../../src/features/settings/PersonReminderSection';

/** 分区小标题，沿用账号区原有样式 */
function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <Text
      style={{
        marginBottom: spacing.sm,
        marginHorizontal: spacing.xs,
        fontSize: fontSize.footnote,
        color: colors.inkSoft,
      }}
    >
      {children}
    </Text>
  );
}

/**
 * 设置（Tab 4 / spec 第 5、8、13、14 条）
 * 分区顺序：提醒设置（T18）→ 单人提醒（T19）→ 关于（T21）→ 账号（T55）。
 * F11：节日关注/取关只在提醒页节日区操作，设置页不放节日开关（T20 已撤销，T66）。
 */
export default function SettingsScreen() {
  const router = useRouter();
  const session = useAccountStore((s) => s.session);
  const ready = useAccountStore((s) => s.ready);
  const signOut = useAccountStore((s) => s.signOut);
  const email = session?.user.email ?? '';

  // 全局天数由全局分区回传，供单人分区拼「跟随全局（提前 N 天）」摘要
  const [globalAdvanceDays, setGlobalAdvanceDays] = useState(3);
  const handleSettingsChange = (s: AppSettings) => setGlobalAdvanceDays(s.globalAdvanceDays);

  const handleSignOut = () => {
    Alert.alert('退出登录', '退出后云端同步将暂停，本机已保存的数据不受影响。确定退出吗？', [
      { text: '取消', style: 'cancel' },
      {
        text: '退出',
        style: 'destructive',
        onPress: async () => {
          try {
            await signOut();
          } catch (e) {
            Alert.alert('退出失败', e instanceof Error ? e.message : '请稍后重试');
          }
        },
      },
    ]);
  };

  return (
    <Screen scroll edges={['top']}>
      <AppHeader title="设置" />

      {/* ① 提醒设置：全局提前天数、送达钟点、祝福条数（T18） */}
      <View style={{ marginBottom: spacing.lg }}>
        <SectionTitle>提醒设置</SectionTitle>
        <GlobalSettingsSection onSettingsChange={handleSettingsChange} />
      </View>

      {/* ② 单人提醒：逐人覆盖天数与开关（T19） */}
      <View style={{ marginBottom: spacing.lg }}>
        <SectionTitle>单人提醒</SectionTitle>
        <PersonReminderSection globalAdvanceDays={globalAdvanceDays} />
      </View>

      {/* ③ 关于：服务说明常驻入口（T21，内容页 T29 填，当前为占位页） */}
      <View style={{ marginBottom: spacing.lg }}>
        <SectionTitle>关于</SectionTitle>
        <ListRow title="服务说明" showChevron onPress={() => router.push('/service-notice')} />
      </View>

      {/* ④ 账号区：T55 已提前实施；云端数据同步将在 M12 开放 */}
      <View style={{ marginBottom: spacing.lg }}>
        <SectionTitle>账号</SectionTitle>
        {ready && session ? (
          <>
            <ListRow
              avatar={email.slice(0, 1).toUpperCase()}
              title={email}
              subtitle="已登录 · 云端数据同步将在后续版本开放"
            />
            <Button
              title="退出登录"
              block
              variant="ghost"
              style={{ marginTop: spacing.sm }}
              onPress={handleSignOut}
            />
          </>
        ) : (
          <ListRow
            avatar="心"
            avatarTone="warm"
            title="登录心意管家"
            subtitle="未登录也能完整使用；登录后数据可保存到云端，换机不丢"
            showChevron
            onPress={() => router.push('/login')}
          />
        )}
      </View>
    </Screen>
  );
}
