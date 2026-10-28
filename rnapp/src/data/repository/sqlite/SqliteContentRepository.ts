import type { SQLiteBindValue, SQLiteDatabase } from 'expo-sqlite';
import type {
  CardState,
  CardStateUpsert,
  ContentKind,
  ContentSnapshot,
  Favorite,
  FavoriteCreate,
  NotificationLog,
  NotificationLogCreate,
  NotificationLogPatch,
  NotificationStatus,
  OccasionKey,
  SentRecord,
  SentRecordCreate,
  SentRecordQuery,
  SnapshotPatch,
  SnapshotUpsert,
} from '../../entities';
import type { ContentRepository } from '../types';
import { buildSet, now, occasionMatcher, toInt, toJson, uuid } from './shared';
import {
  mapCardState,
  mapFavorite,
  mapNotificationLog,
  mapSentRecord,
  mapSnapshot,
  type CardStateRow,
  type FavoriteRow,
  type NotificationLogRow,
  type SentRecordRow,
  type SnapshotRow,
} from './rows';

/**
 * T10：content_snapshots、card_states、favorites、sent_records、notification_log。
 *
 * 说明：COALESCE 表达式唯一索引不能作为 SQLite ON CONFLICT 目标，
 * 故 upsert 一律「事务内先按业务键 SELECT，再 UPDATE / INSERT」。
 */
export class SqliteContentRepository implements ContentRepository {
  constructor(private readonly db: SQLiteDatabase) {}

  // ---------- 心意快照 ----------

  async getSnapshot(key: OccasionKey): Promise<ContentSnapshot | null> {
    const match = occasionMatcher(key, { withUser: true });
    const row = await this.db.getFirstAsync<SnapshotRow>(
      `SELECT * FROM content_snapshots WHERE ${match.sql} AND deleted = 0 LIMIT 1`,
      ...match.params,
    );
    return row ? mapSnapshot(row) : null;
  }

  async upsertSnapshot(input: SnapshotUpsert): Promise<ContentSnapshot> {
    const key: OccasionKey = {
      occasionType: input.occasionType,
      personId: input.personId,
      anniversaryId: input.anniversaryId,
      festivalCode: input.festivalCode,
      year: input.year,
    };
    const match = occasionMatcher(key, { withUser: true });

    await this.db.withTransactionAsync(async () => {
      const existing = await this.db.getFirstAsync<Pick<SnapshotRow, 'id'>>(
        `SELECT id FROM content_snapshots WHERE ${match.sql} LIMIT 1`,
        ...match.params,
      );

      if (existing) {
        const values: Record<string, SQLiteBindValue> = {};
        if (input.blessings !== undefined) values.blessings = toJson(input.blessings);
        if (input.gifts !== undefined) values.gifts = toJson(input.gifts);
        if (input.status !== undefined) values.status = input.status;
        if (input.failCount !== undefined) values.fail_count = input.failCount;
        if (input.generatedAt !== undefined) values.generated_at = input.generatedAt;
        values.updated_at = now();
        const { clause, params } = buildSet(values);
        await this.db.runAsync(
          `UPDATE content_snapshots SET ${clause} WHERE id = ?`,
          ...params,
          existing.id,
        );
      } else {
        const ts = now();
        await this.db.runAsync(
          `INSERT INTO content_snapshots
             (id, person_id, occasion_type, anniversary_id, festival_code, year,
              blessings, gifts, status, fail_count, generated_at,
              user_id, created_at, updated_at, deleted)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, 0)`,
          uuid(),
          key.personId ?? null,
          key.occasionType,
          key.anniversaryId ?? null,
          key.festivalCode ?? null,
          key.year,
          input.blessings === undefined ? null : toJson(input.blessings),
          input.gifts === undefined ? null : toJson(input.gifts),
          input.status ?? 'pending',
          input.failCount ?? 0,
          input.generatedAt ?? null,
          ts,
          ts,
        );
      }
    });

    return (await this.getSnapshot(key))!;
  }

