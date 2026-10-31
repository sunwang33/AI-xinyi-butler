/**
 * 应用图标角标薄封装（T27 使用，第一波先提供基础封装）。
 *
 * 权限或平台/启动器不可用时静默降级为 no-op，不向调用方抛错：
 * - iOS 需要通知权限含 allowBadge，未授权时 setBadgeCountAsync 只会返回 false；
 * - 并非所有 Android 启动器都支持角标，不支持时读取恒为 0、设置返回 false。
 *
 * ⚠️ Android 平台陷阱（T75 真机验收 2026-10-31 实证）：
 * expo-notifications 的 Android 实现里，setBadgeCountAsync(0) 不是「清角标」，
 * 而是直接调 NotificationManager.cancelAll()——会清空本应用通知栏里的**全部**
 * 已展示通知（连坐尚未点击的其他提醒）。而我们每次 App 回前台都会
 * refreshTodayBadge()，当天无日子时传入 0，导致用户一点别的通知进 App，
 * 通知栏里没点的提醒就被系统清空。
 * 规避：Android 上 count 为 0 时不调用该 API（MIUI 等国产 ROM 的桌面角标
 * 由通知驱动，通知移除/点击后角标自动消失，无需显式写 0）；仅 count > 0
 * 时经 ShortcutBadger 设置。iOS 行为不变。
 */
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';

/** 设置图标角标数（自动取非负整数）；成功返回 true，不支持/失败返回 false */
export async function setAppBadgeCount(count: number): Promise<boolean> {
  try {
    const safeCount = Math.max(0, Math.floor(count));
    // 见文件头说明：Android 写 0 会被库实现成 cancelAll()，跳过该调用以保全通知栏
    if (Platform.OS === 'android' && safeCount === 0) {
      return false;
    }
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

/** 清除角标（置 0）；Android 为 no-op，原因见文件头陷阱说明 */
export async function clearAppBadge(): Promise<boolean> {
  return setAppBadgeCount(0);
}
