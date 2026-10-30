import { useState } from 'react';
import { Alert, Text } from 'react-native';
import { Button, ListRow, Sheet, TextField, Toggle } from '../../components';
import { colors, fontSize, spacing } from '../../theme/tokens';
import { getRepository } from '../../data/repository';
import type { Person, PersonReminderSettings } from '../../data/entities';
import { rescheduleReminders } from '../reminders/scheduler';
import { parseAdvanceDays } from './validate';

/**
 * 单人提醒覆盖弹层（T19，已拍板形态：设置页分区 + 底部弹层，不新增路由）。
 * 可单独设提前天数（1–30，留空跟随全局）并单独关闭该人提醒；
 * 不提供按单个生日 / 纪念日的设置。
 */
export function PersonReminderSheet({
  visible,
  person,
  reminder,
  onClose,
  onSaved,
}: {
  visible: boolean;
  person: Person;
  /** 从未单独设置过时为 null，按跟随全局、提醒开启展示 */
  reminder: PersonReminderSettings | null;
  onClose: () => void;
  onSaved: (next: PersonReminderSettings) => void;
}) {
  const [advanceText, setAdvanceText] = useState(
    reminder?.advanceDays != null ? String(reminder.advanceDays) : '',
  );
  const [disabled, setDisabled] = useState(reminder?.disabled ?? false);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    const trimmed = advanceText.trim();
    // 留空 = 跟随全局；非空则必须是 1–30 的整数，否则拒存
    let advanceDays: number | null = null;
    if (trimmed !== '') {
      const parsed = parseAdvanceDays(trimmed);
      if (parsed === null) {
        Alert.alert('提前天数无法保存', '请输入 1–30 之间的整数；留空则表示跟随全局默认天数。');
        return;
      }
      advanceDays = parsed;
    }
    setSaving(true);
    try {
      const repo = await getRepository();
      const next = await repo.upsertPersonReminder(person.id, { advanceDays, disabled });
      // 设置变更后重算调度；失败不阻断保存
      rescheduleReminders().catch(() => {});
      onSaved(next);
      onClose();
    } catch {
      Alert.alert('保存失败', '设置没有保存，请稍后重试。');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet visible={visible} title={`${person.name}的提醒`} onClose={onClose}>
      <TextField
        label="单独提前天数（1–30，留空跟随全局）"
        value={advanceText}
        onChangeText={setAdvanceText}
        keyboardType="number-pad"
        placeholder="留空则跟随全局默认"
      />
      <ListRow
        title="开启该人的提醒"
        subtitle="关闭后不再推送该人的提醒，但其日子仍出现在提醒页"
        right={<Toggle value={!disabled} onValueChange={(v) => setDisabled(!v)} />}
        style={{ marginBottom: spacing.lg }}
      />
      <Button title="保存" block loading={saving} onPress={handleSave} />
      <Text
        style={{
          marginTop: spacing.sm,
          fontSize: fontSize.footnote,
          color: colors.inkFaint,
          textAlign: 'center',
        }}
      >
        单独天数同时覆盖该人的生日与全部纪念日
      </Text>
    </Sheet>
  );
}
