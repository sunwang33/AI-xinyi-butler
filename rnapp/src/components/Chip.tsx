import { Pressable, Text } from 'react-native';
import { colors, fonts, fontSize } from '../theme/tokens';

/**
 * 枚举选择项 / 筛选项，对应原型 .chip：
 * 未选＝苔绿描边胶囊；选中＝松绿实底。
 * tonal（蜜蜡浅色选中态）预留给后续特殊场景。
 */
export function Chip({
  title,
  selected = false,
  tonal = false,
  onPress,
}: {
  title: string;
  selected?: boolean;
  tonal?: boolean;
  onPress?: () => void;
}) {
  const activeBg = tonal ? colors.honeyWash : colors.pine;
  const activeColor = tonal ? colors.honeyDeep : colors.white;
  const activeBorder = tonal ? colors.honey : colors.pine;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={{
        borderRadius: 999,
        borderWidth: 1,
        paddingHorizontal: 15,
        paddingVertical: 7,
        backgroundColor: selected ? activeBg : colors.paper,
        borderColor: selected ? activeBorder : colors.sage,
      }}
    >
      <Text style={{ fontFamily: fonts.sans, fontSize: fontSize.body, color: selected ? activeColor : colors.inkSoft }}>
        {title}
      </Text>
    </Pressable>
  );
}
