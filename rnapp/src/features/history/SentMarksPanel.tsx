/**
 * 心意详情底部「往年心意」面板（M11 T50/T51/T52）。
 *
 * - 通用版节日（T51）：没有归属人，不能标记；虚线盒引导先选一位已录入的人，
 *   选定后进入「节日 + 具体人」详情再标记，记录归到该人名下。
 * - 具体人且从未有过任何标记：原型 .recap 第一年态——手写体「今年，是第一次…」
 *   ＋说明（标记入口在上方各内容行内，本面板不放死按钮）。
 * - 当年有标记：三枚原型 .sentchip 状态章（祝福 / 礼物 / 贺卡；通用版无礼物的分支
 *   已在上方提前返回），点亮的可查看标记时间并取消；未点亮的提示去内容处标记。
 * - T52：状态章下方按年份倒序列出往年记录（祝福可复制、礼物可去看看、贺卡只读预览）；
 *   今年还没标但往年有记录时，不显示「第一次」，只给一句提示再接往年列表。
 * - 重新生成不影响已送出记录（拍板④）：标记保存的是标记那一刻的快照。
 */
import { ActivityIndicator, Alert, Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import type { ContentKind, Person, SentRecord } from '../../data/entities';
import { Button } from '../../components';
import type { FavoriteScope } from '../favorites/restore';
import { colors, fonts, fontSize, radius, spacing } from '../../theme/tokens';
import { BoxNote, BoxTitle, DashedBox } from '../content/SectionParts';
import { formatMarkedAt } from './format';
import { findYearKind, SENT_KIND_LABEL } from './sentDecision';
import { SentPastYears } from './SentPastYears';
import type { SentStateApi } from './useSentRecords';

/** 具体人详情固定三枚状态章（通用版无礼物区，但通用版走选人引导分支，不会到这里） */
const KINDS: ContentKind[] = ['blessing', 'gift', 'card'];

/** 单枚状态章：点亮＝蜜蜡洗底（原型 .sentchip.on）；未点亮＝苔绿描边纸底、不可点 */
function SentChip({
  kind,
  record,
  busy,
  onUnmark,
}: {
  kind: ContentKind;
  record: SentRecord | null;
  busy: boolean;
  onUnmark: (id: string) => void;
}) {
  const label = SENT_KIND_LABEL[kind];
  const active = record !== null;

  const onPress = () => {
    if (!record) {
      return;
    }
    const time = formatMarkedAt(record.markedAt);
    Alert.alert(
      `${label}已送出`,
      `${time ? `标记时间：${time}\n` : ''}保存的是标记那一刻的内容，重新生成不影响这条记录。`,
      [
        { text: '好', style: 'cancel' },
        { text: '取消标记', style: 'destructive', onPress: () => onUnmark(record.id) },
      ],
    );
  };

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active, disabled: !active, busy }}
      accessibilityLabel={active ? `${label}已送出` : `尚未标记${label}`}
      disabled={!active || busy}
      onPress={onPress}
      style={({ pressed }) => ({
        flex: 1,
        borderWidth: 1,
        borderRadius: 10,
        borderColor: active ? colors.honey : colors.sage,
        backgroundColor: active ? colors.honeyWash : colors.paper,
        paddingVertical: 9,
        paddingHorizontal: 4,
        opacity: !active ? 0.75 : pressed ? 0.7 : busy ? 0.5 : 1,
      })}
    >
      <Text
        style={{
          textAlign: 'center',
          fontFamily: active ? fonts.sansMedium : fonts.sans,
          fontSize: fontSize.footnote,
          color: active ? colors.honeyDeep : colors.inkSoft,
        }}
      >
        {active ? `✓ ${label}已送出` : `标记${label}`}
      </Text>
    </Pressable>
  );
}

