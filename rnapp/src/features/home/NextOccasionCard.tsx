/**
 * 提醒页「下一位」主卡（T65 / spec 第 4 条 / 原型 F5 .hero）：
 * - 宋体大字「下一位，是{称呼}的{日子名}」+ 日期星期 + 倒计时副文案；
 * - 点按进入该日子的心意详情（plan 3.2）；
 * - 右上角为 D20「心意已就绪」邮戳位：就绪条件 = 当年祝福与礼物快照均已生成
 *   （贺卡仅锦上添花，不作就绪条件；见原型「主卡未就绪」状态注记）。
 *   M6/M7 快照能力尚未实现，本任务邮戳位一律留白，不渲染 Stamp、不接假数据；
 *   就绪后在此渲染 <Stamp variant="ready" day={hit.daysFromToday} />，
 *   副文案同时改为「祝福语、礼物、贺卡都已备好」。
 * 原型 .hero 为暖米色横向渐变，工程未装 expo-linear-gradient 且本任务禁止加依赖，
 * 故以 tokens 信纸白底 + 蜜蜡洗色描边作同色系实体近似。
 */
import { Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { colors, fonts, fontSize, spacing } from '../../theme/tokens';
import type { OccasionHit } from '../occasions/engine';
import { buildOccasionHref } from '../occasions/routes';
import { formatFullDate } from './dateLabel';

/** 邮戳位固定尺寸（同 Stamp ready 默认 90px），留白时也占位以稳定卡片布局 */
const STAMP_SLOT = 90;

export function NextOccasionCard({ hit }: { hit: OccasionHit }) {
  const router = useRouter();
  // 人员日子必带称呼（salutation ?? name），档案缺失时退化为「对方」
  const subject = hit.subjectName ?? '对方';
  const subCopy = hit.daysFromToday === 0 ? '就是今天' : `还有 ${hit.daysFromToday} 天`;

  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push(buildOccasionHref(hit))}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.md,
        backgroundColor: colors.paper,
        borderWidth: 1,
        borderColor: colors.honeyWash,
        borderRadius: 18,
        paddingHorizontal: spacing.lg,
        paddingVertical: spacing.lg,
        opacity: pressed ? 0.7 : 1,
      })}
    >
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text
          style={{
            fontFamily: fonts.serif,
            fontSize: fontSize.title2,
            lineHeight: 32,
            color: colors.ink,
          }}
        >
          {`下一位，是${subject}的${hit.title}`}
        </Text>
        <Text
          style={{
            marginTop: 7,
            fontFamily: fonts.sans,
            fontSize: fontSize.small,
            color: colors.inkSoft,
          }}
        >
          {formatFullDate(hit.date)}
        </Text>
        <Text
          style={{
            marginTop: 5,
            fontFamily: fonts.sans,
            fontSize: fontSize.footnote,
            color: colors.honeyDeep,
          }}
        >
          {subCopy}
        </Text>
      </View>

      {/* 邮戳位：M6/M7 当年祝福与礼物快照均生成前留白，详见文件头注释 */}
      <View style={{ width: STAMP_SLOT, height: STAMP_SLOT }} />
    </Pressable>
  );
}
