import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { Redirect } from 'expo-router';
import { Button, EmptyState, Screen } from '../src/components';
import { getRepository } from '../src/data/repository';
import { useAccountStore } from '../src/features/account/authStore';
import { colors } from '../src/theme/tokens';

/**
 * 启动入口（plan.md 3.2 第 1 条，T14；T63 落提醒 Tab 并修复 F2）：
 * 无任何档案 → /onboarding；有档案 → 提醒 Tab。
 * 读取人员失败（qa F2）必须给出错误态与重试，不得永久白屏。
 */
type Target = 'loading' | 'error' | 'onboarding' | 'tabs';

export default function Index() {
  // 初始即为 loading，effect 内不再同步 setState（避免连锁渲染）
  const [target, setTarget] = useState<Target>('loading');
  // 必须等登录态恢复完成：否则会话未恢复时只会拿到匿名仓储，
  // 已登录用户会被误判为空库重定向到 /onboarding（T58 真机缺陷，2026-11-08）
  const ready = useAccountStore((s) => s.ready);

  // 读取人员判断档案是否存在；返回 active 清理函数供 effect 卸载时使用
  const runCheck = useCallback(() => {
    let active = true;
    getRepository()
      .then((repo) => repo.listPersons())
      .then((persons) => {
        if (active) setTarget(persons.length === 0 ? 'onboarding' : 'tabs');
      })
      .catch(() => {
        if (active) setTarget('error');
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!ready) return;
    return runCheck();
  }, [ready, runCheck]);

  // 重试：事件回调中先回 loading，再重新执行判断逻辑
  const retry = () => {
    setTarget('loading');
    runCheck();
  };

  if (target === 'error') {
    return (
      <Screen>
        <View style={{ flex: 1, justifyContent: 'center' }}>
          <EmptyState
            title="档案读取失败"
            description="启动时读取本机数据出现问题，请重试。"
            action={<Button title="重试" onPress={retry} />}
          />
        </View>
      </Screen>
    );
  }

  if (target === 'loading') {
    return (
      <View style={{ flex: 1, backgroundColor: colors.mist, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={colors.pine} />
      </View>
    );
  }

  return <Redirect href={target === 'onboarding' ? '/onboarding' : '/(tabs)/remind'} />;
}
