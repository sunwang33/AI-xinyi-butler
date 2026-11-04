/**
 * 服务说明（plan 3.1 /service-notice，M6 T29；M12 T57 补账号与云端同步）。
 * 设置页常驻入口；说明 AI 信息发送范围、快照规则、离线可用范围与账号数据用途。
 * T28 B 组门禁（2026-10-31 拍板）：本页提供「撤回 AI 生成同意」入口。
 */
import { useState, type ReactNode } from 'react';
import { Text, View } from 'react-native';
import { Button, Card, PageHeader, Screen, Sheet } from '../src/components';
import { useAiConsent } from '../src/features/consent/useAiConsent';
import { colors, fonts, fontSize, spacing } from '../src/theme/tokens';

function NoticeSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card>
      <Text style={{ fontFamily: fonts.serif, fontSize: fontSize.title3, color: colors.ink }}>
        {title}
      </Text>
      <View style={{ marginTop: spacing.sm, gap: spacing.sm }}>{children}</View>
    </Card>
  );
}

function Paragraph({ children }: { children: ReactNode }) {
  return (
    <Text style={{ fontFamily: fonts.sans, fontSize: fontSize.body, lineHeight: 22, color: colors.ink }}>
      {children}
    </Text>
  );
}

export default function ServiceNoticeScreen() {
  const { consent, reset } = useAiConsent();
  const [confirmVisible, setConfirmVisible] = useState(false);
  const [busy, setBusy] = useState(false);

  const onWithdraw = async () => {
    setBusy(true);
    try {
      await reset();
      setConfirmVisible(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen scroll>
      <PageHeader title="服务说明" />

      <View style={{ gap: spacing.lg }}>
        <NoticeSection title="信息如何被使用">
          <Paragraph>
            生成祝福与礼物建议时，App 会把以下信息发送到 AI 服务处理：你为 TA
            填写的关系、特征描述、你对 TA 的称呼、你的自称，以及日子类型（生日 / 纪念日 /
            节日）和纪念日周年信息。
          </Paragraph>
          <Paragraph>
            姓名、出生年份等与生成无关的信息不会发送。AI 服务由 DeepSeek
            提供，请求经我们自己的服务端转发：API 密钥只保存在服务端，服务端不保存你发送的信息，服务日志也不记录姓名与特征。
          </Paragraph>
        </NoticeSection>

        <NoticeSection title="生成一次，当年固定">
          <Paragraph>
            每个「人 × 日子 × 年份」的祝福与礼物在首次打开心意详情时生成一次，之后当年内再次打开（包括从通知点入）看到的都是同一份内容。
          </Paragraph>
          <Paragraph>
            修改人物资料或调整祝福条数不会改动已生成的内容；在心意详情点「重新生成」，才会按最新资料与设置替换当年快照。
          </Paragraph>
        </NoticeSection>

        <NoticeSection title="离线时能用什么">
          <Paragraph>
            已经生成的祝福与礼物在无网络时仍可完整查看；尚未生成的内容需要联网。祝福连续 3
            次生成失败时，会先显示一组不针对个人的通用祝福，网络恢复后可重新生成覆盖。
          </Paragraph>
        </NoticeSection>

        <NoticeSection title="账号登录与云端同步">
          <Paragraph>
            账号登录是可选的：不登录时，全部功能都可以在本机正常使用，数据只保存在这台手机上。
          </Paragraph>
          <Paragraph>
            登录账号后，以下数据会自动同步到云端：人员资料、纪念日、人物特征、已生成的祝福与礼物、贺卡状态、收藏与已送出记录。更换手机或卸载重装后，登录同一账号即可恢复这些数据。
          </Paragraph>
          <Paragraph>
            提醒设置、节日关注设置与本机通知记录只保存在手机上，不会上传云端。云端数据库由
            Supabase 提供，数据存储在境外服务器，详情以隐私政策为准。
          </Paragraph>
          <Paragraph>
            登录状态下没有网络时，数据暂时只能查看、不能增改，恢复网络后会自动续上同步。退出登录时，你可以选择把本机数据一并清除，或保留在这台手机上。
          </Paragraph>
        </NoticeSection>

        <NoticeSection title="AI 生成授权">
          <Paragraph>
            当前状态：{consent === 'agreed' ? '已同意 AI 生成告知' : '尚未同意（首次生成前会再次告知）'}
          </Paragraph>
          {consent === 'agreed' ? (
            <View style={{ marginTop: spacing.xs }}>
              <Button
                title="撤回 AI 生成同意"
                variant="ghost"
                size="sm"
                onPress={() => setConfirmVisible(true)}
              />
              <Text style={{ fontFamily: fonts.sans, fontSize: fontSize.small, lineHeight: 20, color: colors.inkSoft, marginTop: spacing.sm }}>
                撤回后，已生成的祝福与礼物仍可正常查看；下次生成前会重新弹出告知，由你再次选择。
              </Text>
            </View>
          ) : null}
        </NoticeSection>
      </View>

      <Sheet visible={confirmVisible} title="撤回 AI 生成同意？" onClose={() => setConfirmVisible(false)}>
        <Paragraph>
          撤回后不会删除已生成的祝福与礼物；之后再次使用生成功能时，会重新看到告知说明。
        </Paragraph>
        <View style={{ marginTop: spacing.lg, gap: spacing.sm }}>
          <Button title="确认撤回" variant="honey" block loading={busy} onPress={onWithdraw} />
          <Button title="再想想" variant="ghost" block disabled={busy} onPress={() => setConfirmVisible(false)} />
        </View>
      </Sheet>
    </Screen>
  );
}
