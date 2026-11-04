/**
 * 云同步的纯函数判定核心（M12 T56 / G-A6）。
 * 不含任何 I/O：不碰 SQLite、不发网络请求，只做表清单、时间戳比较与
 * 「updated_at 新者胜」裁决，供 src/lib/sync.ts 编排层与 SupabaseRepository 复用，
 * 也便于单测（T77）。
 */

/** 七张上云表的库内表名（与 001_init / 云端迁移完全一致），顺序即首登合并上传顺序 */
export const CLOUD_TABLES = [
  'persons',
  'anniversaries',
  'traits',
  'content_snapshots',
  'card_states',
  'favorites',
  'sent_records',
] as const;

export type CloudTableName = (typeof CLOUD_TABLES)[number];

/** 带同步所需时间戳与主键的最小结构（七类实体都满足） */
export interface TimestampedRow {
  id: string;
  updatedAt: string;
}

/**
 * 解析 ISO/RFC3339 时间戳为毫秒数。
 * 本机 now() 与云端 timestamptz 回传都是带 Z 的 UTC，正常都可解析；
 * 解析失败返回 null，由调用方按保守策略处理。
 */
export function toMillis(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isNaN(t) ? null : t;
}

/**
 * 远端行是否比本机行「新」：仅当远端 updated_at 严格晚于本机时为 true。
 * 时间戳相等时返回 false（保留本机，减少无谓写入；两端内容在合并语义下视为一致）。
 * 任一端时间戳无法解析时走保守策略：
 * - 远端无法解析：不敢让它覆盖本机 → false；
 * - 本机无法解析而远端合法：让远端胜出 → true。
 */
export function isRemoteNewer(localUpdatedAt: string, remoteUpdatedAt: string): boolean {
  const local = toMillis(localUpdatedAt);
  const remote = toMillis(remoteUpdatedAt);
  if (remote === null) return false;
  if (local === null) return true;
  return remote > local;
}

/**
 * 首登静默合并时，判定一条本机匿名行是否需要上传（G-A6：保留 UUID、updated_at 新者胜）。
 * @param local 本机行（user_id IS NULL 的匿名行）
 * @param remote 云端同 id 行；同账号首次登录通常为 undefined（云端不存在）
 * @returns true=需要 INSERT/UPDATE 到云端；false=云端更新或等新，跳过上传，后续 pull 会带回云端版
 */
export function shouldUploadLocalRow(local: TimestampedRow, remote: TimestampedRow | null): boolean {
  if (!remote) return true;
  return isRemoteNewer(remote.updatedAt, local.updatedAt);
}

/**
 * 增量拉取时，判定一条云端行是否应覆盖本机缓存：
 * 普通行要求云端更新才 upsert；deleted=true 的行由编排层直接物理删，不经过本函数。
 */
export function shouldApplyRemoteRow(local: TimestampedRow | null, remote: TimestampedRow): boolean {
  if (!local) return true;
  return isRemoteNewer(local.updatedAt, remote.updatedAt);
}
