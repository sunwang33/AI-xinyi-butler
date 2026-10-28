import * as SQLite from 'expo-sqlite';
import { runMigrations, LATEST_SCHEMA_VERSION } from './migrations';

/** 本机数据库文件名（阶段 12 前全部数据只存这里） */
const DB_NAME = 'xinyi.db';

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

/**
 * 打开（或获取已打开的）本机数据库并执行版本化迁移。
 * 幂等：重复调用复用同一连接与初始化 Promise，App 启动时调用一次即可。
 */
export function getDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (!dbPromise) {
    dbPromise = openAndMigrate();
  }
  return dbPromise;
}

async function openAndMigrate(): Promise<SQLite.SQLiteDatabase> {
  const db = await SQLite.openDatabaseAsync(DB_NAME);
  // WAL 提升并发读写可靠性；显式开启外键约束（Repository 另做事务级联，双保险）
  await db.execAsync(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
  `);
  const version = await runMigrations(db);
  if (__DEV__) {
    // 开发期可据此在 Metro 日志确认迁移成功（M2 无独立界面）
    console.log(`[db] 数据库就绪：${DB_NAME}，schema 版本 ${version}`);
  }
  return db;
}

export { LATEST_SCHEMA_VERSION };
