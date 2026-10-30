/**
 * 单个纪念日编辑行（T11）：名称（必填可自定义）+ 月日（必填）+ 起始年份（选填）。
 * 纯受控组件，状态由 usePersonForm 统一管理。
 */
import { Text, View } from 'react-native';
import { Button, TextField } from '../../components';
import { colors, fontSize, spacing } from '../../theme/tokens';
import type { AnniversaryDraft, AnniversaryErrors } from './personFormSchema';

/** 字段下的错误小字 */
function ErrorText({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <Text style={{ marginTop: -8, marginBottom: 8, marginLeft: 2, fontSize: fontSize.footnote, color: colors.honeyDeep }}>
      {message}
    </Text>
  );
}

export function AnniversaryEditor({
  value,
  errors,
  onChange,
  onRemove,
}: {
  value: AnniversaryDraft;
  errors?: AnniversaryErrors;
  onChange: (patch: Partial<Omit<AnniversaryDraft, 'key' | 'id'>>) => void;
  onRemove: () => void;
}) {
  return (
    <View
      style={{
        borderWidth: 1,
        borderColor: colors.line,
        borderRadius: 12,
        backgroundColor: colors.paperDim,
        paddingHorizontal: spacing.md,
        paddingTop: spacing.sm,
        marginBottom: spacing.md,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
        <View style={{ flex: 1 }}>
          <TextField
            label="纪念日名称"
            required
            small
            placeholder="如：领证日、乔迁"
            value={value.name}
            onChangeText={(text) => onChange({ name: text })}
          />
        </View>
        <Button title="删除" variant="ghost" size="sm" onPress={onRemove} />
      </View>
      <ErrorText message={errors?.name} />

      <View style={{ flexDirection: 'row', gap: spacing.sm }}>
        <View style={{ flex: 1 }}>
          <TextField
            label="月"
            required
            small
            keyboardType="numeric"
            maxLength={2}
            placeholder="月"
            value={value.month}
            onChangeText={(text) => onChange({ month: text })}
          />
        </View>
        <View style={{ flex: 1 }}>
          <TextField
            label="日"
            required
            small
            keyboardType="numeric"
            maxLength={2}
            placeholder="日"
            value={value.day}
            onChangeText={(text) => onChange({ day: text })}
          />
        </View>
        <View style={{ flex: 1.4 }}>
          <TextField
            label="起始年份（选填）"
            small
            keyboardType="numeric"
            maxLength={4}
            placeholder="年份"
            value={value.startYear}
            onChangeText={(text) => onChange({ startYear: text })}
          />
        </View>
      </View>
      <View style={{ flexDirection: 'row', gap: spacing.sm }}>
        <View style={{ flex: 1 }}>
          <ErrorText message={errors?.month} />
        </View>
        <View style={{ flex: 1 }}>
          <ErrorText message={errors?.day} />
        </View>
        <View style={{ flex: 1.4 }}>
          <ErrorText message={errors?.startYear} />
        </View>
      </View>
    </View>
  );
}

export { ErrorText };
