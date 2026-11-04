/**
 * 心意详情「往年心意」按年倒序回顾（M11 T52）。
 *
 * - 同一人同一日子、除当前详情年份外的记录，按年份倒序分组，组内固定
 *   祝福 → 礼物 → 贺卡顺序；无往年记录时渲染 null（由面板决定第一年态）；
 * - 每条是标记那一刻的完整快照（重新生成不影响，G-A4 拍板④），祝福可复制、
 *   礼物可「去看看」、贺卡可只读预览，均不提供编辑 / 撤销；
 * - 礼物平台 Sheet 与贺卡预览 Sheet 在列表级只挂一份，靠选中项切换。
 */
import { useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import type { GiftPayload, SentRecord } from '../../data/entities';
import { GiftPlatformSheet } from '../gift/GiftPlatformSheet';
import { colors, fonts, fontSize, spacing } from '../../theme/tokens';
import { groupPastYears, findYearKind, SENT_KIND_ORDER } from './sentDecision';
import { SentCardSheet } from './SentCardSheet';
import { SentSnapshotCard } from './SentSnapshotCard';

export function SentPastYears({
  records,
  currentYear,
}: {
  records: readonly SentRecord[];
  currentYear: number;
}) {
  const groups = useMemo(() => groupPastYears(records, currentYear), [records, currentYear]);
  const [giftTerm, setGiftTerm] = useState<string | null>(null);
  const [cardRecord, setCardRecord] = useState<SentRecord | null>(null);

  if (groups.length === 0) {
    return null;
  }

  return (
    <View>
      {groups.map((group, groupIndex) => (
        <View key={group.year} style={{ marginTop: groupIndex === 0 ? 0 : spacing.lg }}>
          {/* 年份头：宋体 + 右侧细横线 */}
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: spacing.sm,
              marginBottom: spacing.sm,
            }}
          >
            <Text style={{ fontFamily: fonts.serif, fontSize: fontSize.rowTitle, color: colors.pineDeep }}>
              {group.year} 年
            </Text>
            <View style={{ flex: 1, height: 1, backgroundColor: colors.line }} />
          </View>
          <View style={{ gap: spacing.sm }}>
            {SENT_KIND_ORDER.map((kind) => {
              const record = findYearKind(group.records, group.year, kind);
              if (!record) {
                return null;
              }
              return (
                <SentSnapshotCard
                  key={kind}
                  record={record}
                  onOpenGift={(item) => setGiftTerm((item.payload as GiftPayload).search_term)}
                  onOpenCard={(item) => setCardRecord(item)}
                />
              );
            })}
          </View>
        </View>
      ))}

      {/* 列表级各挂一份：礼物平台选择 / 贺卡只读预览 */}
      <GiftPlatformSheet term={giftTerm} onClose={() => setGiftTerm(null)} />
      <SentCardSheet record={cardRecord} onClose={() => setCardRecord(null)} />
    </View>
  );
}
