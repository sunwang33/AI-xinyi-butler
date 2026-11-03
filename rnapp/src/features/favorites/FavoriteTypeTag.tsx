/**
 * 收藏类型小标签（M10 T49），对应原型 .typetag.bless / .gift / .card：
 * 祝福＝浅青底松绿字；礼物＝蜜蜡洗底蜜蜡深字；贺卡＝苔青底松绿字。
 * 色值全部取既有 tokens，不新增配色。
 */
import { Text } from 'react-native';
import type { ContentKind } from '../../data/entities';
import { colors, fonts, fontSize, radius } from '../../theme/tokens';

const TAG_STYLE: Record<ContentKind, { label: string; bg: string; fg: string }> = {
  blessing: { label: '祝福', bg: colors.mist, fg: colors.pineDeep },
  gift: { label: '礼物', bg: colors.honeyWash, fg: colors.honeyDeep },
  card: { label: '贺卡', bg: colors.sageSoft, fg: colors.pine },
};

export function FavoriteTypeTag({ kind }: { kind: ContentKind }) {
  const spec = TAG_STYLE[kind];
  return (
    <Text
      style={{
        fontSize: fontSize.caption,
        fontFamily: fonts.sansMedium,
        color: spec.fg,
        backgroundColor: spec.bg,
        borderRadius: radius.sm,
        paddingHorizontal: 8,
        paddingVertical: 2,
        overflow: 'hidden',
      }}
    >
      {spec.label}
    </Text>
  );
}
