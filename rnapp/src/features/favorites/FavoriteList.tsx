/**
 * 历史 Tab · 收藏分区列表（M10 T49，对应原型「历史 Tab · 收藏分区 D19」）。
 *
 * - 顶部 chips「全部 / 祝福 / 礼物 / 贺卡」按类型筛选；列表本身仓储已按收藏时间倒序；
 * - 三类清晰区分，每行先给类型标签与「为 谁 · 什么日子 · 哪一年」与邮戳「藏」，
 *   再给内容卡：祝福可复制、礼物「去看看」（复用电商平台 Sheet）、贺卡「导出图片」
 *   （弹层重渲截图）；每张卡都能「取消收藏」（只删收藏行）；
 * - 内容全部来自收藏那一刻的完整快照，离线可见、不受之后重新生成影响。
 */
import { useState, type ReactNode } from 'react';
import { ActivityIndicator, Image, Pressable, Text, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import Svg, { Path, Rect } from 'react-native-svg';
import { Chip, EmptyState, Sheet, Stamp } from '../../components';
import type {
  BlessingPayload,
  CardPayload,
  ContentKind,
  Favorite,
  GiftPayload,
} from '../../data/entities';
import { getCardTemplate } from '../card/templates';
import { GIFT_PLATFORMS, openGiftSearch } from '../gift/link';
import { colors, fonts, fontSize, radius, spacing } from '../../theme/tokens';
import { BookmarkButton } from './FavoriteToggle';
import { FavoriteCardSheet } from './FavoriteCardSheet';
import { FavoriteTypeTag } from './FavoriteTypeTag';
import { favoriteMetaLine } from './restore';
import { useFavorites } from './useFavorites';

type Filter = 'all' | ContentKind;

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'blessing', label: '祝福' },
  { key: 'gift', label: '礼物' },
  { key: 'card', label: '贺卡' },
];

