/**
 * 角标封装平台分流单元测试（T75 真机验收回归，2026-10-31）。
 *
 * 背景：expo-notifications Android 端 setBadgeCountAsync(0) 的原生实现是
 * NotificationManager.cancelAll()，会连坐清空通知栏里的全部已展示通知；
 * scheduler 每次回前台都可能以 0 调角标，故 badge 封装必须在 Android 上
 * 短路写 0，iOS 行为保持不变。
 *
 * 工程未引入生效的 jest 全局类型（同 scheduler.test.ts 的处理），仅声明最小类型。
 */
/* eslint-disable @typescript-eslint/no-require-imports */
declare const describe: (name: string, fn: () => void) => void;
declare const it: any;
declare const beforeEach: (fn: () => void) => void;
declare const expect: any;
declare const jest: any;

// jest.mock 工厂只允许引用 mock 前缀的外部变量
const mockSetBadgeCountAsync = jest.fn();
const mockGetBadgeCountAsync = jest.fn();

jest.mock('expo-notifications', () => ({
  setBadgeCountAsync: (...args: unknown[]) => mockSetBadgeCountAsync(...args),
  getBadgeCountAsync: (...args: unknown[]) => mockGetBadgeCountAsync(...args),
}));

// badge.ts 只用 Platform.OS，提供最小 mock
jest.mock('react-native', () => ({ Platform: { OS: 'android' } }));

type BadgeModule = typeof import('./badge');

const badge: BadgeModule = require('./badge');
const { Platform } = require('react-native') as { Platform: { OS: string } };

describe('setAppBadgeCount 平台分流', () => {
  beforeEach(() => {
    Platform.OS = 'android';
    mockSetBadgeCountAsync.mockReset();
    mockGetBadgeCountAsync.mockReset();
  });

  it('Android 写 0 时不调用 setBadgeCountAsync（避免原生 cancelAll 清空通知栏）', async () => {
    mockSetBadgeCountAsync.mockResolvedValue(true);
    const result = await badge.setAppBadgeCount(0);
    expect(mockSetBadgeCountAsync).not.toHaveBeenCalled();
    expect(result).toBe(false);
  });

  it('Android 负数/小数归一化为 0 后同样短路', async () => {
    await badge.setAppBadgeCount(-2);
    await badge.setAppBadgeCount(-0.9);
    expect(mockSetBadgeCountAsync).not.toHaveBeenCalled();
  });

  it('Android 写正数时正常下发（取整）', async () => {
    mockSetBadgeCountAsync.mockResolvedValue(true);
    const result = await badge.setAppBadgeCount(2.9);
    expect(mockSetBadgeCountAsync).toHaveBeenCalledWith(2);
    expect(result).toBe(true);
  });

  it('Android clearAppBadge 为 no-op', async () => {
    await badge.clearAppBadge();
    expect(mockSetBadgeCountAsync).not.toHaveBeenCalled();
  });

  it('iOS 写 0 时正常调用（系统角标清零，不涉及通知栏）', async () => {
    Platform.OS = 'ios';
    mockSetBadgeCountAsync.mockResolvedValue(true);
    const result = await badge.setAppBadgeCount(0);
    expect(mockSetBadgeCountAsync).toHaveBeenCalledWith(0);
    expect(result).toBe(true);
  });

  it('iOS 写正数时行为不变', async () => {
    Platform.OS = 'ios';
    mockSetBadgeCountAsync.mockResolvedValue(true);
    await badge.setAppBadgeCount(3);
    expect(mockSetBadgeCountAsync).toHaveBeenCalledWith(3);
  });

  it('底层抛错时静默返回 false，不向调用方抛异常', async () => {
    mockSetBadgeCountAsync.mockRejectedValue(new Error('boom'));
    const result = await badge.setAppBadgeCount(1);
    expect(result).toBe(false);
  });
});

describe('getAppBadgeCount', () => {
  beforeEach(() => {
    mockGetBadgeCountAsync.mockReset();
  });

  it('正常透传底层数值', async () => {
    mockGetBadgeCountAsync.mockResolvedValue(4);
    expect(await badge.getAppBadgeCount()).toBe(4);
  });

  it('底层抛错时静默返回 0', async () => {
    mockGetBadgeCountAsync.mockRejectedValue(new Error('boom'));
    expect(await badge.getAppBadgeCount()).toBe(0);
  });
});
