/**
 * 云端七表在本机 SQLite 中的「缓存层」读写（T56）。
 *
 * 登录态下，同结构的七张本机表充当该账号的离线缓存（data-model 7.4）：
 * - 云端拉回的行经 normalize 成本机 Row 形态后在此 upsert（ON CONFLICT(id) DO UPDATE，
 *   不用 INSERT OR REPLACE——后者是 delete+insert，会触发外键级联误删子表）；
 * - 拉到 deleted=true 的行在本机物理删除；
 * - 首登合并前读取 user_id IS NULL 的匿名行；合并后把它们认领（claim）为当前账号；
 * - 退出登录选「清除」时按 user_id 物理删该账号缓存；
 * - sync_cursors 水位按「账号 × 表」记录。
 *
 * 仅本机的四张表（设置/提醒覆盖/节日开关/通知日志）不经过本文件。
 */
import type { SQLiteDatabase, SQLiteBindValue } from 'expo-sqlite';
import type { CloudTableName } from '../../../lib/syncMerge';
import type {
  AnniversaryRow,
  CardStateRow,
  FavoriteRow,
  PersonRow,
  SentRecordRow,
  SnapshotRow,
  TraitRow,
} from '../sqlite/rows';

/** 七表全部列（顺序即 INSERT 列顺序，严格对齐 001_init） */
export const CLOUD_TABLE_COLUMNS: Record<CloudTableName, readonly string[]> = {
  persons: [
    'id', 'name', 'relation', 'birthday_month', 'birthday_day', 'birth_year',
    'salutation', 'signature', 'user_id', 'created_at', 'updated_at', 'deleted',
  ],
  anniversaries: [
    'id', 'person_id', 'name', 'month', 'day', 'start_year',
    'user_id', 'created_at', 'updated_at', 'deleted',
  ],
  traits: ['id', 'person_id', 'content', 'position', 'user_id', 'created_at', 'updated_at', 'deleted'],
  content_snapshots: [
    'id', 'person_id', 'occasion_type', 'anniversary_id', 'festival_code', 'year',
    'blessings', 'gifts', 'status', 'fail_count', 'generated_at',
    'user_id', 'created_at', 'updated_at', 'deleted',
  ],
  card_states: [
    'id', 'person_id', 'occasion_type', 'anniversary_id', 'festival_code', 'year',
    'template_code', 'selected_index', 'edited_text',
    'user_id', 'created_at', 'updated_at', 'deleted',
  ],
  favorites: [
    'id', 'kind', 'person_id', 'person_label', 'occasion_type', 'anniversary_id',
    'festival_code', 'occasion_name', 'year', 'payload',
    'user_id', 'created_at', 'updated_at', 'deleted',
  ],
  sent_records: [
    'id', 'person_id', 'occasion_type', 'anniversary_id', 'festival_code', 'year',
    'kind', 'payload', 'marked_at',
    'user_id', 'created_at', 'updated_at', 'deleted',
  ],
};

/** 把若干已归一成 snake_case 的行 upsert 进本机缓存表（保留云端 id/user_id/时间戳） */
export async function upsertCacheRows<R extends object>(
  db: SQLiteDatabase,
  table: CloudTableName,
  rows: readonly R[],
): Promise<void> {
  if (rows.length === 0) return;
  const columns = CLOUD_TABLE_COLUMNS[table];
  const placeholders = columns.map(() => '?').join(', ');
  const updateCols = columns.filter((c) => c !== 'id');
  const updateSet = updateCols.map((c) => `${c} = excluded.${c}`).join(', ');
  const sql = `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders})
               ON CONFLICT(id) DO UPDATE SET ${updateSet}`;
  await db.withTransactionAsync(async () => {
    for (const row of rows) {
      const values = row as Record<string, SQLiteBindValue>;
      await db.runAsync(sql, ...columns.map((c) => values[c] ?? null));
    }
  });
}

/** 按主键物理删除本机缓存行（对端软删传播到本机后调用） */
export async function deleteCacheRowsByIds(
  db: SQLiteDatabase,
  table: CloudTableName,
  ids: readonly string[],
): Promise<void> {
  if (ids.length === 0) return;
  const placeholders = ids.map(() => '?').join(', ');
  await db.runAsync(`DELETE FROM ${table} WHERE id IN (${placeholders})`, ...ids);
}

