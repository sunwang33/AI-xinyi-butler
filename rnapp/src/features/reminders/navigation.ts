/**
 * 提醒通知的 payload 结构与点击路由响应（T24，spec 第 6 条 / plan 3.2 第 3 条）。
 *
 * 本文件是通知 data 与点击路由的唯一定义处：
 * - scheduler（T23）调度时用 buildReminderData() 展平写入通知 content.data；
 * - 点击通知（热启动）或冷启动由通知拉起时，经 parseReminderData() 防御性校验后，
 *   用 routeForPayload() 决定落地页：单日子直达心意详情 / 节日选人页，多日子进当日清单页。
 *
 * App scheme 为 xinyi（app.json），本文件只处理应用内通知点击，不注册外部链接。
 */
import * as Notifications from 'expo-notifications';
import type { Subscription } from 'expo-notifications';
import { router } from 'expo-router';
import {
  FESTIVAL_CODES,
  OCCASION_TYPES,
  type OccasionKey,
} from '../../data/entities';
import {
  buildDayListHref,
  buildFestivalSelectHref,
  buildOccasionHref,
} from '../occasions/routes';

/**
 * 合并提醒中的单个日子。在 OccasionKey 定位键之外，直接带上渲染当日清单所需的
 * 快照字段——因为送达日是「日子前 N 天」，且组合内各人提前天数 N 可不同、
 * 日子实际日期可不同，清单页不能用送达日反算，必须以本结构为准（F2）。
 */
export interface ReminderItem extends OccasionKey {
  /** 日子在该年的实际发生日期（设备本地 YYYY-MM-DD），非送达日 */
  occasionDate: string;
  /** 日子名称：生日 / 纪念日名 / 节日中文名 */
  title: string;
  /** 对象称呼（salutation ?? name）；通用节日为 null */
  subjectName: string | null;
}

/**
 * 一条合并提醒的载荷：
 * @param date 送达日（日子前第 N 天）本地日期，YYYY-MM-DD
 * @param items 同一送达时点合并的全部日子（含实际日子日期与展示文案）
 */
export interface ReminderPayload {
  date: string;
  items: ReminderItem[];
}

/** scheduler 写入通知 content.data 用：直接展平 {date, items}，items 可 JSON 序列化 */
export function buildReminderData(payload: ReminderPayload): Record<string, unknown> {
  return { date: payload.date, items: payload.items };
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** 校验单个提醒日子项（通知经系统序列化后需重新认账） */
function isValidReminderItem(raw: unknown): raw is ReminderItem {
  if (!raw || typeof raw !== 'object') {
    return false;
  }
  const item = raw as Record<string, unknown>;
  if (
    typeof item.occasionType !== 'string' ||
    !(OCCASION_TYPES as readonly string[]).includes(item.occasionType)
  ) {
    return false;
  }
  if (typeof item.year !== 'number' || !Number.isInteger(item.year)) {
    return false;
  }
  // personId / anniversaryId / festivalCode 可空，但出现时必须为字符串
  for (const key of ['personId', 'anniversaryId', 'festivalCode'] as const) {
    const value = item[key];
    if (value != null && typeof value !== 'string') {
      return false;
    }
  }
  // festivalCode 若出现还须是六个内置代号之一
  if (
    typeof item.festivalCode === 'string' &&
    !(FESTIVAL_CODES as readonly string[]).includes(item.festivalCode)
  ) {
    return false;
  }
  // 实际日子日期须为 YYYY-MM-DD；title 须为非空字符串；subjectName 为字符串或 null
  if (
    typeof item.occasionDate !== 'string' ||
    !DATE_RE.test(item.occasionDate) ||
    typeof item.title !== 'string' ||
    item.title.trim().length === 0 ||
    (item.subjectName !== null && typeof item.subjectName !== 'string')
  ) {
    return false;
  }
  return true;
}

/**
 * 防御性解析通知 data：date 须为 YYYY-MM-DD 字符串、items 须为合法日子键数组；
 * 结构缺失 / 字段非法（含旧版通知）一律返回 null，调用方不跳转。
 */
export function parseReminderData(data: unknown): ReminderPayload | null {
  if (!data || typeof data !== 'object') {
    return null;
  }
  const record = data as Record<string, unknown>;
  if (typeof record.date !== 'string' || !DATE_RE.test(record.date)) {
    return null;
  }
  if (!Array.isArray(record.items) || !record.items.every(isValidReminderItem)) {
    return null;
  }
  return { date: record.date, items: record.items };
}

/**
 * 按合并规则决定通知点击的落地页（plan 3.2 第 3 条）：
 * - 仅一个日子：节日 → 节日选人页；生日 / 纪念日 → 心意详情；
 * - 多个日子：当日清单页；
 * - 0 条或单条节日缺代号等非法情况：当日清单页兜底。
 */
export function routeForPayload(payload: ReminderPayload): string {
  const { date, items } = payload;
  if (items.length === 1) {
    const item = items[0];
    if (item.occasionType === 'festival') {
      // 节日推送直达节日选人页（可在页内选人或直接看通用版）
      return item.festivalCode
        ? buildFestivalSelectHref(item.festivalCode, item.year)
        : buildDayListHref(date);
    }
    return buildOccasionHref(item);
  }
  // 0 条或多条：当日清单页（多条的完整 payload 跳转见 navigateForPayload）
  return buildDayListHref(date);
}

/**
 * 按 payload 执行跳转：
 * - 0 / 1 条走 routeForPayload（单条直达详情 / 节日选人页，0 条清单兜底）；
 * - 多条进当日清单页，并把完整 payload（含各日子的实际日期与文案）序列化带上——
 *   清单页以 payload 为准渲染，不能用送达日反算（各人提前天数与实际日子日期可不同，F2）。
 */
function navigateForPayload(payload: ReminderPayload): void {
  if (payload.items.length > 1) {
    router.push({
      pathname: '/day-list',
      params: {
        date: payload.date,
        payload: JSON.stringify(buildReminderData(payload)),
      },
    });
    return;
  }
  router.push(routeForPayload(payload));
}

/** 模块级单例：重复初始化不重复注册监听；冷启动响应全局只处理一次 */
let responseSubscription: Subscription | null = null;
let coldStartHandled = false;

/** 读取冷启动通知（若有）并跳转；全局只处理一次 */
async function handleColdStartResponse(): Promise<void> {
  if (coldStartHandled) {
    return;
  }
  coldStartHandled = true;
  const response = await Notifications.getLastNotificationResponseAsync();
  if (!response) {
    return;
  }
  const payload = parseReminderData(response.notification.request.content.data);
  // payload 为 null（非本应用提醒或旧数据）时不跳转
  if (payload) {
    navigateForPayload(payload);
  }
}

/**
 * 注册通知点击路由：热启动点击经监听实时跳转；冷启动由通知拉起时
 * 用 getLastNotificationResponseAsync 补发一次跳转。由 initializeReminders() 调用。
 * @returns 监听订阅（需要时可 remove()）
 */
export function initializeNotificationNavigation(): Subscription {
  if (!responseSubscription) {
    responseSubscription = Notifications.addNotificationResponseReceivedListener((response) => {
      const payload = parseReminderData(response.notification.request.content.data);
      if (payload) {
        navigateForPayload(payload);
      }
    });
    void handleColdStartResponse();
  }
  return responseSubscription;
}
