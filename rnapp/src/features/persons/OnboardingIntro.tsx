/**
 * 首次添加引导（T14，已拍板：引导不可跳过）：
 * 主标题「把惦记的人，先记下来」，简短说明，唯一按钮「添加第一位人员」
 * 直达 /persons/new；不提供跳过/稍后出口。
 */
import { Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Button, Screen } from '../../components';
import { colors, fonts, fontSize, spacing } from '../../theme/tokens';

export function OnboardingIntro() {
  const router = useRouter();
  return (
    <Screen>
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', paddingBottom: 60 }}>
        {/* 邮戳风格圆形装饰 */}
        <View
          style={{
            width: 96,
            height: 96,
            borderRadius: 48,
            borderWidth: 1.5,
            borderColor: colors.honey,
            backgroundColor: colors.honeyWash,
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: spacing.xxl,
          }}
        >
          <Text style={{ fontFamily: fonts.serif, fontSize: fontSize.display, color: colors.honeyDeep }}>心</Text>
        </View>
        <Text
          style={{
            fontFamily: fonts.serif,
            fontSize: fontSize.title1,
            lineHeight: 38,
            color: colors.ink,
            textAlign: 'center',
          }}
        >
          {'把惦记的人，\n先记下来'}
        </Text>
        <Text
          style={{
            marginTop: spacing.lg,
            fontFamily: fonts.sans,
            fontSize: fontSize.body,
            lineHeight: 23,
            color: colors.inkSoft,
            textAlign: 'center',
          }}
        >
          {'提前三天告诉你日子近了，\n祝福、礼物和贺卡也一并备好。\n日子到了，心意也到。'}
        </Text>
        <Button
          title="添加第一位人员"
          block
          style={{ marginTop: spacing.xxl, alignSelf: 'stretch' }}
          onPress={() => router.push('/persons/new')}
        />
      </View>
    </Screen>
  );
}
