/**
 * Supabase 云端行（PostgREST）与本机实体之间的映射（T56）。
 *
 * 云端行与本机 SQLite 行同为 snake_case 列名，但两处类型不同：
 * - blessings / gifts / payload 在云端是 jsonb（PostgREST 直接给 JS 对象/数组），
 *   本机是 TEXT（JSON 字符串）——上云不 stringify，落本机缓存才 stringify；
 * - deleted 在云端是 boolean，本机是 0/1；
 * - 时间戳两端都是 ISO/RFC3339 字符串，可直接互通。
 *
 * 做法：把云端行「规整」成本机 Row 形态后复用 rows.ts 既有 mapper，
 * 枚举窄化只有一处事实源；反向（实体→云端插入载荷）在本文件逐表显式列出。
 */
import type {
  Anniversary,
  CardState,
  ContentSnapshot,
  Favorite,
  Person,
  SentRecord,
  Trait,
} from '../../entities';
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
} from '../sqlite/rows';

const boolToInt = (v: boolean | null | undefined): number => (v ? 1 : 0);
/** jsonb 落本机 TEXT：null 透传，否则序列化 */
const jsonToText = (v: unknown): string | null =>
  v === null || v === undefined ? null : JSON.stringify(v);

// ---------- 云端行类型（标量列同本机 Row；JSON 列为对象；deleted 为 boolean） ----------

export type CloudPersonRow = Omit<PersonRow, 'deleted'> & { deleted: boolean };
export type CloudAnniversaryRow = Omit<AnniversaryRow, 'deleted'> & { deleted: boolean };
export type CloudTraitRow = Omit<TraitRow, 'deleted'> & { deleted: boolean };
export type CloudSnapshotRow = Omit<SnapshotRow, 'blessings' | 'gifts' | 'deleted'> & {
  blessings: string[] | null;
  gifts: ContentSnapshot['gifts'];
  deleted: boolean;
};
export type CloudCardStateRow = Omit<CardStateRow, 'deleted'> & { deleted: boolean };
export type CloudFavoriteRow = Omit<FavoriteRow, 'payload' | 'deleted'> & {
  payload: Favorite['payload'];
  deleted: boolean;
};
export type CloudSentRecordRow = Omit<SentRecordRow, 'payload' | 'deleted'> & {
  payload: SentRecord['payload'];
  deleted: boolean;
};

// ---------- 云端行 → 本机 Row 形态（jsonb 转 TEXT、boolean 转 0/1） ----------
// 规整结果既能喂 rows.ts 的 mapper，也能直接 upsert 进本机缓存表。

export function normalizePersonRow(row: CloudPersonRow): PersonRow {
  return { ...row, deleted: boolToInt(row.deleted) };
}
export function normalizeAnniversaryRow(row: CloudAnniversaryRow): AnniversaryRow {
  return { ...row, deleted: boolToInt(row.deleted) };
}
export function normalizeTraitRow(row: CloudTraitRow): TraitRow {
  return { ...row, deleted: boolToInt(row.deleted) };
}
export function normalizeSnapshotRow(row: CloudSnapshotRow): SnapshotRow {
  return {
    ...row,
    blessings: jsonToText(row.blessings),
    gifts: jsonToText(row.gifts),
    deleted: boolToInt(row.deleted),
  };
}
export function normalizeCardStateRow(row: CloudCardStateRow): CardStateRow {
  return { ...row, deleted: boolToInt(row.deleted) };
}
export function normalizeFavoriteRow(row: CloudFavoriteRow): FavoriteRow {
  return { ...row, payload: jsonToText(row.payload)!, deleted: boolToInt(row.deleted) };
}
export function normalizeSentRecordRow(row: CloudSentRecordRow): SentRecordRow {
  return { ...row, payload: jsonToText(row.payload)!, deleted: boolToInt(row.deleted) };
}

// ---------- 云端行 → 实体（先归一再走本机 mapper） ----------

