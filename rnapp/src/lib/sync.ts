/**
 * 云端同步编排（M12 T56，门禁 G-A6）。
 *
 * 三条路径：
 * 1. 首登静默合并（mergeAnonymousData）：user_id IS NULL 的本机历史行按
 *    CLOUD_TABLES 顺序上传——保留原 UUID 与 created_at/updated_at，upsert(onConflict=id)；
 *    同 id 云端行 updated_at 更新时跳过本机覆盖（新者胜），随后 claim 全部匿名为当前账号；
 * 2. 水位增量拉取（pullAll）：按 sync_cursors.last_pulled_at 拉 updated_at 更新行，
 *    deleted=true 物理删本机缓存（删人/删纪念日顺带取消已调度系统通知），其余按新者胜
 *    upsert；表处理顺序为 CLOUD_TABLES 的反序（子表先、persons 最后），避免 persons
 *    物理删的外键级联抢先清掉待收敛的子表行；
 * 3. 退出登录（performSignOut）：弹窗二选一——清除本机缓存（默认）或保留待同账号重登。
 *
 * 约束：离线静默跳过；同账号所有任务进同一条 Promise 链串行，杜绝水位竞争；
 * 合并/拉取失败只记录不打扰用户，回前台或下次写入后自动重试。
 */
import { AppState } from 'react-native';
import type { SQLiteDatabase } from 'expo-sqlite';
import { supabase } from './supabase';
import { useNetworkStore } from './network';
import { useAccountStore } from '../features/account/authStore';
import { getDatabase } from '../data/db';
import {
  CLOUD_TABLES,
  isRemoteNewer,
  shouldApplyRemoteRow,
  shouldUploadLocalRow,
  toMillis,
  type CloudTableName,
  type TimestampedRow,
} from './syncMerge';
import { getNotificationCanceller } from '../data/repository/notificationCanceller';
import { resetCloudRepositories } from '../data/repository/registry';
import { setSupabasePostWriteHook } from '../data/repository/supabase/SupabaseRepository';
import { translateCloudError } from '../data/repository/supabase/cloudError';
import {
  claimAnonymousRows,
  deleteCacheRowsByIds,
  deleteUserCache,
  getCursor,
  listAnonymousRows,
  setCursor,
  upsertCacheRows,
} from '../data/repository/supabase/localCache';
import {
  anniversaryToCloud,
  cardStateToCloud,
  favoriteToCloud,
  normalizeAnniversaryRow,
  normalizeCardStateRow,
  normalizeFavoriteRow,
  normalizePersonRow,
  normalizeSentRecordRow,
  normalizeSnapshotRow,
  normalizeTraitRow,
  personToCloud,
  sentRecordToCloud,
  snapshotToCloud,
  traitToCloud,
} from '../data/repository/supabase/cloudRows';
import {
  mapAnniversary,
  mapCardState,
  mapFavorite,
  mapPerson,
  mapSentRecord,
  mapSnapshot,
  mapTrait,
  type AnniversaryRow,
  type CardStateRow,
  type FavoriteRow,
  type PersonRow,
  type SentRecordRow,
  type SnapshotRow,
  type TraitRow,
} from '../data/repository/sqlite/rows';

/** 单批行数：控制 PostgREST 的 URL（in=）与 body 体积 */
const BATCH_SIZE = 200;
/** 写后 / 回前台增量拉取的合并等待时间，避免连续操作打爆同步 */
const PULL_DEBOUNCE_MS = 8000;

interface SyncTableAdapter {
  /** 读取本机匿名行（首登合并源） */
  listAnonymous: (db: SQLiteDatabase) => Promise<TimestampedRow[]>;
  /** 实体 → 云端 upsert 载荷（保留 id 与原始时间戳） */
  toCloud: (entity: any, userId: string) => Record<string, unknown>;
  /** 云端回传行 → 本机 Row（jsonb 转 TEXT、boolean 转 0/1） */
  normalize: (cloudRow: any) => any;
}

