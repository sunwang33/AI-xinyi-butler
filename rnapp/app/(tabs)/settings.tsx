import { Alert, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { AppHeader, Button, EmptyState, ListRow, Screen } from '../../src/components';
import { colors, fontSize, spacing } from '../../src/theme/tokens';
import { useAccountStore } from '../../src/features/account/authStore';

/**
 * 设置（Tab 3 / spec 第 5、8、13、14 条）
 * 账号区（T55，2026-10-28 提前实施）：未登录显示「登录」入口，已登录显示邮箱与退出；
 * 提醒偏好等设置项在 M4 接入，服务说明在 M6 接入。
 */
export default function SettingsScreen() {
  const router = useRouter();
  const session = useAccountStore((s) => s.session);
  const ready = useAccountStore((s) => s.ready);
  const signOut = useAccountStore((s) => s.signOut);
  const email = session?.user.email ?? '';

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

      {/* 账号区：T55 已提前实施；云端数据同步将在 M12 开放 */}
      <View style={{ marginBottom: spacing.lg }}>
        <Text
          style={{
            marginBottom: spacing.sm,
            marginHorizontal: spacing.xs,
            fontSize: fontSize.footnote,
            color: colors.inkSoft,
          }}
        >
          账号
        </Text>
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

      <EmptyState
        title="提醒与偏好"
        description="全局默认提前天数、提醒送达钟点、祝福条数、单人提醒覆盖、单个节日开关，以及服务说明，将在后续版本开放。"
      />
    </Screen>
  );
}
