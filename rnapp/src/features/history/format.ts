/**
 * 已送出记录的展示时间格式化（M11）。
 * marked_at 为本地时间 ISO 字符串，统一转「M月D日 H:mm」。
 */

/** ISO 时间转「M月D日 H:mm」；非法日期返回空串 */
export function formatMarkedAt(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    return '';
  }
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getMonth() + 1}月${d.getDate()}日 ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
