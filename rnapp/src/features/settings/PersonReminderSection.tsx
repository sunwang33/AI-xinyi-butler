import { useCallback, useState } from 'react';
import { Alert, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { ListRow, Toggle } from '../../components';
import { colors, fontSize, spacing } from '../../theme/tokens';
import { getRepository } from '../../data/repository';
import type { Person, PersonReminderSettings } from '../../data/entities';
import { rescheduleReminders } from '../reminders/scheduler';
import { PersonReminderSheet } from './PersonReminderSheet';

type PersonRow = {
  person: Person;
  reminder: PersonReminderSettings | null;
};

/**
 * 单人提醒分区（T19）：列出全部人员，摘要展示覆盖天数或跟随全局；
 * 行内开关直接控制 disabled（关 = 仅停止推送），点行打开弹层细设天数与开关。
 */
export function PersonReminderSection({ globalAdvanceDays }: { globalAdvanceDays: number }) {
  const [rows, setRows] = useState<PersonRow[] | null>(null);
  const [editing, setEditing] = useState<PersonRow | null>(null);

  const load = useCallback(() => {
    let cancelled = false;
    getRepository()
      .then(async (repo) => {
        const persons = await repo.listPersons();
        const reminders = await Promise.all(persons.map((p) => repo.getPersonReminder(p.id)));
        if (!cancelled) {
          setRows(persons.map((person, i) => ({ person, reminder: reminders[i] })));
        }
      })
      .catch(() => {
        if (!cancelled) Alert.alert('读取失败', '人员提醒设置没有读出来，请稍后重试。');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // 从弹层保存返回本页时也要刷新摘要
  useFocusEffect(load);

  /** 行内开关：切换 disabled 并落库，失败回滚 */
  const toggleDisabled = async (row: PersonRow, nextDisabled: boolean) => {
    const previous = row.reminder;
    setRows((cur) =>
      cur
        ? cur.map((r) =>
            r.person.id === row.person.id
              ? {
                  ...r,
                  reminder: {
                    personId: row.person.id,
                    advanceDays: previous?.advanceDays ?? null,
                    disabled: nextDisabled,
                  },
                }
              : r,
          )
        : cur,
    );
    try {
      const repo = await getRepository();
      await repo.upsertPersonReminder(row.person.id, { disabled: nextDisabled });
      rescheduleReminders().catch(() => {});
    } catch {
      Alert.alert('设置失败', '开关没有保存，请稍后重试。');
      setRows((cur) =>
        cur ? cur.map((r) => (r.person.id === row.person.id ? { ...r, reminder: previous } : r)) : cur,
      );
    }
  };

  // 重名时追加关系标签区分（spec 一·1：如「张伟（客户）」）
  const nameCounts = new Map<string, number>();
  rows?.forEach((r) => nameCounts.set(r.person.name, (nameCounts.get(r.person.name) ?? 0) + 1));
  const displayName = (p: Person) =>
    (nameCounts.get(p.name) ?? 0) > 1 ? `${p.name}（${p.relation}）` : p.name;

  const subtitleOf = (r: PersonReminderSettings | null) => {
    if (r?.disabled) return '已关闭提醒';
    if (r?.advanceDays != null) return `提前 ${r.advanceDays} 天提醒`;
    return `跟随全局（提前 ${globalAdvanceDays} 天）`;
  };

  return (
    <View>
      <View style={{ gap: spacing.sm }}>
        {rows?.map((row) => (
          <ListRow
            key={row.person.id}
            avatar={row.person.name.slice(0, 1)}
            title={displayName(row.person)}
            subtitle={subtitleOf(row.reminder)}
            onPress={() => setEditing(row)}
            right={
              <Toggle
                value={!row.reminder?.disabled}
                onValueChange={(v) => toggleDisabled(row, !v)}
              />
            }
          />
        ))}
      </View>
      {rows && rows.length === 0 ? (
        <Text style={{ fontSize: fontSize.footnote, color: colors.inkSoft }}>
          还没有录入人员。到联系人 Tab 添加后，可在这里单独设置每个人的提醒。
        </Text>
      ) : null}

      {editing ? (
        <PersonReminderSheet
          // 切换不同人时以 key 重置弹层内部输入态
          key={editing.person.id}
          visible
          person={editing.person}
          reminder={editing.reminder}
          onClose={() => setEditing(null)}
          onSaved={(next) =>
            setRows((cur) =>
              cur
                ? cur.map((r) => (r.person.id === editing.person.id ? { ...r, reminder: next } : r))
                : cur,
            )
          }
        />
      ) : null}
    </View>
  );
}
