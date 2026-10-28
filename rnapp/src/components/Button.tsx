import { ActivityIndicator, Pressable, Text, ViewStyle } from 'react-native';
import { ReactNode } from 'react';
import { colors, fonts, fontSize, radius } from '../theme/tokens';

type Variant = 'pine' | 'ink' | 'ghost' | 'honey';
type Size = 'md' | 'sm';

const bg: Record<Variant, string> = {
  pine: colors.pine,
  ink: colors.pineDeep,
  ghost: 'transparent',
  honey: colors.honey,
};

/**
 * 通用按钮，对应原型 .btn / .btn-pine / .btn-ink / .btn-ghost / .btn-honey。
 * 胶囊形；block 时撑满父容器。
 */
export function Button({
  title,
  onPress,
  variant = 'pine',
  size = 'md',
  block = false,
  disabled = false,
  loading = false,
  icon,
  style,
}: {
  title: string;
  onPress?: () => void;
  variant?: Variant;
  size?: Size;
  block?: boolean;
  disabled?: boolean;
  loading?: boolean;
  icon?: ReactNode;
  style?: ViewStyle;
}) {
  const isSmall = size === 'sm';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: disabled || loading }}
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 7,
          borderRadius: radius.pill,
          borderWidth: 1,
          borderColor: variant === 'ghost' ? colors.sage : 'transparent',
          backgroundColor: bg[variant],
          paddingHorizontal: isSmall ? 14 : 22,
          paddingVertical: isSmall ? 7 : 12,
          opacity: disabled || loading ? 0.5 : pressed ? 0.8 : 1,
        },
        block ? { width: '100%' } : null,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={variant === 'ghost' ? colors.pineDeep : colors.white} />
      ) : (
        icon
      )}
      <Text
        style={{
          fontFamily: fonts.sansMedium,
          fontSize: isSmall ? fontSize.small : fontSize.base,
          color: variant === 'ghost' ? colors.pineDeep : colors.white,
        }}
      >
        {title}
      </Text>
    </Pressable>
  );
}
