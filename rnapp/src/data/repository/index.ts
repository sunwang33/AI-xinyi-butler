/**
 * 数据访问入口（依赖注入，M12 T56 起按登录态动态切换）：
 * - 未登录：SqliteRepository，七张上云表读写 user_id IS NULL 的匿名行；
 * - 登录后：SupabaseRepository（读本机同账号缓存、写 write-through 云端）。
 *
 * 实例注册表在 ./registry（同步编排退出登录时也要重置，独立成模块避免依赖环）；
 * 首登静默合并、水位增量同步由 src/lib/sync.ts 编排。
 * UI/业务模块一律 `const repo = await getRepository()`，调用方无需感知切换。
 */
import { getDatabase } from '../db';
import { useAccountStore } from '../../features/account/authStore';
import type { DataRepository } from './types';
import { getAnonRepository, getCloudRepository, resetCloudRepositories } from './registry';

export async function getRepository(): Promise<DataRepository> {
  const db = await getDatabase();
  const userId = useAccountStore.getState().session?.user?.id ?? null;
  return userId ? getCloudRepository(db, userId) : getAnonRepository(db);
}

export { resetCloudRepositories };

export { registerNotificationCanceller } from './notificationCanceller';
export type { NotificationCanceller } from './notificationCanceller';
export type { DataRepository } from './types';
export * from '../entities';
