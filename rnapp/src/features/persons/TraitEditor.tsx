/**
 * 单条特征编辑行（T11）：0–5 条、单条 ≤30 字。
 * maxLength 阻止第 31 个字；超限错误文案由表单校验兜底。
 * 纯受控组件，状态由 usePersonForm 统一管理。
 */
import { Text, View } from 'react-native';
import { Button, TextField } from '../../components';
import { colors, fontSize, spacing } from '../../theme/tokens';
import { MAX_TRAIT_LENGTH, type TraitDraft } from './personFormSchema';

export function TraitEditor({
  value,
  index,
  error,
  onChange,
  onRemove,
}: {
  value: TraitDraft;
  index: number;
  error?: string;
  onChange: (content: string) => void;
  onRemove: () => void;
}) {
  return (
    <View style={{ marginBottom: spacing.sm }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
        <View style={{ flex: 1 }}>
          <TextField
            small
            placeholder={`特征 ${index + 1}，如：爱养花，今年刚退休`}
            maxLength={MAX_TRAIT_LENGTH}
            value={value.content}
            onChangeText={onChange}
          />
        </View>
        <Button title="删除" variant="ghost" size="sm" onPress={onRemove} />
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: -4, marginBottom: 6 }}>
        <Text style={{ marginLeft: 2, fontSize: fontSize.footnote, color: colors.honeyDeep }}>{error ?? ''}</Text>
        <Text style={{ marginRight: 2, fontSize: fontSize.footnote, color: colors.inkFaint }}>
          {value.content.length}/{MAX_TRAIT_LENGTH}
        </Text>
      </View>
    </View>
  );
}
