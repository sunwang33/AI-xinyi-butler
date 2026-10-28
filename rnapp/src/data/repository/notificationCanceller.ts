/**
 * 待送达通知取消钩子：M2 只预留调用位，M5 的提醒调度模块通过
 * registerNotificationCanceller 注册实际实现（调用 expo-notifications 取消系统通知）。
 * 独立成文件以避免 data 层与 reminders 特性模块循环依赖。
 */

export type NotificationCanceller = (osNotificationIds: string[]) => Promise<void> | void;

let canceller: NotificationCanceller = () => {};

/** M5 调度器启动时注册；重复注册以最后一次为准 */
export function registerNotificationCanceller(fn: NotificationCanceller): void {
  canceller = fn;
}

export function getNotificationCanceller(): NotificationCanceller {
  return canceller;
}
