import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { useFonts } from 'expo-font';
import { getDatabase } from '../src/data/db';
import { useAccountStore } from '../src/features/account/authStore';
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
 * 根布局：启动时并行完成两件事——
 * 1. 加载 D10 视觉规范规定的三套字体（宋体标题 / 黑体正文 / 手写体贺卡）；
 * 2. 打开本机 SQLite 并执行版本化迁移（T05，全部数据先只存本机）。
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
  // 数据库迁移完成前与字体一起阻塞首屏，保证页面读到的库结构一定就绪
  const [dbReady, setDbReady] = useState(false);

  // 登录态恢复走 AsyncStorage，不阻塞首屏（登录为可选，首页不依赖登录态）
  useEffect(() => {
    useAccountStore.getState().initialize();
  }, []);

  useEffect(() => {
    let mounted = true;
    getDatabase()
      .then(() => {
        if (mounted) {
          setDbReady(true);
        }
      })
      .catch((error: unknown) => {
        // 本机库打开失败属于不可恢复异常：记录后放行，由具体读写处暴露错误
        console.error('[db] 初始化失败', error);
        if (mounted) {
          setDbReady(true);
        }
      });
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if ((fontsLoaded || fontError) && dbReady) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError, dbReady]);

  // 字体加载失败也进入 App（退回系统字体），只在加载未完成且无错误时等待
  if ((!fontsLoaded && !fontError) || !dbReady) {
    return <View style={{ flex: 1, backgroundColor: colors.mist }} />;
  }

  return (
    <View style={{ flex: 1 }}>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.mist } }} />
    </View>
  );
}