export function SentMarksPanel({
  scope,
  api,
  person,
  isGenericFestival,
}: {
  scope: FavoriteScope;
  api: SentStateApi;
  /** 通用版节日为 null */
  person: Person | null;
  /** 是否为通用版节日详情（true 时渲染选人引导，T51） */
  isGenericFestival: boolean;
}) {
  const router = useRouter();
  const year = scope.key.year;

  // ---- T51：通用版必须先选人，标记归属于所选的人 ----
  if (isGenericFestival) {
    return (
      <DashedBox>
        <BoxTitle>标记送出前，先选一位具体的人</BoxTitle>
        <BoxNote>
          通用版节日内容没有归属对象。选一位已录入的人后再标记，这条记录会归到 TA 的往年心意里。
        </BoxNote>
        <View style={{ marginTop: spacing.xs, flexDirection: 'row' }}>
          <Button
            title="去选一位具体的人"
            variant="ghost"
            size="sm"
            onPress={() => router.push(`/festival/${scope.key.festivalCode}/select`)}
          />
        </View>
      </DashedBox>
    );
  }

  // 首次读取中：给小转圈，避免状态章闪烁（面板高度保持一行）
  if (api.records === null) {
    return (
      <View style={{ paddingVertical: spacing.lg, alignItems: 'center' }}>
        <ActivityIndicator color={colors.pine} />
      </View>
    );
  }

  const records = api.records;
  const yearRecords = KINDS.map((kind) => findYearKind(records, year, kind));
  const markedCount = yearRecords.filter((item) => item !== null).length;
  // 有任意非今年的记录就算有往年（分组排序在 SentPastYears 内做，这里只需有无判断）
  const hasPast = records.some((item) => item.year !== year);
  const who = person?.salutation?.trim() || person?.name || 'TA';
  // 生日用「庆生」，纪念日 / 节日用「过＋日子名」
  const firstTimeLine =
    scope.key.occasionType === 'birthday'
      ? `今年，是第一次给${who}庆生`
      : `今年，是第一次陪${who}过${scope.occasionName}`;

  // ---- 从未有过任何标记：原型第一年态（手写体），不渲染不可点的灰章 ----
  if (markedCount === 0 && !hasPast) {
    return (
      <View
        style={{
          borderWidth: 1,
          borderStyle: 'dashed',
          borderColor: colors.sage,
          borderRadius: radius.md,
          backgroundColor: colors.paperDim,
          paddingVertical: spacing.lg,
          paddingHorizontal: spacing.md,
          alignItems: 'center',
        }}
      >
        <Text style={{ fontFamily: fonts.hand, fontSize: 19, color: colors.pineDeep }}>
          {firstTimeLine}
        </Text>
        <Text
          style={{
            marginTop: 4,
            fontFamily: fonts.sans,
            fontSize: fontSize.footnote,
            lineHeight: 19,
            color: colors.inkFaint,
            textAlign: 'center',
          }}
        >
          送出祝福、礼物或贺卡后，在上方对应内容处点「标记送出」；明年起，这里会按年份记下送出过的心意。
        </Text>
      </View>
    );
  }

  // ---- 今年状态：三枚章（有标记时点亮；今年尚未标记但有往年记录时三枚全灰） ----
  return (
    <View>
      {markedCount > 0 ? (
        <>
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            {KINDS.map((kind, index) => (
              <SentChip
                key={kind}
                kind={kind}
                record={yearRecords[index]}
                busy={false}
                onUnmark={(id) => void api.unmark(id)}
              />
            ))}
          </View>
          <Text
            style={{
              marginTop: spacing.sm,
              fontFamily: fonts.sans,
              fontSize: fontSize.footnote,
              lineHeight: 18,
              color: colors.inkFaint,
            }}
          >
            标记保存的是送出那一刻的内容；祝福或礼物重新生成，不影响已送出的记录。
          </Text>
        </>
      ) : (
        <Text
          style={{
            fontFamily: fonts.sans,
            fontSize: fontSize.footnote,
            lineHeight: 18,
            color: colors.inkFaint,
          }}
        >
          今年还没有标记送出的心意；送出后，在上方对应内容处点「标记送出」。
        </Text>
      )}

      {/* T52：往年记录按年份倒序（hasPast 为 false 时不渲染，避免空占位） */}
      {hasPast ? (
        <View style={{ marginTop: markedCount > 0 ? spacing.lg : spacing.md }}>
          <SentPastYears records={records} currentYear={year} />
        </View>
      ) : null}
    </View>
  );
}
