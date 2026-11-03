/**
 * 收藏书签按钮（M10 T48），对应原型 .iconbtn / .iconbtn.saved：
 * 未收藏＝灰描边书签 ＋「收藏」；已收藏＝蜜蜡填充书签 ＋「已收藏」。
 *
 * FavoriteToggle 为智能按钮：内部按「同日子 ＋ 内容指纹」自算高亮态，点击走
 * useFavorites 的 toggle（再点即取消），收藏夹满 100 时弹说明，不在按钮上堆业务。
 */
import { useState } from 'react';
import { Alert, Pressable, StyleProp, Text, ViewStyle } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import type { ContentKind, ContentPayload } from '../../data/entities';
import { colors, fonts, fontSize } from '../../theme/tokens';
import { FAVORITE_LIMIT, findFavorite } from './fingerprint';
import { buildFavoriteCreate, type FavoriteScope } from './restore';
import type { FavoriteStateApi } from './useFavorites';

/** 书签图标：filled 为蜜蜡实心（已收藏），否则灰描边 */
export function BookmarkIcon({ filled, color }: { filled: boolean; color: string }) {
  return (
    <Svg width={15} height={15} viewBox="0 0 24 24">
      <Path
        d="M7 4h10v17l-5-3.5L7 21z"
        fill={filled ? color : 'none'}
        stroke={color}
        strokeWidth={1.7}
        strokeLinejoin="round"
      />
    </Svg>
  );
}

/** 纯展示书签按钮（历史分区「取消收藏」等需要固定文案 / 受控点击处也可复用） */
export function BookmarkButton({
  active,
  busy = false,
  idleLabel = '收藏',
  activeLabel = '已收藏',
  onPress,
  style,
}: {
  active: boolean;
  busy?: boolean;
  idleLabel?: string;
  activeLabel?: string;
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  const color = active ? colors.honeyDeep : colors.inkSoft;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active, busy }}
      accessibilityLabel={active ? activeLabel : idleLabel}
      disabled={busy}
      onPress={onPress}
      hitSlop={{ top: 10, bottom: 10, left: 8, right: 8 }}
      style={({ pressed }) => [
        { flexDirection: 'row', alignItems: 'center', gap: 5, opacity: busy ? 0.5 : pressed ? 0.6 : 1 },
        style,
      ]}
    >
      <BookmarkIcon filled={active} color={color} />
      <Text
        style={{
          fontFamily: active ? fonts.sansMedium : fonts.sans,
          fontSize: fontSize.footnote,
          color,
        }}
      >
        {active ? activeLabel : idleLabel}
      </Text>
    </Pressable>
  );
}

/** 智能收藏开关：自算高亮态、自跑 toggle、满额提示。供祝福 / 礼物 / 贺卡三区直接使用 */
export function FavoriteToggle({
  api,
  scope,
  kind,
  payload,
  idleLabel,
  activeLabel,
  style,
}: {
  api: FavoriteStateApi;
  scope: FavoriteScope;
  kind: ContentKind;
  payload: ContentPayload;
  idleLabel?: string;
  activeLabel?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const [busy, setBusy] = useState(false);
  const active = findFavorite(api.favorites ?? [], scope.key, kind, payload) !== null;

  const onPress = async () => {
    if (busy) {
      return;
    }
    setBusy(true);
    try {
      const result = await api.toggle(buildFavoriteCreate(scope, kind, payload));
      if (result === 'full') {
        Alert.alert(
          '收藏夹已满',
          `最多收藏 ${FAVORITE_LIMIT} 条内容。先在「历史」Tab 的收藏里取消一些，再收藏新的吧。`,
        );
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <BookmarkButton
      active={active}
      busy={busy}
      idleLabel={idleLabel}
      activeLabel={activeLabel}
      onPress={() => void onPress()}
      style={style}
    />
  );
}
