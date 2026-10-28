import { useEffect } from 'react';
import { View } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { useFonts } from 'expo-font';
import {
  NotoSansSC_400Regular,
  NotoSansSC_500Medium,
} from '@expo-google-fonts/noto-sans-sc';
import {
  NotoSerifSC_400Regular,
  NotoSerifSC_600SemiBold,
} from '@expo-google-fonts/noto-serif-sc';
import { MaShanZheng_400Regular } from '@expo-google-fonts/ma-shan-zheng';
import {
  CormorantGaramond_500Medium_Italic,
  CormorantGaramond_600SemiBold,
} from '@expo-google-fonts/cormorant-garamond';
import { colors } from '../src/theme/tokens';

// 字体加载完成前保持启动屏，避免出现未套字体的闪烁
SplashScreen.preventAutoHideAsync();

/**
 * 根布局：加载 D10 视觉规范规定的三套字体（宋体标题 / 黑体正文 / 手写体贺卡），
 * 路由为文件式结构，具体路由清单见 plan.md 第 3.1 节。
 */
export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    NotoSerifSC_400Regular,
    NotoSerifSC_600SemiBold,
    NotoSansSC_400Regular,
    NotoSansSC_500Medium,
    MaShanZheng_400Regular,
    CormorantGaramond_600SemiBold,
    CormorantGaramond_500Medium_Italic,
  });

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  // 字体加载失败也进入 App（退回系统字体），只在加载未完成且无错误时等待
  if (!fontsLoaded && !fontError) {
    return <View style={{ flex: 1, backgroundColor: colors.mist }} />;
  }

  return (
    <View style={{ flex: 1 }}>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.mist } }} />
    </View>
  );
}
