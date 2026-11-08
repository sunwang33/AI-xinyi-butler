import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { OnboardingIntro } from '../src/features/persons/OnboardingIntro';
import { Button, EmptyState, Screen } from '../src/components';
import { getRepository } from '../src/data/repository';
import { useAccountStore } from '../src/features/account/authStore';
import { colors } from '../src/theme/tokens';

/**
 * 添加引导（plan 3.1 /onboarding，T14，引导不可跳过；T63 修复 F2）：
 * 每次聚焦重新检查人数——一旦已有档案（新增成功后返回本页也会触发），
 * 立即 replace 到提醒 Tab；已有档案直接访问 /onboarding 同样直落提醒 Tab。
 * 读取人员失败（qa F2）必须给出错误态与重试，不得永久白屏。
 */
type Status = 'checking' | 'empty' | 'error';

export default function OnboardingScreen() {
  const router = useRouter();
  const [status, setStatus] = useState<Status>('checking');
  // 登录态恢复完成前保持 checking，避免拿到匿名仓储误判空库（T58 真机缺陷，2026-11-08）
  const ready = useAccountStore((s) => s.ready);
  // 订阅会话：恢复超时先按未登录进入后，会话晚到也能自动接回提醒 Tab
  const session = useAccountStore((s) => s.session);

  // 纯查询：有人则直落提醒 Tab，无人/失败落到对应状态。
  // 不含同步 setState，可安全在 useEffect 中调用。
  const queryProfile = useCallback(() => {
    let active = true;
    getRepository()
      .then((repo) => repo.listPersons())
      .then((persons) => {
        if (!active) return;
        if (persons.length > 0) {
          router.replace('/(tabs)/remind');
        } else {
          setStatus('empty');
        }
      })
      .catch(() => {
        if (active) setStatus('error');
      });
    return () => {
      active = false;
    };
  }, [router]);

  // 聚焦复查（含重试按钮）：先切 checking 再查询
  const checkProfile = useCallback(() => {
    if (!ready) return;
    setStatus('checking');
    return queryProfile();
  }, [ready, queryProfile]);

  useFocusEffect(checkProfile);

  // ready/session 变化时静默复查，覆盖冷启动竞态（ready 晚到）
  // 与恢复超时后会话晚到两种时序；不重置 checking，避免 effect 内同步 setState
  useEffect(() => {
    if (ready) return queryProfile();
  }, [ready, session, queryProfile]);

  if (status === 'error') {
    return (
      <Screen>
        <View style={{ flex: 1, justifyContent: 'center' }}>
          <EmptyState
            title="档案读取失败"
            description="读取本机数据时出现问题，请重试。"
            action={<Button title="重试" onPress={checkProfile} />}
          />
        </View>
      </Screen>
    );
  }

  if (status === 'checking') {
    return (
      <View style={{ flex: 1, backgroundColor: colors.mist, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={colors.pine} />
      </View>
    );
  }

  return <OnboardingIntro />;
}
