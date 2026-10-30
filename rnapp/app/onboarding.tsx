import { useCallback, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { OnboardingIntro } from '../src/features/persons/OnboardingIntro';
import { Button, EmptyState, Screen } from '../src/components';
import { getRepository } from '../src/data/repository';
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

  // 复查人数；重试按钮重新执行本逻辑
  const checkProfile = useCallback(() => {
    let active = true;
    setStatus('checking');
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

  useFocusEffect(checkProfile);

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
