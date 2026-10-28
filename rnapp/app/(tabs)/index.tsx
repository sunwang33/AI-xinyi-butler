import { AppHeader, EmptyState, Screen } from '../../src/components';

/**
 * 首页（Tab 1 / spec 全局规则 5）
 * M1 为骨架占位；M4（T17）起按临近程度由近到远列出生日、纪念日与六个内置节日。
 */
export default function HomeScreen() {
  return (
    <Screen scroll edges={['top']}>
      <AppHeader title="最近要惦记的人" subtitle="按临近程度由近到远" />
      <EmptyState
        title="首页"
        description="未来这里会由近到远列出最近的生日、各纪念日和六个内置节日，每条显示对象、日子名称与剩余天数；日子当天会有蜜蜡色圆点提示。（M4 实现）"
      />
    </Screen>
  );
}
