/**
 * 应用图标角标薄封装（T27 使用，第一波先提供基础封装）。
 *
 * 权限或平台/启动器不可用时静默降级为 no-op，不向调用方抛错：
 * - iOS 需要通知权限含 allowBadge，未授权时 setBadgeCountAsync 只会返回 false；
 * - 并非所有 Android 启动器都支持角标，不支持时读取恒为 0、设置返回 false。
 *
 * 待真机验收：国产 Android 启动器角标兼容差异较大，需真机确认实际表现。
 */
import * as Notifications from 'expo-notifications';

/** 设置图标角标数（自动取非负整数）；成功返回 true，不支持/失败返回 false */
export async function setAppBadgeCount(count: number): Promise<boolean> {
  try {
    const safeCount = Math.max(0, Math.floor(count));
    return await Notifications.setBadgeCountAsync(safeCount);
  } catch {
    return false;
  }
}

/** 读取当前角标数；不支持/失败时静默返回 0 */
export async function getAppBadgeCount(): Promise<number> {
  try {
    return await Notifications.getBadgeCountAsync();
  } catch {
    return 0;
  }
}

/** 清除角标（置 0） */
export async function clearAppBadge(): Promise<boolean> {
  return setAppBadgeCount(0);
}
