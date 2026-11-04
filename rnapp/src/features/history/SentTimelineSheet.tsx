/**
 * 流水聚合行的回看弹层（M11 T70，门禁 G-A4③）。
 *
 * 零新路由：点历史 Tab 的聚合行，在历史页内底部 Sheet 只读回看这一「人 × 日子 × 年」
 * 下标记过的全部快照——祝福可复制、礼物可「去看看」、贺卡仅只读图文预览（第一版不给
 * 导出，与收藏贺卡的「导出图片」区分）。内容卡复用 SentSnapshotCard，平台 / 贺卡两个
 * 二层 Sheet 在本弹层内各挂一份（与 T49 收藏贺卡弹层同款嵌套，已真机验证可叠开）。
 */
import { useState } from 'react';
import { Text, View } from 'react-native';
import type { GiftPayload, SentRecord } from '../../data/entities';
import { Sheet } from '../../components';
import { colors, fonts, fontSize, spacing } from '../../theme/tokens';
import { GiftPlatformSheet } from '../gift/GiftPlatformSheet';
import { findYearKind, SENT_KIND_ORDER } from './sentDecision';
import { SentCardSheet } from './SentCardSheet';
import { SentSnapshotCard } from './SentSnapshotCard';
import { timelineTitle, type SentTimelineGroup } from './timeline';

export function SentTimelineSheet({
  group,
  onClose,
}: {
  /** null 表示关闭 */
  group: SentTimelineGroup | null;
  onClose: () => void;
}) {
  const [giftTerm, setGiftTerm] = useState<string | null>(null);
  const [cardRecord, setCardRecord] = useState<SentRecord | null>(null);

  return (
    <Sheet visible={group !== null} title={group ? `${timelineTitle(group)} · ${group.year}` : undefined} onClose={onClose}>
      {group ? (
        <View>
          <View style={{ gap: spacing.sm }}>
            {SENT_KIND_ORDER.map((kind) => {
              // 同年同类业务唯一，findYearKind 取即一条；没标过的种类不出现
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
          <Text
            style={{
              marginTop: spacing.sm,
              fontFamily: fonts.sans,
              fontSize: fontSize.footnote,
              lineHeight: 18,
              color: colors.inkFaint,
            }}
          >
            保存的是标记送出那一刻的内容，之后重新生成祝福、礼物或贺卡，不影响这里的记录。
          </Text>

          {/* 二层弹层：礼物平台选择 / 贺卡只读预览 */}
          <GiftPlatformSheet term={giftTerm} onClose={() => setGiftTerm(null)} />
          <SentCardSheet record={cardRecord} onClose={() => setCardRecord(null)} />
        </View>
      ) : null}
    </Sheet>
  );
}
