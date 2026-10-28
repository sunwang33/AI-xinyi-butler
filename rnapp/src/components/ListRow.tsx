import { ReactNode } from 'react';
import { Pressable, StyleProp, Text, View, ViewStyle } from 'react-native';
import { colors, fonts, fontSize } from '../theme/tokens';

type AvatarTone = 'default' | 'warm' | 'night';

const avatarBg: Record<AvatarTone, string> = {
  default: colors.sageSoft,
  warm: colors.honeyWash,
  night: '#DCE7E3',
};
const avatarColor: Record<AvatarTone, string> = {
  default: colors.pineDeep,
  warm: colors.honeyDeep,
  night: colors.night,
};

/**
 * 简单列表行，对应原型 .pickrow（人员选择 / 当日清单 / 设置入口）：
 * 左侧圆形头像字，中间宋体标题 + 灰色副标题，右侧自定义内容或 ›。
 */
export function ListRow({
  title,
  subtitle,
  avatar,
  avatarTone = 'default',
  showChevron = false,
  right,
  onPress,
  dashed = false,
  style,
}: {
  title: ReactNode;
  subtitle?: string;
  avatar?: string;
  avatarTone?: AvatarTone;
  showChevron?: boolean;
  right?: ReactNode;
  onPress?: () => void;
  dashed?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const content = (
    <View
      style={[
        {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
          backgroundColor: dashed ? '#FDF9F1' : colors.paper,
          borderWidth: 1,
          borderStyle: dashed ? 'dashed' : 'solid',
          borderColor: dashed ? colors.honey : colors.line,
          borderRadius: 13,
          paddingHorizontal: 14,
          paddingVertical: 13,
        },
        style,
      ]}
    >
      {avatar ? (
        <View
          style={{
            width: 42,
            height: 42,
            borderRadius: 21,
            backgroundColor: avatarBg[avatarTone],
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text style={{ fontFamily: fonts.serif, fontSize: 17, color: avatarColor[avatarTone] }}>{avatar}</Text>
        </View>
      ) : null}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ fontFamily: fonts.serif, fontSize: 14.5, color: colors.ink }}>{title}</Text>
        {subtitle ? (
          <Text style={{ marginTop: 2, fontSize: fontSize.footnote, color: colors.inkSoft }} numberOfLines={2}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {right}
      {showChevron ? <Text style={{ fontFamily: fonts.num, fontSize: 18, color: colors.inkFaint }}>›</Text> : null}
    </View>
  );

  if (!onPress) return content;
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}>
      {content}
    </Pressable>
  );
}
