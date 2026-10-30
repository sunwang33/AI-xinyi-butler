/**
 * 删除人员二次确认弹层（T13），复用 src/components/Sheet。
 * 文案必须明确告知：为该人物收藏的内容和往年心意记录也会一并删除。
 * 取消 / 点遮罩均不产生任何变化；确认后由页面执行级联删除。
 */
import { Text, View } from 'react-native';
import { Button, Sheet } from '../../components';
import { colors, fontSize, spacing } from '../../theme/tokens';

export function DeletePersonSheet({
  visible,
  name,
  deleting = false,
  onCancel,
  onConfirm,
}: {
  visible: boolean;
  name: string;
  /** 确认删除进行中：按钮 loading，禁止重复确认 */
  deleting?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <Sheet visible={visible} title="删除此人" onClose={deleting ? undefined : onCancel} dismissable={!deleting}>
      <Text style={{ fontSize: fontSize.base, lineHeight: 23, color: colors.ink }}>
        确定删除「{name}」吗？删除后无法恢复。
      </Text>
      <Text style={{ marginTop: spacing.sm, fontSize: fontSize.body, lineHeight: 21, color: colors.inkSoft }}>
        TA 的档案、纪念日、特征，以及为该人物收藏的内容和往年心意记录也会一并删除。
      </Text>
      <View style={{ flexDirection: 'row', gap: spacing.md, marginTop: spacing.xl }}>
        <Button title="取消" variant="ghost" style={{ flex: 1 }} disabled={deleting} onPress={onCancel} />
        <Button title="确认删除" variant="honey" style={{ flex: 1 }} loading={deleting} onPress={onConfirm} />
      </View>
    </Sheet>
  );
}