/** 七表适配器，键顺序即 CLOUD_TABLES（首登上传：主行在前） */
const ADAPTERS: Record<CloudTableName, SyncTableAdapter> = {
  persons: {
    listAnonymous: (db) => listAnonymousRows<PersonRow, TimestampedRow>(db, 'persons', mapPerson),
    toCloud: personToCloud,
    normalize: normalizePersonRow,
  },
  anniversaries: {
    listAnonymous: (db) =>
      listAnonymousRows<AnniversaryRow, TimestampedRow>(db, 'anniversaries', mapAnniversary),
    toCloud: anniversaryToCloud,
    normalize: normalizeAnniversaryRow,
  },
  traits: {
    listAnonymous: (db) => listAnonymousRows<TraitRow, TimestampedRow>(db, 'traits', mapTrait),
    toCloud: traitToCloud,
    normalize: normalizeTraitRow,
  },
  content_snapshots: {
    listAnonymous: (db) =>
      listAnonymousRows<SnapshotRow, TimestampedRow>(db, 'content_snapshots', mapSnapshot),
    toCloud: snapshotToCloud,
    normalize: normalizeSnapshotRow,
  },
  card_states: {
    listAnonymous: (db) =>
      listAnonymousRows<CardStateRow, TimestampedRow>(db, 'card_states', mapCardState),
    toCloud: cardStateToCloud,
    normalize: normalizeCardStateRow,
  },
  favorites: {
    listAnonymous: (db) =>
      listAnonymousRows<FavoriteRow, TimestampedRow>(db, 'favorites', mapFavorite),
    toCloud: favoriteToCloud,
    normalize: normalizeFavoriteRow,
  },
  sent_records: {
    listAnonymous: (db) =>
      listAnonymousRows<SentRecordRow, TimestampedRow>(db, 'sent_records', mapSentRecord),
    toCloud: sentRecordToCloud,
    normalize: normalizeSentRecordRow,
  },
};

// ---------- 首登静默合并 ----------

/**
 * 合并单张表：读匿名行 → 查云端同 id 行 → 新者胜筛选 → 批量 upsert。
 * 云端冲突行（同 id）的 updated_at 由服务端维护；我们只上传本机更新或云端缺失的行。
 */
async function mergeTable(db: SQLiteDatabase, table: CloudTableName, userId: string): Promise<void> {
  const adapter = ADAPTERS[table];
  const locals = await adapter.listAnonymous(db);
  if (locals.length === 0) return;

  const ids = locals.map((row) => row.id);
  const remoteById = new Map<string, string>();
  for (let i = 0; i < ids.length; i += BATCH_SIZE) {
    const batch = ids.slice(i, i + BATCH_SIZE);
    const { data, error } = await supabase
      .from(table)
      .select('id, updated_at, deleted')
      .in('id', batch);
    if (error) throw translateCloudError(error, '云端数据读取失败');
    for (const row of data ?? []) {
      remoteById.set(row.id as string, row.updated_at as string);
    }
  }

  const payloads: Record<string, unknown>[] = [];
  for (const local of locals) {
    const remoteUpdatedAt = remoteById.get(local.id) ?? null;
    if (
      shouldUploadLocalRow(
        { id: local.id, updatedAt: local.updatedAt },
        remoteUpdatedAt ? { id: local.id, updatedAt: remoteUpdatedAt } : null,
      )
    ) {
      payloads.push(adapter.toCloud(local, userId));
    }
  }

  for (let i = 0; i < payloads.length; i += BATCH_SIZE) {
    const { error } = await supabase
      .from(table)
      // 必须显式 onConflict=id：业务唯一索引是 COALESCE 表达式，不能作为冲突目标；
      // INSERT 载荷显式带 created_at/updated_at，保留历史行时间戳（见云端迁移头注释）
      .upsert(payloads.slice(i, i + BATCH_SIZE), { onConflict: 'id' });
    if (error) throw translateCloudError(error, '云端数据合并失败');
  }
}

