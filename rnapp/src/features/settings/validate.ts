/**
 * 设置项纯校验（T18/T19）：
 * 只做「输入字符串 → 范围内整数」的解析与判断，不碰 UI、不碰仓储，便于复用与单测。
 */

/** 严格解析十进制整数串并校验范围；空串、负数、小数、非数字一律视为非法 */
function parseIntegerInRange(text: string, min: number, max: number): number | null {
  const t = text.trim();
  // 仅接受连续的 ASCII 数字：负号、小数点、空白混排都会被拒绝
  if (!/^\d+$/.test(t)) return null;
  const n = Number(t);
  if (!Number.isInteger(n) || n < min || n > max) return null;
  return n;
}

/**
 * 全局默认 / 单人覆盖提前天数：1–30 的整数。
 * 拒绝 0、31、负数、小数、空串与非数字。
 */
export function parseAdvanceDays(text: string): number | null {
  return parseIntegerInRange(text, 1, 30);
}

/** 提醒送达钟点：0–23 的整数整点（24 小时制，无分钟） */
export function parseDeliveryHour(text: string): number | null {
  return parseIntegerInRange(text, 0, 23);
}

/** 每次生成的祝福条数：1–10 的整数（上限 10，控时延与列表长度） */
export function parseBlessingCount(text: string): number | null {
  return parseIntegerInRange(text, 1, 10);
}
