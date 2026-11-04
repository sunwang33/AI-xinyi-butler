/**
 * 仓储实例注册表（T56）：从 index.ts 抽出，使同步编排（src/lib/sync.ts）
 * 能重置登录态仓储而不经过 repository/index（后者依赖 authStore，直接互引会成环）。
 *
 * - 未登录：一个匿名 SqliteRepository 单例（user_id IS NULL）；
 * - 登录后：每账号一个 SupabaseRepository（写云端、读同账号缓存）；
 * - 退出登录：resetCloudRepositories() 清空，下次登录重建。
 */
import type { SQLiteDatabase } from 'expo-sqlite';
import type { DataRepository } from './types';
import { SqliteRepository } from './sqlite/SqliteRepository';
import { SupabaseRepository } from './supabase/SupabaseRepository';

let anonPromise: Promise<DataRepository> | null = null;
const cloudRepositories = new Map<string, Promise<DataRepository>>();

export function getAnonRepository(db: SQLiteDatabase): Promise<DataRepository> {
  anonPromise ??= Promise.resolve(new SqliteRepository(db));
  return anonPromise;
}

export function getCloudRepository(
  db: SQLiteDatabase,
  userId: string,
): Promise<DataRepository> {
  let promise = cloudRepositories.get(userId);
  if (!promise) {
    promise = Promise.resolve(
      // inner：按账号作用域读缓存表、管四张仅本机表、承担删除物理级联与通知钩子
      new SupabaseRepository(db, new SqliteRepository(db, userId), userId),
    );
    cloudRepositories.set(userId, promise);
  }
  return promise;
}

/** 退出登录流程末尾调用：丢弃全部云端仓储实例 */
export function resetCloudRepositories(): void {
  cloudRepositories.clear();
}
