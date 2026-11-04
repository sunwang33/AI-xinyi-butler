/**
 * 单条已送出记录的只读快照卡（M11 T52 往年回顾 / T70 流水回看共用）。
 * 视觉语言与 M10 收藏快照卡一致（白纸卡 + 类型标签 + 内容 + 右下角动作）：
 * - 祝福：宋体全文＋「复制」（复制标记那一刻的文案，与详情页同款药丸）；
 * - 礼物：礼物名＋为什么适合 TA＋「去看看」（平台 Sheet 由外层容器统一挂）；
 * - 贺卡：模板缩略＋名称/文案预览＋「预览贺卡」（只读 Postcard Sheet 由外层挂）。
 * 卡内不放撤销：撤销只在该年详情的状态章上进行，历史 / 往年区一律只读回看（G-A4）。
 */
import { useState } from 'react';
import { Image, Pressable, Text, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import Svg, { Path } from 'react-native-svg';
import type { BlessingPayload, CardPayload, GiftPayload, SentRecord } from '../../data/entities';
import { getCardTemplate } from '../card/templates';
import { FavoriteTypeTag } from '../favorites/FavoriteTypeTag';
import { colors, fonts, fontSize, radius, spacing } from '../../theme/tokens';
import { formatMarkedAt } from './format';

/** 礼物盒小图标（与收藏快照卡同款：梯形盒身 + 提手，蜜蜡色） */
function GiftBoxIcon() {
  return (
    <Svg width={19} height={19} viewBox="0 0 24 24" fill="none">
      <Path
        d="M6 8h12l-1.5 12h-9z"
        stroke={colors.honeyDeep}
        strokeWidth={1.6}
        strokeLinejoin="round"
      />
      <Path
        d="M10 8V5a2 2 0 0 1 4 0v3"
        stroke={colors.honeyDeep}
        strokeWidth={1.6}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

/** 右下描边小药丸（复制 / 去看看 / 预览贺卡），与详情页、收藏卡样式一致 */
function ActionPill({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => ({
        borderWidth: 1,
        borderColor: colors.sage,
        borderRadius: radius.pill,
        backgroundColor: colors.paper,
        paddingHorizontal: spacing.md,
        paddingVertical: 5,
        opacity: pressed ? 0.6 : 1,
      })}
    >
      <Text style={{ fontFamily: fonts.sansMedium, fontSize: fontSize.small, color: colors.pineDeep }}>
        {label}
      </Text>
    </Pressable>
  );
}

/** 卡头：类型标签 ＋ 标记时间（右侧小字） */
function CardMeta({ record }: { record: SentRecord }) {
  const time = formatMarkedAt(record.markedAt);
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginBottom: 8,
        paddingHorizontal: 2,
      }}
    >
      <FavoriteTypeTag kind={record.kind} />
      <Text
        style={{ flex: 1, textAlign: 'right', fontFamily: fonts.sans, fontSize: fontSize.caption, color: colors.inkFaint }}
      >
        {time ? `${time}标记` : ''}
      </Text>
    </View>
  );
}

/** 白纸快照卡容器 */
function SnapshotCard({ children }: { children: React.ReactNode }) {
  return (
    <View
      style={{
        backgroundColor: colors.paper,
        borderWidth: 1,
        borderColor: colors.line,
        borderRadius: radius.md,
        padding: spacing.md,
      }}
    >
      {children}
    </View>
  );
}

export function SentSnapshotCard({
  record,
  onOpenGift,
  onOpenCard,
}: {
  record: SentRecord;
  /** 礼物「去看看」：把该条礼物的搜索词交给外层统一挂的平台 Sheet */
  onOpenGift: (record: SentRecord) => void;
  /** 贺卡「预览贺卡」：把该条贺卡记录交给外层统一挂的只读预览 Sheet */
  onOpenCard: (record: SentRecord) => void;
}) {
  const [copied, setCopied] = useState(false);

  if (record.kind === 'blessing') {
    const text = (record.payload as BlessingPayload).text;
    return (
      <SnapshotCard>
        <CardMeta record={record} />
        <Text style={{ fontFamily: fonts.serif, fontSize: fontSize.base, lineHeight: 28, color: colors.ink }}>
          {text}
        </Text>
        <View style={{ flexDirection: 'row', justifyContent: 'flex-end', marginTop: spacing.sm }}>
          <ActionPill
            label={copied ? '已复制' : '复制'}
            onPress={() => {
              void Clipboard.setStringAsync(text).then(() => {
                setCopied(true);
                setTimeout(() => setCopied(false), 1600);
              });
            }}
          />
        </View>
      </SnapshotCard>
    );
  }

  if (record.kind === 'gift') {
    const gift = record.payload as GiftPayload;
    return (
      <SnapshotCard>
        <CardMeta record={record} />
        <View style={{ flexDirection: 'row', gap: 11, alignItems: 'center' }}>
          <View
            style={{
              width: 38,
              height: 38,
              borderRadius: 9,
              backgroundColor: colors.honeyWash,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <GiftBoxIcon />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={{ fontFamily: fonts.serif, fontSize: fontSize.rowTitle, color: colors.ink }} numberOfLines={1}>
              {gift.name}
            </Text>
            <Text
              style={{
                fontFamily: fonts.sans,
                fontSize: fontSize.footnote,
                lineHeight: 19,
                color: colors.inkSoft,
                marginTop: 2,
              }}
              numberOfLines={2}
            >
              {gift.reason}
            </Text>
          </View>
        </View>
        <View style={{ flexDirection: 'row', justifyContent: 'flex-end', marginTop: spacing.sm }}>
          <ActionPill label="去看看" onPress={() => onOpenGift(record)} />
        </View>
      </SnapshotCard>
    );
  }

  // card：缩略图 + 模板名/文案预览，点「预览贺卡」只读重渲
  const card = record.payload as CardPayload;
  const template = getCardTemplate(card.template_code);
  const preview = card.text.trim() || '未写祝福的贺卡';
  return (
    <SnapshotCard>
      <CardMeta record={record} />
      <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
        <Image
          source={template.art}
          style={{
            width: 44,
            height: 59,
            borderRadius: radius.sm,
            borderWidth: 1,
            borderColor: colors.line,
          }}
        />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ fontFamily: fonts.serif, fontSize: fontSize.base, color: colors.ink }} numberOfLines={1}>
            {template.name} · 贺卡
          </Text>
          <Text
            style={{
              fontFamily: fonts.sans,
              fontSize: fontSize.footnote,
              color: colors.inkSoft,
              marginTop: 2,
            }}
            numberOfLines={1}
          >
            {preview}
          </Text>
        </View>
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'flex-end', marginTop: spacing.sm }}>
        <ActionPill label="预览贺卡" onPress={() => onOpenCard(record)} />
      </View>
    </SnapshotCard>
  );
}
