import type { SQLiteDatabase } from 'expo-sqlite';
import type {
  Anniversary,
  AnniversaryCreate,
  AnniversaryUpdate,
  AppSettings,
  AppSettingsUpdate,
  CardState,
  CardStateUpsert,
  ContentKind,
  ContentSnapshot,
  Favorite,
  FavoriteCreate,
  FestivalCode,
  FestivalSetting,
  NotificationLog,
  NotificationLogCreate,
  NotificationLogPatch,
  NotificationStatus,
  OccasionKey,
  Person,
  PersonCreate,
  PersonReminderSettings,
  PersonUpdate,
  SentRecord,
  SentRecordCreate,
  SentRecordQuery,
  SnapshotPatch,
  SnapshotUpsert,
  Trait,
  TraitCreate,
  TraitUpdate,
} from '../../entities';
import type { DataRepository } from '../types';
import { getNotificationCanceller } from '../notificationCanceller';
import { SqlitePersonRepository } from './SqlitePersonRepository';
import { SqliteSettingsRepository } from './SqliteSettingsRepository';
import { SqliteContentRepository } from './SqliteContentRepository';

/**
 * DataRepository 的 SQLite 实现：组合三个领域仓储并逐方法转发，
 * deletePerson 在此跨全部子表做事务级联（spec 第 2 条、T08）。
 * 用普通方法而非类字段，既无字段初始化顺序问题，也兼容 Expo 的 Babel 配置。
 */
export class SqliteRepository implements DataRepository {
  private readonly db: SQLiteDatabase;
  private readonly persons: SqlitePersonRepository;
  private readonly settings: SqliteSettingsRepository;
  private readonly content: SqliteContentRepository;

  constructor(db: SQLiteDatabase) {
    this.db = db;
    this.persons = new SqlitePersonRepository(db);
    this.settings = new SqliteSettingsRepository(db);
    this.content = new SqliteContentRepository(db);
  }

  // ---------- 人员（T08） ----------

  createPerson(input: PersonCreate): Promise<Person> {
    return this.persons.createPerson(input);
  }

  getPerson(id: string): Promise<Person | null> {
    return this.persons.getPerson(id);
  }

  listPersons(): Promise<Person[]> {
    return this.persons.listPersons();
  }

  updatePerson(id: string, patch: PersonUpdate): Promise<Person> {
    return this.persons.updatePerson(id, patch);
  }

  async deletePerson(id: string): Promise<void> {
    const { db } = this;
    // 先取待取消的系统通知标识（仅 scheduled 行），随后事务内物理删除全部关联数据
    const pending = await db.getAllAsync<{ os_notification_id: string | null }>(
      `SELECT os_notification_id FROM notification_log
       WHERE person_id = ? AND status = 'scheduled'`,
      id,
    );

    await db.withTransactionAsync(async () => {
      // 子表先删，最后删 persons 主行（外键 ON DELETE CASCADE 同时兜底）
      await db.runAsync('DELETE FROM notification_log WHERE person_id = ?', id);
      await db.runAsync('DELETE FROM sent_records WHERE person_id = ?', id);
      await db.runAsync('DELETE FROM favorites WHERE person_id = ?', id);
      await db.runAsync('DELETE FROM card_states WHERE person_id = ?', id);
      await db.runAsync('DELETE FROM content_snapshots WHERE person_id = ?', id);
      await db.runAsync('DELETE FROM person_reminder_settings WHERE person_id = ?', id);
      await db.runAsync('DELETE FROM traits WHERE person_id = ?', id);
      await db.runAsync('DELETE FROM anniversaries WHERE person_id = ?', id);
      await db.runAsync('DELETE FROM persons WHERE id = ?', id);
    });

    // M5 接入点：取消该人待送达通知；M2 钩子为空操作，不影响删除
    const osIds = pending
      .map((row) => row.os_notification_id)
      .filter((value): value is string => Boolean(value));
    if (osIds.length > 0) {
      await getNotificationCanceller()(osIds);
    }
  }

  createAnniversary(input: AnniversaryCreate): Promise<Anniversary> {
    return this.persons.createAnniversary(input);
  }

