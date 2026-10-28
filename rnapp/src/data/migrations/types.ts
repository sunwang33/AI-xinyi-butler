import type { SQLiteDatabase } from 'expo-sqlite';

/**
 * 迁移执行器：withTransactionAsync 回调中的事务对象与数据库连接
 * 都满足这一最小结构（execAsync 可一次执行多条语句）。
 */
export type MigrationExecutor = Pick<
  SQLiteDatabase,
  'execAsync' | 'runAsync' | 'getAllAsync' | 'getFirstAsync'
>;

/**
 * 版本化迁移：后续表结构变更只追加新文件（version 递增），
 * 不得修改已发布的迁移（否则老用户无法升级）。
 */
export interface Migration {
  readonly version: number;
  readonly name: string;
  up(exec: MigrationExecutor): Promise<void>;
}
