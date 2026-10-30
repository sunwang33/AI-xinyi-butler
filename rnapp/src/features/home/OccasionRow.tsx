/**
 * 首页临近日子列表行（T17，spec 第 4 条）：
 * - 生日/纪念日显「对象　日子名称」（全角空格，如「妈妈　生日」「老王　领证日」）；
 * - 节日行只显节日中文名（无对象）；
 * - 右侧剩余天数：当天显「今天」+ 8px 蜜蜡色圆点，其余显「还有 N 天」；
 * - 点击生日/纪念日进心意详情壳，节日进节日选人页。
 * 不按 disabled 做任何置灰或过滤（关闭提醒只停推送，spec 第 5 条）。
 */
import { Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { ListRow } from '../../components';
import { colors, fonts, fontSize, spacing } from '../../theme/tokens';
import type { OccasionHit } from '../occasions/engine';
import { buildFestivalSelectHref, buildOccasionHref } from '../occasions/routes';

/** 右侧剩余天数：当天「今天」+ 蜜蜡圆点（8px 正圆），未来「还有 N 天」 */
function DaysRight({ days }: { days: number }) {
  if (days === 0) {
    return (
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
        <Text style={{ fontFamily: fonts.sansMedium, fontSize: fontSize.base, color: colors.honeyDeep }}>
          今天
        </Text>
        <View
          style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.honey }}
        />
      </View>
    );
  }
  return (
    <Text style={{ fontFamily: fonts.sans, fontSize: fontSize.base, color: colors.inkSoft }}>
      还有 {days} 天
    </Text>
  );
}

export function OccasionRow({ hit }: { hit: OccasionHit }) {
  const router = useRouter();

  // 节日没有对象，只显节日中文名；生日/纪念日显「对象　日子名称」；
  // subjectName 理论上必在（纪念日必属于在档人员），缺失时退化为只显日子名称。
  const title =
    hit.occasionType === 'festival' || !hit.subjectName
      ? hit.title
      : `${hit.subjectName}　${hit.title}`;

  const onPress = () => {
    if (hit.occasionType === 'festival') {
      // 节日命中必带 festivalCode，此处 narrowing 兜底
      if (hit.festivalCode) {
        router.push(buildFestivalSelectHref(hit.festivalCode, hit.year));
      }
      return;
    }
    router.push(buildOccasionHref(hit));
  };

  return (
    <ListRow title={title} right={<DaysRight days={hit.daysFromToday} />} onPress={onPress} />
  );
}