/** 七表顺序合并，全部上传成功后一次性认领匿名行 */
async function mergeAnonymousData(db: SQLiteDatabase, userId: string): Promise<void> {
  for (const table of CLOUD_TABLES) {
    await mergeTable(db, table, userId);
  }
  await claimAnonymousRows(db, userId);
}

// ---------- 水位增量拉取 ----------

/** 删除传播到本机前，先取出受影响的已调度系统通知，删行后再取消 */
async function cancelScheduledNotifications(
  db: SQLiteDatabase,
  table: CloudTableName,
  ids: readonly string[],
): Promise<void> {
  if (ids.length === 0 || (table !== 'persons' && table !== 'anniversaries')) return;
  const column = table === 'persons' ? 'person_id' : 'anniversary_id';
  const placeholders = ids.map(() => '?').join(', ');
  const rows = await db.getAllAsync<{ os_notification_id: string | null }>(
    `SELECT os_notification_id FROM notification_log
     WHERE ${column} IN (${placeholders}) AND status = 'scheduled'`,
    ...ids,
  );
  const osIds = rows
    .map((row) => row.os_notification_id)
    .filter((value): value is string => Boolean(value));
  if (osIds.length > 0) {
    await getNotificationCanceller()(osIds);
  }
}

/** 单表增量拉取；失败抛出由调用方决定是否推进水位（失败不推进） */
async function pullTable(db: SQLiteDatabase, userId: string, table: CloudTableName): Promise<void> {
  const adapter = ADAPTERS[table];
  const cursor = await getCursor(db, userId, table);

  let query = supabase.from(table).select('*');
  if (cursor) {
    query = query.gt('updated_at', cursor);
  }
  const { data: remoteRows, error } = await query;
  if (error) throw translateCloudError(error, '云端数据拉取失败');
  if (!remoteRows || remoteRows.length === 0) return;

  // 本机现有该账号缓存行的时间戳，供新者胜裁决
  const localRows = await db.getAllAsync<{ id: string; updated_at: string }>(
    `SELECT id, updated_at FROM ${table} WHERE user_id = ?`,
    userId,
  );
  const localById = new Map(localRows.map((row) => [row.id, row.updated_at]));

  const toUpsert: object[] = [];
  const toDelete: string[] = [];
  let maxUpdatedAt = cursor;

  for (const row of remoteRows) {
    const rowUpdatedAt = row.updated_at as string;
    if (!maxUpdatedAt || isRemoteNewer(maxUpdatedAt, rowUpdatedAt)) {
      maxUpdatedAt = rowUpdatedAt;
    }
    if (row.deleted === true) {
      toDelete.push(row.id as string);
      continue;
    }
    const localUpdatedAt = localById.get(row.id as string) ?? null;
    if (
      shouldApplyRemoteRow(
        localUpdatedAt ? { id: row.id, updatedAt: localUpdatedAt } : null,
        { id: row.id, updatedAt: rowUpdatedAt },
      )
    ) {
      toUpsert.push(adapter.normalize(row));
    }
  }

  // 先 upsert 后物理删（两批 id 按 deleted 分流，不会重叠）
  await upsertCacheRows(db, table, toUpsert);
  // 删人/删纪念日：行消失前取消其待送达通知（外键级联会同时清掉 notification_log）
  await cancelScheduledNotifications(db, table, toDelete);
  await deleteCacheRowsByIds(db, table, toDelete);

  if (maxUpdatedAt && toMillis(maxUpdatedAt) !== null) {
    await setCursor(db, userId, table, maxUpdatedAt);
  }
}

/** 全表增量拉取：反序处理，单表失败只记录、不推进该表水位、不阻断其他表 */
async function pullAll(db: SQLiteDatabase, userId: string): Promise<void> {
  for (const table of [...CLOUD_TABLES].reverse()) {
    try {
      await pullTable(db, userId, table);
    } catch (error) {
      console.error(`[sync] 增量拉取失败：${table}`, error);
    }
  }
}

// ---------- 串行队列与触发 ----------

