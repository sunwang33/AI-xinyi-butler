/**
 * SQLite Repository 公共工具：主键/时间戳生成、布尔与 JSON 的库内表示、
 * 动态 SET 构造、「人 × 日子 × 年份」业务键的 NULL 安全匹配。
 */
import * as Crypto from 'expo-crypto';
import type { SQLiteBindValue } from 'expo-sqlite';
import type { OccasionKey } from '../../entities';

/** 当前 UTC 时间（ISO 8601） */
export function now(): string {
  return new Date().toISOString();
}

/** 应用层 UUID v4（data-model 4.1：主键统一 UUID），由 expo-crypto 提供 */
export function uuid(): string {
  return Crypto.randomUUID();
}

/** 实体布尔 → 库内 0/1 */
export function toInt(value: boolean): number {
  return value ? 1 : 0;
}

/** JSON 列：null 透传，否则序列化 */
export function toJson(value: unknown): string | null {
  return value === null || value === undefined ? null : JSON.stringify(value);
}

/** JSON 列：SQL NULL → null，否则解析 */
export function fromJson<T>(raw: string | null): T | null {
  return raw === null ? null : (JSON.parse(raw) as T);
}

/** 动态 UPDATE 片段，values 的键必须已是库内列名 */
export function buildSet(values: Record<string, SQLiteBindValue>): {
  clause: string;
  params: SQLiteBindValue[];
} {
  const keys = Object.keys(values);
  return {
    clause: keys.map((key) => `${key} = ?`).join(', '),
    params: keys.map((key) => values[key]),
  };
}

/**
 * 「人 × 日子 × 年份」业务键的 WHERE 片段与参数。
 * 用 IS 做 NULL 安全比较（`col IS NULL` 与 `col IS 'x'` 都成立）；
 * 快照/贺卡表额外带 user_id（本机阶段恒 NULL），与 7.2 节唯一索引列对齐。
 */
export function occasionMatcher(
  key: OccasionKey,
  options?: { withUser?: boolean },
): { sql: string; params: SQLiteBindValue[] } {
  const conditions = [
    'occasion_type = ?',
    'person_id IS ?',
    'anniversary_id IS ?',
    'festival_code IS ?',
    'year = ?',
  ];
  const params: SQLiteBindValue[] = [
    key.occasionType,
    key.personId ?? null,
    key.anniversaryId ?? null,
    key.festivalCode ?? null,
    key.year,
  ];
  if (options?.withUser) {
    conditions.unshift('user_id IS ?');
    params.unshift(null);
  }
  return { sql: conditions.join(' AND '), params };
}
