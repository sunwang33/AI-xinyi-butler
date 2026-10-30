import { useState } from 'react';
import { useRouter } from 'expo-router';
import { AppHeader, Button, Screen } from '../../src/components';
import { spacing } from '../../src/theme/tokens';
import { PersonList } from '../../src/features/persons/PersonList';

/**
 * 联系人 Tab（plan 3.1 /(tabs)/contacts，spec 全局规则 5 / D15，T64）：
 * 人员列表即本 Tab，人员的添加、查看、编辑、删除全部入口在此。
 * 顶部常驻「＋ 添加一位人」直达 /persons/new；列表三态与重名关系标签由 PersonList 承担，
 * 行点击进 /persons/[personId]。
 */
export default function ContactsScreen() {
  const router = useRouter();
  // null = 加载中或读取失败，头部副标题先不显示人数
  const [count, setCount] = useState<number | null>(null);

  return (
    <Screen scroll edges={['top']}>
      <AppHeader
        title="联系人"
        subtitle={count === null ? '允许重名，以关系标签区分' : `共 ${count} 位 · 允许重名，以关系标签区分`}
      />

      {/* 对应原型 .btn-ghost.btn-block：常驻新建入口（原型联系人 Tab 顶部） */}
      <Button
        title="＋ 添加一位人"
        variant="ghost"
        size="sm"
        block
        style={{ marginBottom: spacing.lg }}
        onPress={() => router.push('/persons/new')}
      />

      <PersonList onCountChange={setCount} />
    </Screen>
  );
}