/** 复制小图标（原型 .iconbtn 双矩形） */
function CopyIcon({ color }: { color: string }) {
  return (
    <Svg width={15} height={15} viewBox="0 0 24 24" fill="none">
      <Rect x={8} y={8} width={11} height={11} rx={2} stroke={color} strokeWidth={1.7} />
      <Path
        d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"
        stroke={color}
        strokeWidth={1.7}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

/** 礼物盒小图标（原型 .g-stamp：梯形盒身 + 提手） */
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

/** 描边小胶囊（礼物「去看看」、贺卡「导出图片」），与详情页样式一致 */
function ActionPill({ label, onPress, busy }: { label: string; onPress: () => void; busy?: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={busy}
      onPress={onPress}
      style={({ pressed }) => ({
        borderWidth: 1,
        borderColor: colors.sage,
        borderRadius: radius.pill,
        backgroundColor: colors.paper,
        paddingHorizontal: spacing.md,
        paddingVertical: 5,
        opacity: busy ? 0.5 : pressed ? 0.6 : 1,
      })}
    >
      <Text style={{ fontFamily: fonts.sansMedium, fontSize: fontSize.small, color: colors.pineDeep }}>
        {label}
      </Text>
    </Pressable>
  );
}

/** 内容卡通用白纸容器（原型 .letter / .gift / .pickrow） */
function ContentCard({ children }: { children: ReactNode }) {
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

/** 卡底部操作行：左取消收藏（书签）、右主动作 */
function CardActions({ onRemove, action }: { onRemove: () => void; action: ReactNode }) {
  return (
    <View
      style={{
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginTop: spacing.sm,
      }}
    >
      <BookmarkButton active activeLabel="取消收藏" onPress={onRemove} />
      {action}
    </View>
  );
}

export function FavoriteList() {
  const { favorites, removeById } = useFavorites();
  const [filter, setFilter] = useState<Filter>('all');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [giftTarget, setGiftTarget] = useState<Favorite | null>(null);
  const [cardTarget, setCardTarget] = useState<Favorite | null>(null);

  const onCopy = async (fav: Favorite) => {
    const text = (fav.payload as BlessingPayload).text;
    await Clipboard.setStringAsync(text);
    setCopiedId(fav.id);
    setTimeout(() => setCopiedId((cur) => (cur === fav.id ? null : cur)), 1600);
  };

  const goShopping = async (platformCode: (typeof GIFT_PLATFORMS)[number]['code']) => {
    if (!giftTarget) {
      return;
    }
    const term = (giftTarget.payload as GiftPayload).search_term;
    setGiftTarget(null);
    await openGiftSearch(platformCode, term);
  };

  const renderRow = (fav: Favorite): ReactNode => {
    const meta = (
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
          marginBottom: 8,
          paddingHorizontal: 2,
        }}
      >
        <FavoriteTypeTag kind={fav.kind} />
        <Text style={{ fontFamily: fonts.sans, fontSize: fontSize.small, color: colors.inkSoft, flex: 1 }}>
          {favoriteMetaLine(fav)}
        </Text>
        <Stamp variant="mark" />
      </View>
    );

    if (fav.kind === 'blessing') {
      const text = (fav.payload as BlessingPayload).text;
      return (
        <View key={fav.id}>
          {meta}
          <ContentCard>
            <Text style={{ fontFamily: fonts.serif, fontSize: fontSize.base, lineHeight: 28, color: colors.ink }}>
              {text}
            </Text>
            <CardActions
              onRemove={() => void removeById(fav.id)}
              action={
                <Pressable
                  accessibilityRole="button"
                  onPress={() => void onCopy(fav)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  style={({ pressed }) => ({
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 5,
                    opacity: pressed ? 0.6 : 1,
                  })}
                >
                  <CopyIcon color={copiedId === fav.id ? colors.pineDeep : colors.inkSoft} />
                  <Text
                    style={{
                      fontFamily: fonts.sans,
                      fontSize: fontSize.footnote,
                      color: copiedId === fav.id ? colors.pineDeep : colors.inkSoft,
                    }}
                  >
                    {copiedId === fav.id ? '已复制' : '复制'}
                  </Text>
                </Pressable>
              }
            />
          </ContentCard>
        </View>
      );
    }

    if (fav.kind === 'gift') {
      const gift = fav.payload as GiftPayload;
      return (
        <View key={fav.id}>
          {meta}
          <ContentCard>
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
                <Text
                  style={{ fontFamily: fonts.serif, fontSize: fontSize.rowTitle, color: colors.ink }}
                  numberOfLines={1}
                >
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
            <CardActions
              onRemove={() => void removeById(fav.id)}
              action={<ActionPill label="去看看" onPress={() => setGiftTarget(fav)} />}
            />
          </ContentCard>
        </View>
      );
    }

    // 贺卡：竖版模板缩略 + 模板名/文案预览，弹层重渲后导出（图片不入库）
    const card = fav.payload as CardPayload;
    const template = getCardTemplate(card.template_code);
    const preview = card.text.trim() || '未写祝福，仍可导出图片';
    return (
      <View key={fav.id}>
        {meta}
        <ContentCard>
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
              <Text
                style={{ fontFamily: fonts.serif, fontSize: fontSize.base, color: colors.ink }}
                numberOfLines={1}
              >
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
          <CardActions
            onRemove={() => void removeById(fav.id)}
            action={<ActionPill label="导出图片" onPress={() => setCardTarget(fav)} />}
          />
        </ContentCard>
      </View>
    );
  };

  if (favorites === null) {
    return (
      <View style={{ paddingVertical: spacing.xxl, alignItems: 'center' }}>
        <ActivityIndicator color={colors.pine} />
      </View>
    );
  }

  return (
    <View>
      {/* 类型筛选 chips（原型 .chips） */}
      <View style={{ flexDirection: 'row', gap: 8, marginBottom: spacing.lg }}>
        {FILTERS.map((item) => (
          <Chip
            key={item.key}
            title={item.label}
            selected={filter === item.key}
            onPress={() => setFilter(item.key)}
          />
        ))}
      </View>

      {favorites.length === 0 ? (
        <EmptyState
          title="还没有收藏内容"
          description="在心意详情里点书签，把好用的祝福、礼物建议和贺卡收在这里，离线也能再用。"
        />
      ) : (() => {
        const rows = favorites.filter((fav) => filter === 'all' || fav.kind === filter);
        if (rows.length === 0) {
          const label = FILTERS.find((item) => item.key === filter)?.label ?? '';
          return <EmptyState title={`还没有${label}类收藏`} />;
        }
        return <View style={{ gap: spacing.lg }}>{rows.map(renderRow)}</View>;
      })()}

      {/* 礼物「去看看」平台选择（复用 M7 平台表） */}
      <Sheet visible={giftTarget !== null} title="去哪个平台搜？" onClose={() => setGiftTarget(null)}>
        <View style={{ gap: spacing.sm }}>
          {GIFT_PLATFORMS.map((platform) => (
            <Pressable
              key={platform.code}
              accessibilityRole="button"
              onPress={() => void goShopping(platform.code)}
              style={({ pressed }) => ({
                borderWidth: 1,
                borderColor: colors.sage,
                borderRadius: radius.md,
                backgroundColor: colors.paperDim,
                paddingVertical: spacing.md,
                paddingHorizontal: spacing.lg,
                opacity: pressed ? 0.7 : 1,
              })}
            >
              <Text style={{ fontFamily: fonts.sansMedium, fontSize: fontSize.base, color: colors.pineDeep }}>
                {platform.label}
              </Text>
            </Pressable>
          ))}
        </View>
      </Sheet>

      {/* 贺卡导出预览弹层 */}
      <FavoriteCardSheet favorite={cardTarget} onClose={() => setCardTarget(null)} />
    </View>
  );
}
