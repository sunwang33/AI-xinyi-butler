import { useEffect, useState } from 'react';
import { Animated, Pressable } from 'react-native';
import { colors } from '../theme/tokens';

/**
 * 开关，对应原型 .toggle：
 * 关＝苔绿底，开＝松绿底，圆点带滑动动画。
 */
export function Toggle({ value, onValueChange, disabled = false }: { value: boolean; onValueChange?: (v: boolean) => void; disabled?: boolean }) {
  // Animated.Value 是跨渲染保持的可变对象，用 useState 惰性初始化只创建一次
  const [translateX] = useState(() => new Animated.Value(value ? 1 : 0));

  useEffect(() => {
    Animated.timing(translateX, {
      toValue: value ? 1 : 0,
      duration: 160,
      useNativeDriver: true,
    }).start();
  }, [value, translateX]);

  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityState={{ checked: value, disabled }}
      disabled={disabled}
      onPress={() => onValueChange?.(!value)}
      style={{
        width: 42,
        height: 24,
        borderRadius: 999,
        backgroundColor: value ? colors.pine : colors.sage,
        opacity: disabled ? 0.5 : 1,
        justifyContent: 'center',
      }}
    >
      <Animated.View
        style={{
          position: 'absolute',
          left: 3,
          width: 19,
          height: 19,
          borderRadius: 999,
          backgroundColor: colors.white,
          shadowColor: '#000',
          shadowOpacity: 0.2,
          shadowOffset: { width: 0, height: 1 },
          shadowRadius: 3,
          elevation: 2,
          transform: [{ translateX: translateX.interpolate({ inputRange: [0, 1], outputRange: [0, 17] }) }],
        }}
      />
    </Pressable>
  );
}