export function cloudPersonToEntity(row: CloudPersonRow): Person {
  return mapPerson(normalizePersonRow(row));
}
export function cloudAnniversaryToEntity(row: CloudAnniversaryRow): Anniversary {
  return mapAnniversary(normalizeAnniversaryRow(row));
}
export function cloudTraitToEntity(row: CloudTraitRow): Trait {
  return mapTrait(normalizeTraitRow(row));
}
export function cloudSnapshotToEntity(row: CloudSnapshotRow): ContentSnapshot {
  return mapSnapshot(normalizeSnapshotRow(row));
}
export function cloudCardStateToEntity(row: CloudCardStateRow): CardState {
  return mapCardState(normalizeCardStateRow(row));
}
export function cloudFavoriteToEntity(row: CloudFavoriteRow): Favorite {
  return mapFavorite(normalizeFavoriteRow(row));
}
export function cloudSentRecordToEntity(row: CloudSentRecordRow): SentRecord {
  return mapSentRecord(normalizeSentRecordRow(row));
}

// ---------- 实体 → 云端插入/更新载荷（首登合并：保留 UUID 与原始时间戳） ----------
// 普通写路径也复用这些列形状；jsonb 直接给对象，deleted 给 boolean。

export function personToCloud(p: Person, userId: string) {
  return {
    id: p.id,
    user_id: userId,
    name: p.name,
    relation: p.relation,
    birthday_month: p.birthdayMonth,
    birthday_day: p.birthdayDay,
    birth_year: p.birthYear,
    salutation: p.salutation,
    signature: p.signature,
    created_at: p.createdAt,
    updated_at: p.updatedAt,
    deleted: p.deleted,
  };
}

export function anniversaryToCloud(a: Anniversary, userId: string) {
  return {
    id: a.id,
    user_id: userId,
    person_id: a.personId,
    name: a.name,
    month: a.month,
    day: a.day,
    start_year: a.startYear,
    created_at: a.createdAt,
    updated_at: a.updatedAt,
    deleted: a.deleted,
  };
}

export function traitToCloud(t: Trait, userId: string) {
  return {
    id: t.id,
    user_id: userId,
    person_id: t.personId,
    content: t.content,
    position: t.position,
    created_at: t.createdAt,
    updated_at: t.updatedAt,
    deleted: t.deleted,
  };
}

export function snapshotToCloud(s: ContentSnapshot, userId: string) {
  return {
    id: s.id,
    user_id: userId,
    person_id: s.personId,
    occasion_type: s.occasionType,
    anniversary_id: s.anniversaryId,
    festival_code: s.festivalCode,
    year: s.year,
    blessings: s.blessings,
    gifts: s.gifts,
    status: s.status,
    fail_count: s.failCount,
    generated_at: s.generatedAt,
    created_at: s.createdAt,
    updated_at: s.updatedAt,
    deleted: s.deleted,
  };
}

export function cardStateToCloud(c: CardState, userId: string) {
  return {
    id: c.id,
    user_id: userId,
    person_id: c.personId,
    occasion_type: c.occasionType,
    anniversary_id: c.anniversaryId,
    festival_code: c.festivalCode,
    year: c.year,
    template_code: c.templateCode,
    selected_index: c.selectedIndex,
    edited_text: c.editedText,
    created_at: c.createdAt,
    updated_at: c.updatedAt,
    deleted: c.deleted,
  };
}

export function favoriteToCloud(f: Favorite, userId: string) {
  return {
    id: f.id,
    user_id: userId,
    kind: f.kind,
    person_id: f.personId,
    person_label: f.personLabel,
    occasion_type: f.occasionType,
    anniversary_id: f.anniversaryId,
    festival_code: f.festivalCode,
    occasion_name: f.occasionName,
    year: f.year,
    payload: f.payload,
    created_at: f.createdAt,
    updated_at: f.updatedAt,
    deleted: f.deleted,
  };
}

export function sentRecordToCloud(r: SentRecord, userId: string) {
  return {
    id: r.id,
    user_id: userId,
    person_id: r.personId,
    occasion_type: r.occasionType,
    anniversary_id: r.anniversaryId,
    festival_code: r.festivalCode,
    year: r.year,
    kind: r.kind,
    payload: r.payload,
    marked_at: r.markedAt,
    created_at: r.createdAt,
    updated_at: r.updatedAt,
    deleted: r.deleted,
  };
}
