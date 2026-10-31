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
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { AndroidImportance, SchedulableTriggerInputTypes } from 'expo-notifications';
import type { DateTriggerInput, NotificationRequest, Subscription } from 'expo-notifications';
import { Linking, Platform } from 'react-native';

/** 全部提醒通知使用的 Android 渠道 ID（scheduler 调度时需带上同一 channelId） */
export const ANDROID_CHANNEL_ID = 'reminders';

/**
 * 自定义渠道是否可用。Expo Go 自 SDK 53 起不支持 setNotificationChannelAsync
 * （调用直接抛错），但其本地通知仍可经系统默认渠道投递；dev/正式 build 渠道正常。
 */
let channelAvailable = true;

/**
 * 精确闹钟授权三态（T72，D22 方案 A；qa 回炉：异常须与「明确未授权」区分）：
 * - granted：已授权，dateTrigger 附加 delivery:'alarmClock' 要求准点；
 * - denied：明确未授权，保持系统默认 bestEffort（省电策略下可能延迟），设置页展示引导行；
 * - unknown：查询异常 / Expo Go 能力缺失，无法判断——调度侧保守按 bestEffort，
 *   设置页不展示引导行，避免在无法授权的环境里添堵。
 */
export type ExactAlarmStatus = 'granted' | 'denied' | 'unknown';

/**
 * 精确闹钟是否已授权（调度用布尔缓存，保守语义：异常时为 false=bestEffort）。
 * 由 refreshExactAlarmStatusAsync() 在通知初始化、设置页挂载、App 回前台时查询刷新。
 */
let exactAlarmGranted = false;

/** 精确闹钟授权三态缓存（设置页引导行用，异常为 unknown 而非 denied） */
let exactAlarmStatus: ExactAlarmStatus = 'unknown';

/**
 * 创建/更新提醒渠道。setNotificationChannelAsync 幂等：渠道已存在时按配置更新，
 * 重复调用不会报错；非 Android 平台为无操作。渠道 API 不可用（Expo Go）时只标记
 * 降级并告警，绝不抛错——提醒初始化的权限申请、监听注册与调度都不得被它阻断。
 *
 * 同时完成精确闹钟状态初始化：状态查询封装在 refreshExactAlarmStatusAsync 内
 * （自带 try/catch），与渠道各自独立互不阻断，渠道失败不影响闹钟状态查询。
 */
export async function ensureNotificationChannel(): Promise<void> {
  try {
    await Notifications.setNotificationChannelAsync(ANDROID_CHANNEL_ID, {
      name: '提醒',
      // HIGH 可在屏幕顶部弹出 heads-up 通知
      importance: AndroidImportance.HIGH,
    });
  } catch (error) {
    channelAvailable = false;
    console.warn(
      '[reminders] 自定义通知渠道不可用（Expo Go 环境属预期），本地通知改走系统默认渠道',
      error,
    );
  }
  await refreshExactAlarmStatusAsync();
}

/**
 * 查询精确闹钟授权状态并刷新模块缓存（T72）。
 * iOS/web 恒为 granted；Expo Go 能力缺失或查询异常时落 unknown 并告警，绝不抛错
 * （调度侧 exactAlarmGranted 保守置 false=bestEffort；UI 侧不显示引导行）。
 * 返回刷新后的三态，供设置页决定是否展示引导行、回前台监听判断是否需要重排。
 */
export async function refreshExactAlarmStatusAsync(): Promise<ExactAlarmStatus> {
  try {
    const result = await Notifications.getExactAlarmPermissionsAsync();
    exactAlarmGranted = result.granted;
    exactAlarmStatus = result.granted ? 'granted' : 'denied';
  } catch (error) {
    // 无法判断授权状态：调度保守按未授权（bestEffort），UI 不展示引导
    exactAlarmGranted = false;
    exactAlarmStatus = 'unknown';
    console.warn(
      '[reminders] 精确闹钟状态查询失败（Expo Go 环境属预期），本地通知按 bestEffort 投递',
      error,
    );
  }
  return exactAlarmStatus;
}

/** 同步读取缓存的精确闹钟授权布尔状态（调度用），不触发任何系统查询/弹窗 */
export function isExactAlarmGranted(): boolean {
  return exactAlarmGranted;
}

