/**
 * 数据访问入口（依赖注入）：
 * - M2～M11：未登录，getRepository() 返回 SQLite 实现；
 * - 阶段 12（T56）：登录后在此按 A6 策略切换为 Supabase 实现，调用方无感知。
 *
 * UI/业务模块一律 `const repo = await getRepository()`，不得直接 import SQLite 实现。
 */
import { getDatabase } from '../db';
import type { DataRepository } from './types';
import { SqliteRepository } from './sqlite/SqliteRepository';

let repositoryPromise: Promise<DataRepository> | null = null;

export function getRepository(): Promise<DataRepository> {
  if (!repositoryPromise) {
    repositoryPromise = getDatabase().then((db) => new SqliteRepository(db));
  }
  return repositoryPromise;
}

export { registerNotificationCanceller } from './notificationCanceller';
export type { NotificationCanceller } from './notificationCanceller';
export type { DataRepository } from './types';
export * from '../entities';
