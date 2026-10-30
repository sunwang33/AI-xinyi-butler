/**
 * 通知权限申请与 Android 渠道封装（T22，spec 第 6 条）。
 *
 * 约定：
 * - 仅在真正需要调度前调用 ensureNotificationPermission()：系统授权弹窗一生只弹一次，
 *   用户拒绝后永不重弹，临近日子改由首页红点 + 图标角标兜底（T27）；
 * - 所有本地通知固定走 ANDROID_CHANNEL_ID 渠道；
 * - 本文件只做 expo-notifications 的薄封装，调度策略（未来 30 天重算、同日合并、
 *   去重补发）在 scheduler.ts（T23/T26）实现，本波不含调度逻辑。
 *
 * 待真机验收：国产 Android 厂商对后台 Alarm 的限制可能影响准点（plan 1.4 风险 5）。
 */
import * as Notifications from 'expo-notifications';
import { AndroidImportance, SchedulableTriggerInputTypes } from 'expo-notifications';
import type { NotificationRequest, Subscription } from 'expo-notifications';

/** 全部提醒通知使用的 Android 渠道 ID（scheduler 调度时需带上同一 channelId） */
export const ANDROID_CHANNEL_ID = 'reminders';

/**
 * 创建/更新提醒渠道。setNotificationChannelAsync 幂等：渠道已存在时按配置更新，
 * 重复调用不会报错；非 Android 平台为无操作。
 */
export async function ensureNotificationChannel(): Promise<void> {
  await Notifications.setNotificationChannelAsync(ANDROID_CHANNEL_ID, {
    name: '提醒',
    // HIGH 可在屏幕顶部弹出 heads-up 通知
    importance: AndroidImportance.HIGH,
  });
}

/**
 * 确保已取得系统通知权限。仅在真正需要调度前调用：
 * - 已授权：返回 true；
 * - 已拒绝（含系统不再允许询问 canAskAgain=false）：直接返回 false，永不再次 request；
 * - 从未询问（undetermined）：弹一次系统授权窗，按用户选择返回。
 */
export async function ensureNotificationPermission(): Promise<boolean> {
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) {
    return true;
  }
  // 只要系统状态不是「从未询问」（即 denied），或已不可再询问，都不再弹窗
  if (current.status !== 'undetermined' || !current.canAskAgain) {
    return false;
  }
  const result = await Notifications.requestPermissionsAsync();
  return result.granted;
}

/**
 * 只「查询」当前通知权限是否已授予（T68 拒权守卫用）。
 * 与 ensureNotificationPermission 的区别：绝不调用 requestPermissionsAsync，
 * undetermined/denied 都只如实返回 false，不会触发任何系统弹窗——冷启动之外的
 * 重算入口（改设置、保存档案、节日关注变更）只允许查状态，申请一生一次的
 * 弹窗只由冷启动路径发起（plan 1.4：拒绝后不反复申请）。
 */
export async function isNotificationPermissionGranted(): Promise<boolean> {
  const current = await Notifications.getPermissionsAsync();
  return current.granted;
}

/** scheduler 调度本地通知所需的内容字段（data 承载 T24 的点击路由参数） */
export interface LocalNotificationContent {
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

/**
 * 在指定的设备本地时刻调度一条一次性本地通知，返回系统通知标识
 * （登记到 notification_log.os_notification_id，供取消/重排使用）。
 */
export async function scheduleLocalNotification(
  content: LocalNotificationContent,
  date: Date,
): Promise<string> {
  return Notifications.scheduleNotificationAsync({
    content,
    trigger: {
      type: SchedulableTriggerInputTypes.DATE,
      date,
      channelId: ANDROID_CHANNEL_ID,
    },
  });
}

/**
 * 立即展示一条本地通知（T26 关机/离线恢复后补发一次用）。
 * SDK 58 已移除 presentNotificationAsync，按官方建议用一次性 DATE trigger 投递；
 * 取 1 秒后的时刻兜底（trigger 为 null 的立即形态无法附带 Android channelId）。
 * 准点性受国产 Android 后台策略影响，待真机验收（plan 1.4）。
 */
export async function presentLocalNotification(content: LocalNotificationContent): Promise<string> {
  return Notifications.scheduleNotificationAsync({
    content,
    trigger: {
      type: SchedulableTriggerInputTypes.DATE,
      date: new Date(Date.now() + 1000),
      channelId: ANDROID_CHANNEL_ID,
    },
  });
}

/** 取消一条已调度通知（人员删除/设置变更重算时使用，见 T27） */
export async function cancelScheduledNotification(id: string): Promise<void> {
  await Notifications.cancelScheduledNotificationAsync(id);
}

/** 取消全部已调度通知（全量重算前使用） */
export async function cancelAllScheduledNotifications(): Promise<void> {
  await Notifications.cancelAllScheduledNotificationsAsync();
}

/** 读取当前全部已调度通知（重算时用于对账） */
export async function getAllScheduledNotifications(): Promise<NotificationRequest[]> {
  return Notifications.getAllScheduledNotificationsAsync();
}

/**
 * 读取系统中仍处于排队状态的全部通知标识（T26 送达对账用）：
 * 日志有记录但 id 已不在该集合中时，启发式判定系统已投递该通知。
 */
export async function getScheduledNotificationIds(): Promise<Set<string>> {
  const requests = await Notifications.getAllScheduledNotificationsAsync();
  return new Set(requests.map((request) => request.identifier));
}

/**
 * 注册前台收到通知监听（T26 状态机）。回调只回传通知 data，
 * 是否为本应用提醒由调用方用 navigation 的 parseReminderData 防御性识别。
 */
export function addReceivedListener(
  listener: (data: Record<string, unknown>) => void,
): Subscription {
  return Notifications.addNotificationReceivedListener((notification) => {
    const data = notification.request.content.data;
    if (data && typeof data === 'object') {
      listener(data as Record<string, unknown>);
    }
  });
}

/**
 * 注册前台收到通知时的行为（SDK 58 推荐形态：分别控制横幅/通知栏/声音）。
 * @param show 前台时是否展示通知，默认 true
 */
export function setForegroundNotificationHandler(show: boolean = true): void {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: show,
      shouldShowList: show,
      shouldPlaySound: show,
      // 角标由 badge.ts 在日子当天显式管理，不由通知内容自动设置
      shouldSetBadge: false,
    }),
  });
}

/**
 * 模块初始化：注册前台处理器并确保 Android 渠道存在。
 * 不申请权限——权限只在首次真正需要调度时由 ensureNotificationPermission 申请。
 */
export async function initializeNotifications(): Promise<void> {
  setForegroundNotificationHandler(true);
  await ensureNotificationChannel();
}
