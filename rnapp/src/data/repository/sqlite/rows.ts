/**
 * SQLite 行结构（snake_case）到实体（camelCase）的映射。
 * 枚举值已由建表 CHECK 约束保证，这里只做类型窄化。
 */
import {
  FESTIVAL_CODES,
  RELATIONS,
  type AiConsent,
  type ContentKind,
  type ContentPayload,
  type ContentSnapshot,
  type Favorite,
  type FestivalCode,
  type FestivalSetting,
  type Anniversary,
  type AppSettings,
  type CardState,
  type GiftSuggestion,
  type NotificationLog,
  type NotificationStatus,
  type OccasionType,
  type Person,
  type PersonReminderSettings,
  type Relation,
  type SentRecord,
  type SnapshotStatus,
  type Trait,
  AI_CONSENTS,
  CONTENT_KINDS,
  NOTIFICATION_STATUSES,
  OCCASION_TYPES,
  SNAPSHOT_STATUSES,
} from '../../entities';
import { fromJson } from './shared';

function narrow<T extends string>(allowed: readonly T[], value: string, column: string): T {
  if (!(allowed as readonly string[]).includes(value)) {
    throw new Error(`数据库列 ${column} 出现非法枚举值：${value}`);
  }
  return value as T;
}

const festivalOrNull = (value: string | null): FestivalCode | null =>
  value === null ? null : narrow(FESTIVAL_CODES, value, 'festival_code');

export interface PersonRow {
  id: string;
  name: string;
  relation: string;
  birthday_month: number;
  birthday_day: number;
  birth_year: number | null;
  salutation: string | null;
  signature: string | null;
  user_id: string | null;
  created_at: string;
  updated_at: string;
  deleted: number;
}

export function mapPerson(row: PersonRow): Person {
  return {
    id: row.id,
    name: row.name,
    relation: narrow(RELATIONS, row.relation, 'relation') as Relation,
    birthdayMonth: row.birthday_month,
    birthdayDay: row.birthday_day,
    birthYear: row.birth_year,
    salutation: row.salutation,
    signature: row.signature,
    userId: row.user_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deleted: row.deleted === 1,
  };
}

export interface AnniversaryRow {
  id: string;
  person_id: string;
  name: string;
  month: number;
  day: number;
  start_year: number | null;
  user_id: string | null;
  created_at: string;
  updated_at: string;
  deleted: number;
}

export function mapAnniversary(row: AnniversaryRow): Anniversary {
  return {
    id: row.id,
    personId: row.person_id,
    name: row.name,
    month: row.month,
    day: row.day,
    startYear: row.start_year,
    userId: row.user_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deleted: row.deleted === 1,
  };
}

export interface TraitRow {
  id: string;
  person_id: string;
  content: string;
  position: number;
  user_id: string | null;
  created_at: string;
  updated_at: string;
  deleted: number;
}

export function mapTrait(row: TraitRow): Trait {
  return {
    id: row.id,
    personId: row.person_id,
    content: row.content,
    position: row.position,
    userId: row.user_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deleted: row.deleted === 1,
  };
}

export interface AppSettingsRow {
  id: 1;
  global_advance_days: number;
  delivery_hour: number;
  blessing_count: number;
  ai_consent: string;
}

export function mapAppSettings(row: AppSettingsRow): AppSettings {
  return {
    id: 1,
    globalAdvanceDays: row.global_advance_days,
    deliveryHour: row.delivery_hour,
    blessingCount: row.blessing_count,
    aiConsent: narrow(AI_CONSENTS, row.ai_consent, 'ai_consent') as AiConsent,
  };
}

export interface PersonReminderRow {
  person_id: string;
  advance_days: number | null;
  disabled: number;
}

export function mapPersonReminder(row: PersonReminderRow): PersonReminderSettings {
  return {
    personId: row.person_id,
    advanceDays: row.advance_days,
    disabled: row.disabled === 1,
  };
}

export interface FestivalRow {
  festival_code: string;
  disabled: number;
}

export function mapFestival(row: FestivalRow): FestivalSetting {
  return {
    festivalCode: narrow(FESTIVAL_CODES, row.festival_code, 'festival_code'),
    disabled: row.disabled === 1,
  };
}

interface OccasionColumns {
  person_id: string | null;
  occasion_type: string;
  anniversary_id: string | null;
  festival_code: string | null;
  year: number;
}