  async updateSnapshot(id: string, patch: SnapshotPatch): Promise<ContentSnapshot> {
    const values: Record<string, SQLiteBindValue> = {};
    if (patch.blessings !== undefined) values.blessings = toJson(patch.blessings);
    if (patch.gifts !== undefined) values.gifts = toJson(patch.gifts);
    if (patch.status !== undefined) values.status = patch.status;
    if (patch.failCount !== undefined) values.fail_count = patch.failCount;
    if (patch.generatedAt !== undefined) values.generated_at = patch.generatedAt;
    values.updated_at = now();
    const { clause, params } = buildSet(values);
    await this.db.runAsync(
      `UPDATE content_snapshots SET ${clause} WHERE id = ? AND deleted = 0`,
      ...params,
      id,
    );
    const row = await this.db.getFirstAsync<SnapshotRow>(
      'SELECT * FROM content_snapshots WHERE id = ?',
      id,
    );
    if (!row) {
      throw new Error(`快照不存在：${id}`);
    }
    return mapSnapshot(row);
  }

  // ---------- 贺卡组合状态 ----------

  async getCardState(key: OccasionKey): Promise<CardState | null> {
    const match = occasionMatcher(key, { withUser: true });
    const row = await this.db.getFirstAsync<CardStateRow>(
      `SELECT * FROM card_states WHERE ${match.sql} AND deleted = 0 LIMIT 1`,
      ...match.params,
    );
    return row ? mapCardState(row) : null;
  }

  async upsertCardState(input: CardStateUpsert): Promise<CardState> {
    const key: OccasionKey = {
      occasionType: input.occasionType,
      personId: input.personId,
      anniversaryId: input.anniversaryId,
      festivalCode: input.festivalCode,
      year: input.year,
    };
    const match = occasionMatcher(key, { withUser: true });

    await this.db.withTransactionAsync(async () => {
      const existing = await this.db.getFirstAsync<Pick<CardStateRow, 'id'>>(
        `SELECT id FROM card_states WHERE ${match.sql} LIMIT 1`,
        ...match.params,
      );
      if (existing) {
        const values: Record<string, SQLiteBindValue> = { updated_at: now() };
        if (input.templateCode !== undefined) values.template_code = input.templateCode;
        if (input.selectedIndex !== undefined) values.selected_index = input.selectedIndex;
        if (input.editedText !== undefined) values.edited_text = input.editedText;
        const { clause, params } = buildSet(values);
        await this.db.runAsync(`UPDATE card_states SET ${clause} WHERE id = ?`, ...params, existing.id);
      } else {
        const ts = now();
        await this.db.runAsync(
          `INSERT INTO card_states
             (id, person_id, occasion_type, anniversary_id, festival_code, year,
              template_code, selected_index, edited_text, user_id, created_at, updated_at, deleted)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, 0)`,
          uuid(),
          key.personId ?? null,
          key.occasionType,
          key.anniversaryId ?? null,
          key.festivalCode ?? null,
          key.year,
          input.templateCode,
          input.selectedIndex ?? 0,
          input.editedText ?? null,
          ts,
          ts,
        );
      }
    });

    return (await this.getCardState(key))!;
  }

  // ---------- 收藏夹 ----------

  async addFavorite(input: FavoriteCreate): Promise<Favorite> {
    const id = uuid();
    const ts = now();
    await this.db.runAsync(
      `INSERT INTO favorites
         (id, kind, person_id, person_label, occasion_type, anniversary_id, festival_code,
          occasion_name, year, payload, user_id, created_at, updated_at, deleted)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, 0)`,
      id,
      input.kind,
      input.personId,
      input.personLabel,
      input.occasionType,
      input.anniversaryId,
      input.festivalCode,
      input.occasionName,
      input.year,
      toJson(input.payload),
      ts,
      ts,
    );
    const row = await this.db.getFirstAsync<FavoriteRow>('SELECT * FROM favorites WHERE id = ?', id);
    return mapFavorite(row!);
  }

