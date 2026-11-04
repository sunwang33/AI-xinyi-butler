/**
 * 礼物「去看看」平台选择 Sheet（M11 T52 抽出；M7 起 GiftSection / M10 FavoriteList
 * 各有一份同款内联实现，本组件供往年回顾与流水回看复用，行为与那两处完全一致：
 * 淘宝 / 京东两行，选中后打开对应移动搜索结果页并关闭弹层。
 */
import { Pressable, Text, View } from 'react-native';
import { Sheet } from '../../components';
import { colors, fonts, fontSize, radius, spacing } from '../../theme/tokens';
import { GIFT_PLATFORMS, openGiftSearch } from './link';

export function GiftPlatformSheet({
  term,
  onClose,
}: {
  /** 搜索词；null 表示关闭 */
  term: string | null;
  onClose: () => void;
}) {
  return (
    <Sheet visible={term !== null} title="去哪个平台搜？" onClose={onClose}>
      <View style={{ gap: spacing.sm }}>
        {GIFT_PLATFORMS.map((platform) => (
          <Pressable
            key={platform.code}
            accessibilityRole="button"
            onPress={() => {
              if (!term) {
                return;
              }
              const keyword = term;
              onClose();
              void openGiftSearch(platform.code, keyword);
            }}
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
  );
}
