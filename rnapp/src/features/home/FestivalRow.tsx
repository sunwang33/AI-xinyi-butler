/**
 * 通用节日倒计时行（T65，原型 F5 节日区 .pc-row + .pill；T66 接入 F11 就地取关）：
 * - 左侧节日名首字夜青色邮票头像，中间节日名 + 「M 月 D 日」，右侧倒计时药丸；
 * - 当天药丸转蜜蜡实心白字（原型 .pill.today）；
 * - 药丸左侧实心蜜蜡星（原型 .fav-star，内联 SVG）=已关注；点按弹二次确认，
 *   确认后写 festival_settings.disabled=1，本行由数据钩子刷新后从节日区消失，
 *   并重算通知调度；重新关注的唯一入口是分区标题「已关注 N 个」打开的管理 Sheet；
 * - 点按行其余区域进入节日选人页（plan 3.2）；取关后该行不再展示，故无入口可进。
 */
import { useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import Svg, { Path } from 'react-native-svg';
import { ListRow } from '../../components';
import { colors, fonts, fontSize, radius, spacing } from '../../theme/tokens';
import { getRepository } from '../../data/repository';
import type { OccasionHit } from '../occasions/engine';
import { rescheduleReminders } from '../reminders/scheduler';
import { buildFestivalSelectHref } from '../occasions/routes';
import { formatMonthDay } from './dateLabel';

/** 已关注星标：原型五角星 path，蜜蜡实心，28px 点击位、17px 图形 */
function FollowStar({ onPress }: { onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="取消关注这个节日"
      hitSlop={8}
      onPress={onPress}
      style={{
        width: 28,
        height: 28,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Svg width={17} height={17} viewBox="0 0 24 24" fill={colors.honey}>
        <Path d="m12 3 2.6 5.6 6.1.7-4.5 4.2 1.2 6-5.4-3-5.4 3 1.2-6L3.3 9.3l6.1-.7z" />
      </Svg>
    </Pressable>
  );
}

/** 右侧：关注星标 + 倒计时药丸（当天「今天」蜜蜡实心，其余「还有 N 天」苔绿描边） */
function RowRight({
  days,
  onUnfollow,
}: {
  days: number;
  onUnfollow: () => void;
}) {
  const today = days === 0;
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm,
      }}
    >
      <FollowStar onPress={onUnfollow} />
      <View
        style={{
          borderRadius: radius.pill,
          borderWidth: 1,
          borderColor: today ? colors.honey : colors.sage,
          backgroundColor: today ? colors.honey : colors.paper,
          paddingHorizontal: 13,
          paddingVertical: 6,
        }}
      >
        <Text
          style={{
            fontFamily: fonts.sans,
            fontSize: fontSize.small,
            color: today ? colors.white : colors.pineDeep,
          }}
        >
          {today ? '今天' : `还有 ${days} 天`}
        </Text>
      </View>
    </View>
  );
}

export function FestivalRow({
  hit,
  onChanged,
}: {
  hit: OccasionHit;
  /** 取关写库完成后回调：触发页面静默重算（节日区移除该行） */
  onChanged: () => void;
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);

  const confirmUnfollow = () => {
    if (saving || !hit.festivalCode) {
      return;
    }
    // 二次确认：明确告知不提醒、不展示，以及恢复入口
    Alert.alert(
      `取消关注「${hit.title}」？`,
      '取关后不再提醒，也不会在节日区展示；可随时在节日管理中重新关注。',
      [
        { text: '再想想', style: 'cancel' },
        {
          text: '取关',
          style: 'destructive',
          onPress: () => {
            void doUnfollow();
          },
        },
      ],
    );
  };

  const doUnfollow = async () => {
    if (!hit.festivalCode) {
      return;
    }
    setSaving(true);
    try {
      const repo = await getRepository();
      await repo.setFestivalDisabled(hit.festivalCode, true);
      // 重算调度：T68 守卫已保证拒权时短路，此处不关心权限
      rescheduleReminders().catch(() => {});
      onChanged();
    } catch {
      Alert.alert('操作失败', '关注状态没有保存，请稍后重试。');
      setSaving(false);
    }
  };

  const onPress = () => {
    // 节日命中必带 festivalCode，此处 narrowing 兜底
    if (hit.festivalCode) {
      router.push(buildFestivalSelectHref(hit.festivalCode, hit.year));
    }
  };

  return (
    <ListRow
      avatar={hit.title.slice(0, 1)}
      avatarTone="night"
      title={hit.title}
      subtitle={formatMonthDay(hit.date)}
      right={<RowRight days={hit.daysFromToday} onUnfollow={confirmUnfollow} />}
      onPress={onPress}
    />
  );
}
