import { AppHeader, EmptyState, Screen } from '../../src/components';

/**
 * 设置（Tab 3 / spec 第 5、8、13、14 条）
 * M1 为骨架占位；M4 起放置提前天数、送达钟点、祝福条数、单人覆盖与节日开关；
 * 服务说明 M6 接入，账号入口 M12 启用。
 */
export default function SettingsScreen() {
  return (
    <Screen scroll edges={['top']}>
      <AppHeader title="设置" />
      <EmptyState
        title="设置"
        description="未来这里提供：全局默认提前天数（默认三天，1–30 的整数）、提醒送达钟点（默认上午 9:00）、祝福条数（默认三条）、单人提醒覆盖与单个节日开关，以及服务说明与账号入口。（M4 / M6 / M12 实现）"
      />
    </Screen>
  );
}