/** 读取本机某表 user_id IS NULL 的匿名行（首登合并源数据），用调用方提供的 mapper 转实体 */
export async function listAnonymousRows<R, E>(
  db: SQLiteDatabase,
  table: CloudTableName,
  map: (row: R) => E,
): Promise<E[]> {
  const rows = await db.getAllAsync<R>(
    `SELECT * FROM ${table} WHERE user_id IS NULL ORDER BY created_at ASC, id ASC`,
  );
  return rows.map(map);
}

/**
 * 按主键精确认领匿名行为当前账号（首登合并成功一行才认领一行）。
 * 取代早期「整表 user_id IS NULL 一把盖」：某张表合并失败时，其匿名行必须
 * 保持 NULL，下次首登重试才能再次被 listAnonymousRows 读到，否则会永久漏传。
 * 表名来自代码内常量 CLOUD_TABLE_COLUMNS，非外部输入，可安全拼进 SQL。
 */
export async function claimRowsByIds(
  db: SQLiteDatabase,
  table: CloudTableName,
  ids: readonly string[],
  userId: string,
): Promise<void> {
  if (ids.length === 0) return;
  const placeholders = ids.map(() => '?').join(', ');
  await db.runAsync(
    `UPDATE ${table} SET user_id = ? WHERE id IN (${placeholders}) AND user_id IS NULL`,
    userId,
    ...ids,
  );
}

/**
 * 本机行主键收敛：业务键（COALESCE 表达式唯一索引）撞上云端异 id 行时，
 * 把本机行 id 改成云端 id，让随后的水位拉取按主键 ON CONFLICT 自然合入，
 * 也避免本机唯一索引在 pull 插入云端行时二次撞键。
 * 仅用于 content_snapshots/card_states/sent_records——三表主键不被任何其他表
 * 外键引用，改 id 无级联；调用方须保证 newId 在本机不存在。
 */
export async function rewriteRowId(
  db: SQLiteDatabase,
  table: CloudTableName,
  oldId: string,
  newId: string,
): Promise<void> {
  await db.runAsync(`UPDATE ${table} SET id = ? WHERE id = ?`, newId, oldId);
}

/**
 * 退出登录选「清除本机缓存」：物理删除该账号在七表的全部缓存行。
 * 只删 user_id 命中的行，不碰 user_id IS NULL 的匿名数据，也不碰四张仅本机表。
 */
export async function deleteUserCache(db: SQLiteDatabase, userId: string): Promise<void> {
  await db.withTransactionAsync(async () => {
    for (const table of Object.keys(CLOUD_TABLE_COLUMNS) as CloudTableName[]) {
      await db.runAsync(`DELETE FROM ${table} WHERE user_id = ?`, userId);
    }
    await db.runAsync('DELETE FROM sync_cursors WHERE user_id = ?', userId);
  });
}

// ---------- sync_cursors 水位 ----------

export async function getCursor(
  db: SQLiteDatabase,
  userId: string,
  table: CloudTableName,
): Promise<string | null> {
  const row = await db.getFirstAsync<{ last_pulled_at: string }>(
    'SELECT last_pulled_at FROM sync_cursors WHERE user_id = ? AND table_name = ?',
    userId,
    table,
  );
  return row?.last_pulled_at ?? null;
}

export async function setCursor(
  db: SQLiteDatabase,
  userId: string,
  table: CloudTableName,
  lastPulledAt: string,
): Promise<void> {
  await db.runAsync(
    `INSERT INTO sync_cursors (user_id, table_name, last_pulled_at) VALUES (?, ?, ?)
     ON CONFLICT(user_id, table_name) DO UPDATE SET last_pulled_at = excluded.last_pulled_at`,
    userId,
    table,
    lastPulledAt,
  );
}

/** 仅用于类型检查：导出各表 Row 类型供仓储/sync 引用 */
export type {
  PersonRow,
  AnniversaryRow,
  TraitRow,
  SnapshotRow,
  CardStateRow,
  FavoriteRow,
  SentRecordRow,
};
