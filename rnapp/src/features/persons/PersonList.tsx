/**
 * 人员列表（T64：T12 返工，归位联系人 Tab）：展示全部已录入人员，按录入顺序（repo.listPersons）。
 * 重名时该人显示「姓名（关系）」后缀（spec 第 1 条，如「张伟（客户）」），
 * 无重名只显示姓名；关系取 person.relation 原值。
 * 进页（useFocusEffect）自动刷新，保存/返回后能看到最新名单。
 * 自带加载 / 错误（带重试）/ 空三态；人数通过 onCountChange 回传页面头部，
 * 加载中或失败时回传 null。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Button, EmptyState, ListRow } from '../../components';
import { getRepository } from '../../data/repository';
import type { Person } from '../../data/entities';
import { colors, spacing } from '../../theme/tokens';

/** 头像底色按行轮换，与原型 .ava / .ava.warm / .ava.night 三档对应 */
const AVATAR_TONES = ['default', 'warm', 'night'] as const;

export function PersonList({ onCountChange }: { onCountChange?: (count: number | null) => void }) {
  const router = useRouter();
  // null 表示尚未加载完成
  const [persons, setPersons] = useState<Person[] | null>(null);
  // 读取失败标志：失败时展示错误态与重试入口，不一直转圈
  const [loadError, setLoadError] = useState(false);
  // 组件是否仍挂载，避免聚焦离开后回写状态
  const mountedRef = useRef(true);

  // 统一的加载入口：聚焦刷新与「重试」按钮都调它；
  // 内部兜底 try/catch，持续失败时稳定停在错误态，不会产生未捕获 rejection
  const reload = useCallback(async () => {
    setLoadError(false);
    setPersons(null);
    try {
      const repo = await getRepository();
      const list = await repo.listPersons();
      if (mountedRef.current) setPersons(list);
    } catch {
      if (mountedRef.current) {
        setPersons(null);
        setLoadError(true);
      }
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      mountedRef.current = true;
      void reload();
      return () => {
        mountedRef.current = false;
      };
    }, [reload]),
  );

  // 名单加载成功后把人数回传页面（空名单为 0）；加载中 / 失败回传 null
  useEffect(() => {
    onCountChange?.(persons ? persons.length : null);
  }, [persons, onCountChange]);

  // 统计重名：同名出现超过一次时，这些人均加「（关系）」后缀
  const duplicatedNames = useMemo(() => {
    if (!persons) return new Set<string>();
    const counts = new Map<string, number>();
    persons.forEach((p) => counts.set(p.name, (counts.get(p.name) ?? 0) + 1));
    return new Set([...counts].filter(([, count]) => count > 1).map(([name]) => name));
  }, [persons]);

  if (persons === null && !loadError) {
    return (
      <View style={{ paddingVertical: spacing.xxl, alignItems: 'center' }}>
        <ActivityIndicator color={colors.pine} />
      </View>
    );
  }

  if (loadError) {
    return (
      <EmptyState
        title="人员列表读取失败"
        description="本机数据暂时读不出来，请再试一次。"
        action={<Button title="重试" onPress={() => void reload()} />}
      />
    );
  }

  // loadError 分支已返回；理论上此处 persons 必非 null
  if (persons === null) return null;

  if (persons.length === 0) {
    return (
      <EmptyState
        title="还没有惦记的人"
        description="先把第一位在乎的人记下来，日子近了我们会提前提醒你。"
        action={<Button title="添加人员" onPress={() => router.push('/persons/new')} />}
      />
    );
  }

  return (
    <View style={{ gap: spacing.md }}>
      {persons.map((person, index) => {
        const showRelation = duplicatedNames.has(person.name);
        return (
          <ListRow
            key={person.id}
            avatar={person.name.slice(0, 1)}
            avatarTone={AVATAR_TONES[index % AVATAR_TONES.length]}
            title={showRelation ? `${person.name}（${person.relation}）` : person.name}
            subtitle={`生日 ${person.birthdayMonth} 月 ${person.birthdayDay} 日`}
            showChevron
            onPress={() => router.push(`/persons/${person.id}`)}
          />
        );
      })}
    </View>
  );
}