  listAnniversaries(personId: string): Promise<Anniversary[]> {
    return this.persons.listAnniversaries(personId);
  }

  updateAnniversary(id: string, patch: AnniversaryUpdate): Promise<Anniversary> {
    return this.persons.updateAnniversary(id, patch);
  }

  deleteAnniversary(id: string): Promise<void> {
    return this.persons.deleteAnniversary(id);
  }

  createTrait(input: TraitCreate): Promise<Trait> {
    return this.persons.createTrait(input);
  }

  listTraits(personId: string): Promise<Trait[]> {
    return this.persons.listTraits(personId);
  }

  updateTrait(id: string, patch: TraitUpdate): Promise<Trait> {
    return this.persons.updateTrait(id, patch);
  }

  deleteTrait(id: string): Promise<void> {
    return this.persons.deleteTrait(id);
  }

  // ---------- 设置（T09） ----------

  getSettings(): Promise<AppSettings> {
    return this.settings.getSettings();
  }

  updateSettings(patch: AppSettingsUpdate): Promise<AppSettings> {
    return this.settings.updateSettings(patch);
  }

  getPersonReminder(personId: string): Promise<PersonReminderSettings | null> {
    return this.settings.getPersonReminder(personId);
  }

  upsertPersonReminder(
    personId: string,
    patch: Partial<Pick<PersonReminderSettings, 'advanceDays' | 'disabled'>>,
  ): Promise<PersonReminderSettings> {
    return this.settings.upsertPersonReminder(personId, patch);
  }

  listFestivalSettings(): Promise<FestivalSetting[]> {
    return this.settings.listFestivalSettings();
  }

  setFestivalDisabled(festivalCode: FestivalCode, disabled: boolean): Promise<FestivalSetting> {
    return this.settings.setFestivalDisabled(festivalCode, disabled);
  }

  // ---------- 内容与运行数据（T10） ----------

  getSnapshot(key: OccasionKey): Promise<ContentSnapshot | null> {
    return this.content.getSnapshot(key);
  }

  upsertSnapshot(input: SnapshotUpsert): Promise<ContentSnapshot> {
    return this.content.upsertSnapshot(input);
  }

  updateSnapshot(id: string, patch: SnapshotPatch): Promise<ContentSnapshot> {
    return this.content.updateSnapshot(id, patch);
  }

  getCardState(key: OccasionKey): Promise<CardState | null> {
    return this.content.getCardState(key);
  }

  upsertCardState(input: CardStateUpsert): Promise<CardState> {
    return this.content.upsertCardState(input);
  }

  addFavorite(input: FavoriteCreate): Promise<Favorite> {
    return this.content.addFavorite(input);
  }

  getFavorite(id: string): Promise<Favorite | null> {
    return this.content.getFavorite(id);
  }

  removeFavorite(id: string): Promise<void> {
    return this.content.removeFavorite(id);
  }

  listFavorites(filter?: { kind?: ContentKind }): Promise<Favorite[]> {
    return this.content.listFavorites(filter);
  }

  markSent(input: SentRecordCreate): Promise<SentRecord> {
    return this.content.markSent(input);
  }

  unmarkSent(id: string): Promise<void> {
    return this.content.unmarkSent(id);
  }

  getSentRecord(id: string): Promise<SentRecord | null> {
    return this.content.getSentRecord(id);
  }

  listSentRecords(query: SentRecordQuery): Promise<SentRecord[]> {
    return this.content.listSentRecords(query);
  }

  insertNotificationLog(input: NotificationLogCreate): Promise<NotificationLog> {
    return this.content.insertNotificationLog(input);
  }

  getNotificationLog(key: OccasionKey): Promise<NotificationLog | null> {
    return this.content.getNotificationLog(key);
  }

  listNotificationLogs(filter?: {
    status?: NotificationStatus | readonly NotificationStatus[];
  }): Promise<NotificationLog[]> {
    return this.content.listNotificationLogs(filter);
  }

  updateNotificationLog(id: string, patch: NotificationLogPatch): Promise<NotificationLog> {
    return this.content.updateNotificationLog(id, patch);
  }

  deleteNotificationLog(id: string): Promise<void> {
    return this.content.deleteNotificationLog(id);
  }
}
