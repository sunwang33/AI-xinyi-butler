/**
 * 首次 AI 生成告知弹层（T28 / spec 第 13 条）。
 * 未同意前不发送任何信息、不生成内容；「暂不同意」仅关弹层，入口保留。
 */
import { Text, View } from 'react-native';
import { Button, Sheet } from '../../components';
import { colors, fonts, fontSize, spacing } from '../../theme/tokens';

const BODY = [
  '准备祝福与礼物建议时，以下信息会发送到 AI 服务（DeepSeek，经 Supabase 云函数中转）处理：',
  '· 你为 TA 填写的关系、特征描述、你对 TA 的称呼、你的自称；',
  '· 日子类型（生日 / 纪念日 / 具体节日）与纪念日周年信息。',
  '姓名、出生年份等与生成无关的信息不会发送；云函数不保存这些信息。生成的内容只存在你的手机上，当年固定，可随时手动重新生成。',
] as const;

export function ConsentSheet({
  visible,
  busy = false,
  onAgree,
  onDecline,
}: {
  visible: boolean;
  busy?: boolean;
  onAgree: () => void;
  onDecline: () => void;
}) {
  return (
    <Sheet visible={visible} title="AI 生成告知" dismissable={false}>
      <View style={{ gap: spacing.sm }}>
        {BODY.map((line) => (
          <Text
            key={line}
            style={{
              fontFamily: fonts.sans,
              fontSize: fontSize.body,
              lineHeight: 22,
              color: colors.ink,
            }}
          >
            {line}
          </Text>
        ))}
        <Text
          style={{
            fontFamily: fonts.sans,
            fontSize: fontSize.small,
            lineHeight: 20,
            color: colors.inkSoft,
          }}
        >
          完整说明可随时在「设置 → 服务说明」查看。
        </Text>
      </View>

      <View style={{ marginTop: spacing.lg, gap: spacing.sm }}>
        <Button title="同意并生成" block loading={busy} onPress={onAgree} />
        <Button title="暂不同意" variant="ghost" block disabled={busy} onPress={onDecline} />
      </View>
    </Sheet>
  );
}