  async getFavorite(id: string): Promise<Favorite | null> {
    const row = await this.db.getFirstAsync<FavoriteRow>(
      'SELECT * FROM favorites WHERE id = ? AND deleted = 0',
      id,
    );
    return row ? mapFavorite(row) : null;
  }

  async removeFavorite(id: string): Promise<void> {
    // data-model：取消收藏只删收藏行，不影响心意详情中的原内容
    await this.db.runAsync('DELETE FROM favorites WHERE id = ?', id);
  }

  async listFavorites(filter?: { kind?: ContentKind }): Promise<Favorite[]> {
    if (filter?.kind) {
      const rows = await this.db.getAllAsync<FavoriteRow>(
        `SELECT * FROM favorites WHERE deleted = 0 AND kind = ?
         ORDER BY created_at DESC, id DESC`,
        filter.kind,
      );
      return rows.map(mapFavorite);
    }
    const rows = await this.db.getAllAsync<FavoriteRow>(
      'SELECT * FROM favorites WHERE deleted = 0 ORDER BY created_at DESC, id DESC',
    );
    return rows.map(mapFavorite);
  }

  // ---------- 「今年已送出」/ 往年记录 ----------

  async markSent(input: SentRecordCreate): Promise<SentRecord> {
    const ts = now();
    // 业务键：人 × 日子 × 年份 × kind（与 ux_sent_record 对应）
    const match = occasionMatcher({
      occasionType: input.occasionType,
      personId: input.personId,
      anniversaryId: input.anniversaryId,
      festivalCode: input.festivalCode,
      year: input.year,
    });

    await this.db.withTransactionAsync(async () => {
      const existing = await this.db.getFirstAsync<Pick<SentRecordRow, 'id'>>(
        `SELECT id FROM sent_records
         WHERE ${match.sql} AND kind = ? AND deleted = 0 LIMIT 1`,
        ...match.params,
        input.kind,
      );
      if (existing) {
        // 更改：更新载荷与标记时间
        await this.db.runAsync(
          'UPDATE sent_records SET payload = ?, marked_at = ?, updated_at = ? WHERE id = ?',
          toJson(input.payload),
          ts,
          ts,
          existing.id,
        );
      } else {
        await this.db.runAsync(
          `INSERT INTO sent_records
             (id, person_id, occasion_type, anniversary_id, festival_code, year, kind,
              payload, marked_at, user_id, created_at, updated_at, deleted)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, 0)`,
          uuid(),
          input.personId,
          input.occasionType,
          input.anniversaryId,
          input.festivalCode,
          input.year,
          input.kind,
          toJson(input.payload),
          ts,
          ts,
          ts,
        );
      }
    });

    const row = await this.db.getFirstAsync<SentRecordRow>(
      `SELECT * FROM sent_records
       WHERE ${match.sql} AND kind = ? AND deleted = 0
       ORDER BY marked_at DESC LIMIT 1`,
      ...match.params,
      input.kind,
    );
    return mapSentRecord(row!);
  }

  async unmarkSent(id: string): Promise<void> {
    // data-model：撤销即删除本行
    await this.db.runAsync('DELETE FROM sent_records WHERE id = ?', id);
  }

  async getSentRecord(id: string): Promise<SentRecord | null> {
    const row = await this.db.getFirstAsync<SentRecordRow>(
      'SELECT * FROM sent_records WHERE id = ? AND deleted = 0',
      id,
    );
    return row ? mapSentRecord(row) : null;
  }

