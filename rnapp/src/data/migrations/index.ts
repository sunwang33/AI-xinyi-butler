import type { SQLiteDatabase } from 'expo-sqlite';
import type { Migration } from './types';
import migration001 from './001_init';

/**
 * 迁移注册表：严格按 version 升序追加。
 * 每个版本在应用的一生中只执行一次，执行记录保存在 schema_migrations 表。
 */
export const migrations: readonly Migration[] = [migration001];

/** 当前代码期望的数据库 schema 版本 */
export const LATEST_SCHEMA_VERSION = migrations[migrations.length - 1].version;

/**
 * 启动时执行版本化迁移：
 * 1. 确保 schema_migrations 元数据表存在；
 * 2. 跳过已应用版本，未应用的版本逐迁入一个事务（失败整体回滚，不产生半库）；
 * 3. 返回迁移后的最新版本号。
 */
export async function runMigrations(db: SQLiteDatabase): Promise<number> {
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version     INTEGER PRIMARY KEY NOT NULL,
      applied_at  TEXT NOT NULL
    );
  `);

  const rows = await db.getAllAsync<{ version: number }>(
    'SELECT version FROM schema_migrations ORDER BY version ASC',
  );
  const appliedVersions = new Set(rows.map((row) => row.version));

  for (const migration of [...migrations].sort((a, b) => a.version - b.version)) {
    if (appliedVersions.has(migration.version)) {
      continue;
    }
    // SDK 58 单连接模型：事务回调不接收 txn，回调内直接使用 db 即在事务中
    await db.withTransactionAsync(async () => {
      await migration.up(db);
      await db.runAsync(
        'INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)',
        migration.version,
        new Date().toISOString(),
      );
    });
  }

  return LATEST_SCHEMA_VERSION;
}
