/**
 * 历史 Tab「已送出」全局流水列表（M11 T69 列表 / T70 回看入口，对应原型 .pickrow 行）。
 *
 * - 仓储扁平行经 groupSentTimeline 按「人 × 日子 × 年」聚合成一行：
 *   左为印泥红「已送」邮戳（组内最新标记日），标题「谁的什么日子 年份」，
 *   副行「M月D日送出 · 祝福 · 礼物 · 贺卡」；
 * - 三态：首次加载转圈；读取失败给错误态与「重试」（不与空状态混淆）；从未标记给空状态；
 * - 点按聚合行开 SentTimelineSheet 在本页内只读回看（T70，零新路由）。
 */
import { useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { Button, EmptyState, ListRow, Stamp } from '../../components';
import { colors, fonts, fontSize, spacing } from '../../theme/tokens';
import { SentTimelineSheet } from './SentTimelineSheet';
import {
  groupSentTimeline,
  stampDayOf,
  timelineSubtitle,
  timelineTitle,
  type SentTimelineGroup,
} from './timeline';
import { useSentTimeline } from './useSentTimeline';

export function SentTimeline() {
  const { rows, error, reload } = useSentTimeline();
  const [selected, setSelected] = useState<SentTimelineGroup | null>(null);

  if (rows === null) {
    return (
      <View style={{ paddingVertical: spacing.xxl, alignItems: 'center' }}>
        <ActivityIndicator color={colors.pine} />
      </View>
    );
  }

  if (error) {
    return (
      <EmptyState
        title="流水暂时打不开"
        description="本地数据读取失败，请稍后再试。"
        action={
          <Button title="重新加载" variant="ghost" size="sm" onPress={reload} />
        }
      />
    );
  }

  const groups = groupSentTimeline(rows);
  if (groups.length === 0) {
    return (
      <EmptyState
        title="还没有标记过已送出的心意"
        description="标记过送出的祝福、礼物与贺卡会留在这里。"
      />
    );
  }

  return (
    <View>
      <View style={{ gap: 12 }}>
        {groups.map((group) => {
          const day = stampDayOf(group.lastMarkedAt);
          return (
            <ListRow
              key={`${group.personId}|${group.occasionType}|${group.anniversaryId ?? ''}|${group.festivalCode ?? ''}|${group.year}`}
              left={<Stamp variant="sent" day={day === null ? '·' : day} />}
              title={
                <Text>
                  {timelineTitle(group)}{' '}
                  <Text style={{ fontFamily: fonts.sans, fontSize: 11, color: colors.inkSoft }}>
                    {group.year}
                  </Text>
                </Text>
              }
              subtitle={timelineSubtitle(group)}
              showChevron
              onPress={() => setSelected(group)}
            />
          );
        })}
      </View>
      <Text
        style={{
          marginTop: spacing.lg,
          fontFamily: fonts.sans,
          fontSize: fontSize.footnote,
          lineHeight: 18,
          color: colors.inkFaint,
        }}
      >
        按最近一次标记时间倒序；点一行可回看那年送出的祝福、礼物与贺卡。
      </Text>

      <SentTimelineSheet group={selected} onClose={() => setSelected(null)} />
    </View>
  );
}