  async listSentRecords(query: SentRecordQuery): Promise<SentRecord[]> {
    const rows = await this.db.getAllAsync<SentRecordRow>(
      `SELECT * FROM sent_records
       WHERE deleted = 0
         AND person_id = ?
         AND occasion_type = ?
         AND anniversary_id IS ?
         AND festival_code IS ?
         ${query.kind ? 'AND kind = ?' : ''}
       ORDER BY year DESC, marked_at DESC`,
      query.personId,
      query.occasionType,
      query.anniversaryId ?? null,
      query.festivalCode ?? null,
      ...(query.kind ? [query.kind] : []),
    );
    return rows.map(mapSentRecord);
  }

  // ---------- 通知日志 ----------

  async insertNotificationLog(input: NotificationLogCreate): Promise<NotificationLog> {
    const id = uuid();
    const ts = now();
    await this.db.runAsync(
      `INSERT INTO notification_log
         (id, occasion_type, person_id, anniversary_id, festival_code, year,
          scheduled_at, status, is_made_up, os_notification_id, delivered_at,
          created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      id,
      input.occasionType,
      input.personId ?? null,
      input.anniversaryId ?? null,
      input.festivalCode ?? null,
      input.year,
      input.scheduledAt,
      input.status ?? 'scheduled',
      toInt(input.isMadeUp ?? false),
      input.osNotificationId ?? null,
      null,
      ts,
      ts,
    );
    const row = await this.db.getFirstAsync<NotificationLogRow>(
      'SELECT * FROM notification_log WHERE id = ?',
      id,
    );
    return mapNotificationLog(row!);
  }

  async getNotificationLog(key: OccasionKey): Promise<NotificationLog | null> {
    const match = occasionMatcher(key);
    const row = await this.db.getFirstAsync<NotificationLogRow>(
      `SELECT * FROM notification_log WHERE ${match.sql} LIMIT 1`,
      ...match.params,
    );
    return row ? mapNotificationLog(row) : null;
  }

  async listNotificationLogs(filter?: {
    status?: NotificationStatus | readonly NotificationStatus[];
  }): Promise<NotificationLog[]> {
    const statuses = filter?.status === undefined
      ? null
      : Array.isArray(filter.status)
        ? filter.status
        : [filter.status];

    if (statuses && statuses.length > 0) {
      const placeholders = statuses.map(() => '?').join(', ');
      const rows = await this.db.getAllAsync<NotificationLogRow>(
        `SELECT * FROM notification_log WHERE status IN (${placeholders})
         ORDER BY scheduled_at ASC, id ASC`,
        ...statuses,
      );
      return rows.map(mapNotificationLog);
    }
    const rows = await this.db.getAllAsync<NotificationLogRow>(
      'SELECT * FROM notification_log ORDER BY scheduled_at ASC, id ASC',
    );
    return rows.map(mapNotificationLog);
  }

  async updateNotificationLog(
    id: string,
    patch: NotificationLogPatch,
  ): Promise<NotificationLog> {
    const values: Record<string, SQLiteBindValue> = {};
    if (patch.scheduledAt !== undefined) values.scheduled_at = patch.scheduledAt;
    if (patch.status !== undefined) values.status = patch.status;
    if (patch.isMadeUp !== undefined) values.is_made_up = toInt(patch.isMadeUp);
    if (patch.osNotificationId !== undefined) values.os_notification_id = patch.osNotificationId;
    if (patch.deliveredAt !== undefined) values.delivered_at = patch.deliveredAt;
    values.updated_at = now();
    const { clause, params } = buildSet(values);
    await this.db.runAsync(`UPDATE notification_log SET ${clause} WHERE id = ?`, ...params, id);
    const row = await this.db.getFirstAsync<NotificationLogRow>(
      'SELECT * FROM notification_log WHERE id = ?',
      id,
    );
    if (!row) {
      throw new Error(`通知日志不存在：${id}`);
    }
    return mapNotificationLog(row);
  }

  async deleteNotificationLog(id: string): Promise<void> {
    await this.db.runAsync('DELETE FROM notification_log WHERE id = ?', id);
  }
}
