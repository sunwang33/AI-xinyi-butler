/**
 * Repository 抽象层（决策 D2）：UI 与业务模块只依赖本文件的接口，
 * 不直接碰 SQLite。M2 提供 SQLite 实现；阶段 12 再提供同接口的
 * Supabase 实现并按登录态注入（data-model 7.4 节）。
 */
import type {
  Anniversary,
  AnniversaryCreate,
  AnniversaryUpdate,
  AppSettings,
  AppSettingsUpdate,
  CardState,
  CardStateUpsert,
  ContentSnapshot,
  ContentKind,
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
} from '../entities';

// ---------- T08：人员档案（含级联删除） ----------

export interface PersonRepository {
  createPerson(input: PersonCreate): Promise<Person>;
  getPerson(id: string): Promise<Person | null>;
  /** 全部未删除人员，按录入顺序返回 */
  listPersons(): Promise<Person[]>;
  updatePerson(id: string, patch: PersonUpdate): Promise<Person>;
  /**
   * 物理级联删除（spec 第 2 条）：一个事务内删除该人的档案、纪念日、特征、
   * 单人提醒设置、快照、贺卡状态、收藏、往年记录、通知日志；
   * 并经通知取消钩子（M5 注册）取消其待送达通知。
   */
  deletePerson(id: string): Promise<void>;

  createAnniversary(input: AnniversaryCreate): Promise<Anniversary>;
  listAnniversaries(personId: string): Promise<Anniversary[]>;
  updateAnniversary(id: string, patch: AnniversaryUpdate): Promise<Anniversary>;
  /** 删除纪念日，并清理其快照/贺卡状态/通知日志行（data-model 第 4 节） */
  deleteAnniversary(id: string): Promise<void>;

  createTrait(input: TraitCreate): Promise<Trait>;
  listTraits(personId: string): Promise<Trait[]>;
  updateTrait(id: string, patch: TraitUpdate): Promise<Trait>;
  deleteTrait(id: string): Promise<void>;
}

// ---------- T09：设置 ----------

export interface SettingsRepository {
  /** 读取设置单行（迁移已保证 id=1 存在） */
  getSettings(): Promise<AppSettings>;
  updateSettings(patch: AppSettingsUpdate): Promise<AppSettings>;

  /** 读取某人的提醒覆盖；从未设置过时返回 null（调用方按全局默认处理） */
  getPersonReminder(personId: string): Promise<PersonReminderSettings | null>;
  /** 一人一行 upsert：覆盖天数（null 跟随全局）与单人开关 */
  upsertPersonReminder(
    personId: string,
    patch: Partial<Pick<PersonReminderSettings, 'advanceDays' | 'disabled'>>,
  ): Promise<PersonReminderSettings>;

  /** 六个节日开关，按 data-model 1.3 节的节日顺序返回 */
  listFestivalSettings(): Promise<FestivalSetting[]>;
  setFestivalDisabled(festivalCode: FestivalCode, disabled: boolean): Promise<FestivalSetting>;
}

// ---------- T10：内容与运行数据 ----------

export interface ContentRepository {
  // 心意快照：按「人 × 日子 × 年份」唯一
  getSnapshot(key: OccasionKey): Promise<ContentSnapshot | null>;
  /** 按唯一键存在则更新给定字段、否则插入（新行默认 pending） */
  upsertSnapshot(input: SnapshotUpsert): Promise<ContentSnapshot>;
  updateSnapshot(id: string, patch: SnapshotPatch): Promise<ContentSnapshot>;

  // 贺卡组合状态：同一业务键
  getCardState(key: OccasionKey): Promise<CardState | null>;
  upsertCardState(input: CardStateUpsert): Promise<CardState>;

  // 收藏夹（去重/排序规则随 B 组门禁，当前 add 不去重、list 按收藏时间倒序）
  addFavorite(input: FavoriteCreate): Promise<Favorite>;
  getFavorite(id: string): Promise<Favorite | null>;
  removeFavorite(id: string): Promise<void>;
  listFavorites(filter?: { kind?: ContentKind }): Promise<Favorite[]>;

  // 「今年已送出」/ 往年记录
  /** 按（人 × 日子 × 年份 × kind）upsert：存在则更新载荷与标记时间 */
  markSent(input: SentRecordCreate): Promise<SentRecord>;
  unmarkSent(id: string): Promise<void>;
  getSentRecord(id: string): Promise<SentRecord | null>;
  /** 同一人同一日子的全部记录，按年份与标记时间倒序 */
  listSentRecords(query: SentRecordQuery): Promise<SentRecord[]>;

  // 通知日志：登记、去重查询、状态流转
  insertNotificationLog(input: NotificationLogCreate): Promise<NotificationLog>;
  /** 按「日子 × 年份」读取（同年去重依据） */
  getNotificationLog(key: OccasionKey): Promise<NotificationLog | null>;
  listNotificationLogs(filter?: {
    status?: NotificationStatus | readonly NotificationStatus[];
  }): Promise<NotificationLog[]>;
  updateNotificationLog(id: string, patch: NotificationLogPatch): Promise<NotificationLog>;
  deleteNotificationLog(id: string): Promise<void>;
}

/** 聚合接口：SQLite 与（阶段 12 的）Supabase 两套实现共同遵守 */
export interface DataRepository extends PersonRepository, SettingsRepository, ContentRepository {}
