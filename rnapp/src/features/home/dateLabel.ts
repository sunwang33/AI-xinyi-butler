/**
 * 提醒页中文日期文案（T65）：YYYY-MM-DD（设备本地口径）转展示文本。
 * 与日子引擎一致按 UTC 零点解析，避免设备时区造成日期漂移；不引入日期库。
 */

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'] as const;

/** 解析本地 YYYY-MM-DD 为 UTC 零点对应的 Date */
function parseLocalDate(value: string): Date {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

/** 「10 月 31 日」 */
export function formatMonthDay(value: string): string {
  const date = parseLocalDate(value);
  return `${date.getUTCMonth() + 1} 月 ${date.getUTCDate()} 日`;
}

/** 「星期六」 */
export function formatWeekday(value: string): string {
  return `星期${WEEKDAYS[parseLocalDate(value).getUTCDay()]}`;
}

/** 主卡日期行：「10 月 31 日 · 星期六」 */
export function formatFullDate(value: string): string {
  return `${formatMonthDay(value)} · ${formatWeekday(value)}`;
}

/** 设备本地今天，格式 YYYY-MM-DD */
function todayLocal(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** 页头副标题：「10 月 30 日 · 星期五」 */
export function formatTodayHeader(): string {
  return formatFullDate(todayLocal());
}