/** 同步读取缓存的精确闹钟三态（设置页引导行用），不触发任何系统查询/弹窗 */
export function getExactAlarmStatus(): ExactAlarmStatus {
  return exactAlarmStatus;
}

/**
 * 打开系统「闹钟和提醒」授权页（T72 设置页「去开启」入口）。
 * 用户返回 App 后重新查询真实状态并刷新缓存；仅明确授权返回 true，
 * denied/unknown 均返回 false。未声明 SCHEDULE_EXACT_ALARM（T71 权限声明落地前）
 * 或 Expo Go 能力缺失时调用会 reject，此处兜底返回 false 并告警，绝不抛错。
 * 用户在设置页撤销授权时 Android 会重启 App，Promise 不 resolve，无需处理。
 */
export async function requestExactAlarmPermissionAsync(): Promise<boolean> {
  try {
    await Notifications.requestExactAlarmPermissionsAsync();
  } catch (error) {
    console.warn(
      '[reminders] 无法打开精确闹钟授权页（Expo Go 或未声明 SCHEDULE_EXACT_ALARM 属预期）',
      error,
    );
    return false;
  }
  return (await refreshExactAlarmStatusAsync()) === 'granted';
}

/**
 * 打开系统「提醒」渠道设置页（2026-10-31 M5.6 真机验收后开发者拍板新增）。
 * 背景：MIUI/HyperOS 等国产 ROM 新装应用即使通知总开关开启，渠道级的
 * 悬浮通知/锁屏通知/铃声默认仍关闭，通知只静默进入通知中心，用户需要手动到
 * 渠道设置开启；设置页提醒分区用本入口直达（克制、不弹窗、不强制）。
 * 逐级降级：渠道页 → 应用通知总览页 → 应用详情页；任何一级失败都不抛错。
 * iOS 与 Expo Go 由调用方隐藏入口，此函数内部也做平台兜底。
 */
export async function openReminderChannelSettingsAsync(): Promise<void> {
  if (Platform.OS !== 'android') {
    return;
  }
  const packageName = Constants.applicationId ?? Constants.expoConfig?.android?.package;
  if (!packageName) {
    await Linking.openSettings().catch(() => {});
    return;
  }
  const appExtra = { key: 'android.provider.extra.APP_PACKAGE', value: packageName };
  const channelExtra = { key: 'android.provider.extra.CHANNEL_ID', value: ANDROID_CHANNEL_ID };
  try {
    await Linking.sendIntent('android.settings.CHANNEL_NOTIFICATION_SETTINGS', [
      appExtra,
      channelExtra,
    ]);
    return;
  } catch (error) {
    console.warn('[reminders] 直达渠道设置失败，降级到应用通知总览页', error);
  }
  try {
    await Linking.sendIntent('android.settings.APP_NOTIFICATION_SETTINGS', [appExtra]);
    return;
  } catch (error) {
    console.warn('[reminders] 打开应用通知页失败，降级到应用详情页', error);
  }
  await Linking.openSettings().catch(() => {});
}

/**
 * 组装 Android 一次性时刻触发器：自定义渠道可用时带上 channelId，否则走默认渠道；
 * 精确闹钟已授权时要求 alarmClock 准点投递（无权限系统自动回退 bestEffort）。
 */
function dateTrigger(date: Date): DateTriggerInput {
  return {
    type: SchedulableTriggerInputTypes.DATE,
    date,
    ...(channelAvailable ? { channelId: ANDROID_CHANNEL_ID } : {}),
    ...(exactAlarmGranted ? { delivery: 'alarmClock' as const } : {}),
  };
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
    trigger: dateTrigger(date),
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
    trigger: dateTrigger(new Date(Date.now() + 1000)),
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
 * 模块初始化：注册前台处理器并确保 Android 渠道存在（T72 起同时初始化
 * 精确闹钟授权状态缓存）。
 * 不申请权限——权限只在首次真正需要调度时由 ensureNotificationPermission 申请。
 */
export async function initializeNotifications(): Promise<void> {
  setForegroundNotificationHandler(true);
  await ensureNotificationChannel();
}