export interface SnapshotRow extends OccasionColumns {
  id: string;
  blessings: string | null;
  gifts: string | null;
  status: string;
  fail_count: number;
  generated_at: string | null;
  user_id: string | null;
  created_at: string;
  updated_at: string;
  deleted: number;
}

export function mapSnapshot(row: SnapshotRow): ContentSnapshot {
  return {
    id: row.id,
    personId: row.person_id,
    occasionType: narrow(OCCASION_TYPES, row.occasion_type, 'occasion_type') as OccasionType,
    anniversaryId: row.anniversary_id,
    festivalCode: festivalOrNull(row.festival_code),
    year: row.year,
    blessings: fromJson<string[]>(row.blessings),
    gifts: fromJson<GiftSuggestion[]>(row.gifts),
    status: narrow(SNAPSHOT_STATUSES, row.status, 'status') as SnapshotStatus,
    failCount: row.fail_count,
    generatedAt: row.generated_at,
    userId: row.user_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deleted: row.deleted === 1,
  };
}

export interface CardStateRow extends OccasionColumns {
  id: string;
  template_code: string;
  selected_index: number;
  edited_text: string | null;
  user_id: string | null;
  created_at: string;
  updated_at: string;
  deleted: number;
}

export function mapCardState(row: CardStateRow): CardState {
  return {
    id: row.id,
    personId: row.person_id,
    occasionType: narrow(OCCASION_TYPES, row.occasion_type, 'occasion_type') as OccasionType,
    anniversaryId: row.anniversary_id,
    festivalCode: festivalOrNull(row.festival_code),
    year: row.year,
    templateCode: row.template_code,
    selectedIndex: row.selected_index,
    editedText: row.edited_text,
    userId: row.user_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deleted: row.deleted === 1,
  };
}

export interface FavoriteRow extends OccasionColumns {
  id: string;
  kind: string;
  person_label: string | null;
  occasion_name: string;
  payload: string;
  user_id: string | null;
  created_at: string;
  updated_at: string;
  deleted: number;
}

export function mapFavorite(row: FavoriteRow): Favorite {
  return {
    id: row.id,
    kind: narrow(CONTENT_KINDS, row.kind, 'kind') as ContentKind,
    personId: row.person_id,
    personLabel: row.person_label,
    occasionType: narrow(OCCASION_TYPES, row.occasion_type, 'occasion_type') as OccasionType,
    anniversaryId: row.anniversary_id,
    festivalCode: festivalOrNull(row.festival_code),
    occasionName: row.occasion_name,
    year: row.year,
    payload: fromJson<ContentPayload>(row.payload)!,
    userId: row.user_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deleted: row.deleted === 1,
  };
}

export interface SentRecordRow extends OccasionColumns {
  id: string;
  kind: string;
  payload: string;
  marked_at: string;
  user_id: string | null;
  created_at: string;
  updated_at: string;
  deleted: number;
}

export function mapSentRecord(row: SentRecordRow): SentRecord {
  return {
    id: row.id,
    personId: row.person_id!,
    occasionType: narrow(OCCASION_TYPES, row.occasion_type, 'occasion_type') as OccasionType,
    anniversaryId: row.anniversary_id,
    festivalCode: festivalOrNull(row.festival_code),
    year: row.year,
    kind: narrow(CONTENT_KINDS, row.kind, 'kind') as ContentKind,
    payload: fromJson<ContentPayload>(row.payload)!,
    markedAt: row.marked_at,
    userId: row.user_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deleted: row.deleted === 1,
  };
}

export interface NotificationLogRow extends OccasionColumns {
  id: string;
  scheduled_at: string;
  status: string;
  is_made_up: number;
  os_notification_id: string | null;
  delivered_at: string | null;
  created_at: string;
  updated_at: string;
}

export function mapNotificationLog(row: NotificationLogRow): NotificationLog {
  return {
    id: row.id,
    occasionType: narrow(OCCASION_TYPES, row.occasion_type, 'occasion_type') as OccasionType,
    personId: row.person_id,
    anniversaryId: row.anniversary_id,
    festivalCode: festivalOrNull(row.festival_code),
    year: row.year,
    scheduledAt: row.scheduled_at,
    status: narrow(NOTIFICATION_STATUSES, row.status, 'status') as NotificationStatus,
    isMadeUp: row.is_made_up === 1,
    osNotificationId: row.os_notification_id,
    deliveredAt: row.delivered_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
