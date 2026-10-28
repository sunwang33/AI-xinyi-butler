import { Text, TextInput, TextInputProps, View } from 'react-native';
import { colors, fonts, fontSize } from '../theme/tokens';

/**
 * 文本输入框，对应原型 .field + .input：
 * 顶部小标签（必填项后缀蜜蜡色“必填”），信纸白圆角输入框。
 */
export function TextField({
  label,
  required = false,
  small = false,
  ...inputProps
}: TextInputProps & { label?: string; required?: boolean; small?: boolean }) {
  return (
    <View style={{ marginBottom: 15 }}>
      {label ? (
        <Text style={{ marginBottom: 6, fontSize: fontSize.body, color: colors.inkSoft }}>
          {label}
          {required ? <Text style={{ color: colors.honeyDeep, fontStyle: 'normal' }}>　必填</Text> : null}
        </Text>
      ) : null}
      <TextInput
        placeholderTextColor={colors.inkFaint}
        {...inputProps}
        style={[
          {
            width: '100%',
            backgroundColor: colors.paper,
            borderWidth: 1,
            borderColor: colors.line,
            borderRadius: 11,
            fontFamily: fonts.sans,
            fontSize: small ? fontSize.body : fontSize.base,
            color: colors.ink,
            paddingHorizontal: 13,
            paddingVertical: small ? 8 : 11,
          },
          inputProps.style,
        ]}
      />
    </View>
  );
}