/** 每账号一条任务链：首登合并、增量拉取、退出清理互不并发 */
const chains = new Map<string, Promise<void>>();
/** 已在跑/已完成的首登合并承诺（成功缓存；失败删除以允许重试） */
const firstSyncs = new Map<string, Promise<void>>();
let pullTimer: ReturnType<typeof setTimeout> | null = null;

function enqueue(userId: string, job: () => Promise<void>): Promise<void> {
  const previous = chains.get(userId) ?? Promise.resolve();
  const next = previous.then(job).catch((error: unknown) => {
    console.error('[sync] 同步任务异常', error);
  });
  chains.set(userId, next);
  return next;
}

/**
 * 首登（或冷启动恢复）同步：匿名合并 → 全量/增量拉取。
 * 永远 resolve（失败只记录），供登录页 await 以消除登录后的数据空窗；
 * 离线直接跳过且不缓存承诺，回前台联网后自动补跑。
 */
export function firstSyncForUser(userId: string): Promise<void> {
  const cached = firstSyncs.get(userId);
  if (cached) return cached;
  if (!useNetworkStore.getState().online) return Promise.resolve();

  const promise = enqueue(userId, async () => {
    const db = await getDatabase();
    await mergeAnonymousData(db, userId);
    await pullAll(db, userId);
  });
  // 失败后移除缓存，允许 ACTIVE / 写后重试
  const tracked = promise.then(() => undefined, () => {
    firstSyncs.delete(userId);
  });
  firstSyncs.set(userId, tracked);
  return tracked;
}

/** 合并一段时间内的多次触发（写后、回前台），做一次增量拉取 */
function schedulePull(): void {
  const userId = getCurrentUserId();
  if (!userId || !useNetworkStore.getState().online) return;
  if (pullTimer) clearTimeout(pullTimer);
  pullTimer = setTimeout(() => {
    pullTimer = null;
    const uid = getCurrentUserId();
    if (!uid) return;
    void enqueue(uid, async () => {
      const db = await getDatabase();
      await pullAll(db, uid);
    });
  }, PULL_DEBOUNCE_MS);
}

/** 当前登录账号 id（authStore 在本模块单点读取；命名避开 use 前缀以免被 Hook 规则误判） */
function getCurrentUserId(): string | null {
  return useAccountStore.getState().session?.user?.id ?? null;
}

let initialized = false;

/** App 根布局在数据库就绪后调用一次：挂接触发点 */
export function initSync(): void {
  if (initialized) return;
  initialized = true;

  // 写后防抖拉取：校准服务端 updated_at，并收敛其他端的并发改动
  setSupabasePostWriteHook(schedulePull);

  // 登录 / 冷启动恢复会话：跑首登同步（幂等：已 claim 后匿名行为空、拉取走水位）
  supabase.auth.onAuthStateChange((_event, session) => {
    if (session?.user?.id) {
      void firstSyncForUser(session.user.id);
    }
  });

  // 回前台：补跑首登同步（离线冷启动场景）+ 增量拉取
  AppState.addEventListener('change', (state) => {
    if (state !== 'active') return;
    const userId = getCurrentUserId();
    if (!userId) return;
    void firstSyncForUser(userId).then(schedulePull);
  });
}

// ---------- 退出登录 ----------

export type SignOutChoice = 'clear' | 'keep';

/**
 * 退出登录（设置页弹窗二选一）：
 * @param choice clear=物理删除该账号七表缓存与水位（匿名行与四张仅本机表保留）；
 *               keep=缓存留在本机，同账号重登仍在、换号登录按 user_id 隔离读不到
 */
export async function performSignOut(choice: SignOutChoice): Promise<void> {
  const userId = getCurrentUserId();

  const { error } = await supabase.auth.signOut();
  if (error) {
    if (/network|fetch|timeout/i.test(error.message)) {
      throw new Error('网络连接异常，退出未完成，请检查网络后重试');
    }
    throw new Error(error.message);
  }

  if (userId) {
    chains.delete(userId);
    firstSyncs.delete(userId);
    if (choice === 'clear') {
      const db = await getDatabase();
      await deleteUserCache(db, userId);
    }
  }
  resetCloudRepositories();
}
