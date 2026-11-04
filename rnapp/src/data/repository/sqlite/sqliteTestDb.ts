/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * 仓储层单测专用内存库（T77）。
 *
 * 用 Node 内置的 node:sqlite（:memory:）实现 expo-sqlite 的异步接口子集
 * （execAsync / runAsync / getFirstAsync / getAllAsync / withTransactionAsync），
 * 再执行真实的版本化迁移 DDL——Repository 测试因此跑在真实 SQL 引擎与真实
 * schema（含 CHECK、唯一索引、外键级联）之上，而不是手工 mock 的 SQL。
 *
 * 仅被 *.test.ts 引用，App 业务打包不包含本文件；需要 Node ≥22（内置 node:sqlite）。
 * 各用例在 beforeEach 中重新 openTestDb()，内存库随用例销毁，天然隔离。
 */
// node:sqlite 无 @types 声明，且为 Node 内置模块，直接 require
const { DatabaseSync } = require('node:sqlite');

/** 把 expo-sqlite 异步接口子集桥接到同步的 node:sqlite */
class NodeSqliteAdapter {
  private readonly inner: any;

  constructor() {
    this.inner = new DatabaseSync(':memory:');
    // 与 db.ts 生产配置一致：显式开启外键，ON DELETE CASCADE 才能被测到
    this.inner.exec('PRAGMA foreign_keys = ON');
  }

  async execAsync(sql: string): Promise<void> {
    this.inner.exec(sql);
  }

  async runAsync(
    sql: string,
    ...params: any[]
  ): Promise<{ changes: number; lastInsertRowId: number }> {
    const info = this.inner.prepare(sql).run(...params);
    return { changes: Number(info.changes), lastInsertRowId: Number(info.lastInsertRowid) };
  }

  async getFirstAsync<T = any>(sql: string, ...params: any[]): Promise<T | null> {
    const row = this.inner.prepare(sql).get(...params);
    return (row ?? null) as T | null;
  }

  async getAllAsync<T = any>(sql: string, ...params: any[]): Promise<T[]> {
    return this.inner.prepare(sql).all(...params) as T[];
  }

  /** SDK 58 单连接模型：回调内直接使用 db 即在事务中（与生产语义一致） */
  async withTransactionAsync(fn: () => Promise<void>): Promise<void> {
    this.inner.exec('BEGIN');
    try {
      await fn();
      this.inner.exec('COMMIT');
    } catch (err) {
      this.inner.exec('ROLLBACK');
      throw err;
    }
  }
}

/** 新建一个已迁移到最新 schema 的内存库（类型上伪装成 SQLiteDatabase） */
export async function openTestDb(): Promise<any> {
  const db = new NodeSqliteAdapter();
  // 懒 require：确保测试文件顶部的 jest.mock（如 expo-crypto）先于仓储模块链注册
  const { runMigrations } = require('../../migrations');
  await runMigrations(db);
  return db;
}
