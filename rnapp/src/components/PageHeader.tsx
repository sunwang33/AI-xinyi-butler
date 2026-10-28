import { Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { colors, fonts, fontSize } from '../theme/tokens';

/**
 * 二级页面顶部标题，对应原型中「‹　惦记的人」样式：
 * 左侧返回箭头（默认 router.back()）+ 宋体标题。
 */
export function PageHeader({ title, onBack }: { title: string; onBack?: () => void }) {
  const router = useRouter();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8, paddingHorizontal: 2 }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="返回"
        hitSlop={12}
        onPress={() => (onBack ? onBack() : router.back())}
        style={{ paddingHorizontal: 4 }}
      >
        <Text style={{ fontFamily: fonts.num, fontSize: 30, lineHeight: 32, color: colors.pineDeep }}>‹</Text>
      </Pressable>
      <Text style={{ fontFamily: fonts.serif, fontSize: fontSize.title2, color: colors.ink }}>{title}</Text>
    </View>
  );
}
