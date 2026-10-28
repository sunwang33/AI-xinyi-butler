import { Redirect } from 'expo-router';

/**
 * 启动入口（plan.md 3.2 第 1 条）：
 * M1 阶段没有数据层，统一进入首页 Tab。
 * M3（T14）在此加入判断：无任何档案 → /onboarding，有档案 → 首页。
 */
export default function Index() {
  return <Redirect href="/(tabs)" />;
}
