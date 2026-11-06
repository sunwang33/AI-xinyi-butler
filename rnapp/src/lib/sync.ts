/**
 * 云端同步编排（M12 T56，门禁 G-A6）。
 *
 * 三条路径：
 * 1. 首登静默合并（mergeAnonymousData）：user_id IS NULL 的本机历史行按
 *    CLOUD_TABLES 顺序上传——保留原 UUID 与 created_at/updated_at，upsert(onConflict=id)；
 *    同 id 云端行 updated_at 更新时跳过本机覆盖（新者胜）。snapshot/cardState/sentRecord
 *    三表另做业务键查重：同键异 id 时改 PATCH 云端行并把本机 id 收敛到云端 id（表达式
 *    唯一索引不能作 on_conflict 目标，盲插必 409）。逐表容错，只按成功行 id 精确 claim，
 *    失败表保持匿名待下次重试；无论是否部分失败都继续执行 pullAll；
 * 2. 水位增量拉取（pullAll）：按 sync_cursors.last_pulled_at 拉 updated_at 更新行，
 *    deleted=true 物理删本机缓存（删人/删纪念日顺带取消已调度系统通知），其余按新者胜
 *    upsert；表处理顺序为 CLOUD_TABLES 的反序（子表先、persons 最后），避免 persons
 *    物理删的外键级联抢先清掉待收敛的子表行；
 * 3. 退出登录（performSignOut）：弹窗二选一——清除本机缓存（默认）或保留待同账号重登。
 *
 * 约束：离线静默跳过；同账号所有任务进同一条 Promise 链串行，杜绝水位竞争；
 * 合并/拉取失败只记录不打扰用户，回前台或下次写入后自动重试。
 */
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
import type { OccasionKey } from '../data/entities';
import { getNotificationCanceller } from '../data/repository/notificationCanceller';
import { resetCloudRepositories } from '../data/repository/registry';
import { setSupabasePostWriteHook } from '../data/repository/supabase/SupabaseRepository';
import { translateCloudError } from '../data/repository/supabase/cloudError';
import { applyOccasionFilters } from '../data/repository/supabase/occasionQuery';
import {
  claimRowsByIds,
  deleteCacheRowsByIds,
  deleteUserCache,
  getCursor,
  listAnonymousRows,
  rewriteRowId,
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
 * 这三张表的云端/本机业务唯一索引都是 COALESCE 表达式，不能作为 upsert 的
 * on_conflict 目标；同业务键异 id 的行（典型：清数据/重装后本机重新生成 uuid）
 * 盲 INSERT 必撞 23505/409，必须先按业务键查重再决定 PATCH 还是收敛 id。
 */
const BUSINESS_KEY_TABLES: ReadonlySet<CloudTableName> = new Set<CloudTableName>([
  'content_snapshots',
  'card_states',
  'sent_records',
]);

/** 按「人 × 日子 × 年份」业务键查云端同键行（sent_records 再加 kind）；RLS 隐式限本人 */
async function findRemoteByBusinessKey(
  table: CloudTableName,
  local: TimestampedRow,
): Promise<{ id: string; updatedAt: string } | null> {
  const key = local as unknown as OccasionKey;
  let query = applyOccasionFilters(
    supabase.from(table).select('id, updated_at, deleted'),
    key,
  );
  if (table === 'sent_records') {
    query = query.eq('kind', (local as { kind?: string }).kind);
  }
  const { data, error } = await query.limit(1).maybeSingle();
  if (error) throw translateCloudError(error, '云端数据读取失败');
  if (!data) return null;
  return { id: data.id as string, updatedAt: data.updated_at as string };
}

/**
 * 合并单张表：读匿名行 → 主键查重 + 业务键查重 → 新者胜裁决 → 上传/收敛。
 * 返回成功处理、应认领到本账号名下的本机行 id 名单（业务键异 id 收敛后为云端 id）。
 * 任一步失败直接抛出，由 mergeAnonymousData 逐表容错；失败表不 claim，匿名行保留待重试。
 */
async function mergeTable(
  db: SQLiteDatabase,
  table: CloudTableName,
  userId: string,
): Promise<string[]> {
  const adapter = ADAPTERS[table];
  const locals = await adapter.listAnonymous(db);
  if (locals.length === 0) return [];

  // 1) 按主键批量查重：同 id 行按 updated_at 新者胜
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

  // 2) 表达式唯一索引表：逐行按业务键查「同键异 id」的云端行（409 根源）
  const remoteKeyByLocalId = new Map<string, { id: string; updatedAt: string }>();
  // 本机全表现有主键：同业务键重复匿名行收敛到同一云端 id 时，用来判断目标 id 是否已被占用
  let localExistingIds: Set<string> | null = null;
  if (BUSINESS_KEY_TABLES.has(table)) {
    localExistingIds = new Set(
      (await db.getAllAsync<{ id: string }>(`SELECT id FROM ${table}`)).map((row) => row.id),
    );
    for (const local of locals) {
      const keyHit = await findRemoteByBusinessKey(table, local);
      if (keyHit) remoteKeyByLocalId.set(local.id, keyHit);
    }
  }

  // 3) 逐行裁决：异 id 同键走 PATCH + 本机 id 收敛；其余走主键 upsert
  const payloads: Record<string, unknown>[] = [];
  const claimedIds: string[] = [];
  for (const local of locals) {
    const sameIdRemote = remoteById.get(local.id) ?? null;
    const keyHit = remoteKeyByLocalId.get(local.id) ?? null;

    if (keyHit && keyHit.id !== local.id) {
      // 同业务键异 id：INSERT 必撞唯一索引。本机更新则 PATCH 云端既有行，
      // 云端更新则跳过上传；无论谁新，本机 id 都应收敛到云端 id，随后 pull 合内容。
      if (!isRemoteNewer(local.updatedAt, keyHit.updatedAt)) {
        const patch = adapter.toCloud(local, userId) as Record<string, unknown>;
        // PATCH 不动主键与建号时间：id 以云端行为准，created_at 保留云端原值
        delete patch.id;
        delete patch.created_at;
        const { error } = await supabase.from(table).update(patch).eq('id', keyHit.id);
        if (error) throw translateCloudError(error, '云端数据合并失败');
      }
      if (localExistingIds?.has(keyHit.id)) {
        // 本机已有同云端 id 的行（典型：同业务键重复匿名行，前一行已收敛/或曾被 pull 拉回）：
        // 云端表达式唯一索引保证同业务键只有一行，当前行属本机冗余，物理删除而非改 id
        // （改 id 必撞本机主键 UNIQUE，会让该表每次重试都卡死）；三表主键无外表外键引用，无级联。
        await db.runAsync(`DELETE FROM ${table} WHERE id = ?`, local.id);
        console.warn(`[sync] 合并去重：${table} 本机同业务键重复行 ${local.id} 已删除，收敛到 ${keyHit.id}`);
      } else {
        await rewriteRowId(db, table, local.id, keyHit.id);
        localExistingIds?.add(keyHit.id);
      }
      claimedIds.push(keyHit.id);
      continue;
    }

    if (
      shouldUploadLocalRow(
        { id: local.id, updatedAt: local.updatedAt },
        sameIdRemote ? { id: local.id, updatedAt: sameIdRemote } : null,
      )
    ) {
      // 显式 onConflict=id：同 id 冲突转 UPDATE；载荷带原始 created_at/updated_at 保留历史时间戳
      payloads.push(adapter.toCloud(local, userId));
    }
    // 上传与「云端较新跳过」的行都属于本账号，统一进 claim 名单（失败抛错时整表作废不 claim）
    claimedIds.push(local.id);
  }

  // 4) 普通路径批量 upsert
  for (let i = 0; i < payloads.length; i += BATCH_SIZE) {
    const { error } = await supabase
      .from(table)
      .upsert(payloads.slice(i, i + BATCH_SIZE), { onConflict: 'id' });
    if (error) throw translateCloudError(error, '云端数据合并失败');
  }

  return claimedIds;
}

/**
 * 七表顺序合并，逐表容错：单表失败只记录、不炸断其他表与后续拉取，
 * 且只精确认领成功表的行（失败表匿名行保持 user_id IS NULL，下次首登可重试）。
 * 返回 hadFailures 供调用方决定是否清除首登缓存以允许重试。
 */
async function mergeAnonymousData(
  db: SQLiteDatabase,
  userId: string,
): Promise<{ hadFailures: boolean }> {
  let hadFailures = false;
  for (const table of CLOUD_TABLES) {
    try {
      const claimedIds = await mergeTable(db, table, userId);
      await claimRowsByIds(db, table, claimedIds, userId);
    } catch (error) {
      hadFailures = true;
      console.error(`[sync] 首登合并失败：${table}`, error);
    }
  }
  return { hadFailures };
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
    // 合并逐表容错：部分表失败也不能挡住拉取——已上云的同 id 行（如 persons）
    // 要靠 pullAll 按主键合回本机缓存，登录后 UI 才不会因匿名行未认领而空白
    const { hadFailures } = await mergeAnonymousData(db, userId);
    await pullAll(db, userId);
    if (hadFailures) {
      // enqueue 为保持串行链不断会吞掉 job 抛错，rejection 分支清缓存不可靠，
      // 必须在 job 内主动清除：否则本次运行期内回前台/写后都命中缓存承诺短路，
      // 失败表要等 App 重启才重试。匿名行仍在，ACTIVE/写后会重新合并。
      firstSyncs.delete(userId);
      throw new Error('部分表首登合并失败，匿名行已保留，将在下次联网时重试');
    }
  });
  // 双保险：当前 enqueue 吞错使 rejection 分支不会触发，若日后队列改造透传错误可兜底
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
}

/**
 * 回前台补跑（由根布局的 AppState 监听在 active 时调用）：
 * 离线冷启动后回联网补首登同步，再做一次增量拉取。
 * RN 生命周期留在组件层（_layout），本模块保持纯逻辑以便 node 环境单测。
 */
export function onAppStateActive(): void {
  const userId = getCurrentUserId();
  if (!userId) return;
  void firstSyncForUser(userId).then(schedulePull);
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
