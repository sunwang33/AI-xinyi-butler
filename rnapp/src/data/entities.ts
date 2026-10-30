/**
 * 实体类型与枚举（data-model.md 第 1、2、3 节的 TypeScript 投影）
 *
 * 约定：
 * - TS 侧一律 camelCase，SQLite 行内为 snake_case，由 repository/sqlite 的映射层互转；
 * - 布尔在库内为 0/1，时间戳为 ISO 8601 字符串（UTC），JSON 列存字符串；
 * - 枚举值与 data-model.md 1.3 节逐字一致，relation 原样存中文。
 */

// ---------- 枚举常量与类型（值与 data-model.md 1.3 节一致，禁止擅改） ----------

/** 与自己的关系（固定枚举，原样存中文） */
export const RELATIONS = ['家人', '挚友', '客户', '其他'] as const;
export type Relation = (typeof RELATIONS)[number];

/** 日子类型：生日 / 纪念日 / 节日 */
export const OCCASION_TYPES = ['birthday', 'anniversary', 'festival'] as const;
export type OccasionType = (typeof OCCASION_TYPES)[number];

/** 收藏与「已送出」的内容种类：祝福 / 礼物 / 贺卡 */
export const CONTENT_KINDS = ['blessing', 'gift', 'card'] as const;
export type ContentKind = (typeof CONTENT_KINDS)[number];

/** 心意快照生成状态：未生成 / 成功 / 失败 */
export const SNAPSHOT_STATUSES = ['pending', 'success', 'failed'] as const;
export type SnapshotStatus = (typeof SNAPSHOT_STATUSES)[number];

/** 通知日志状态：已调度 / 已送达 / 已补发 */
export const NOTIFICATION_STATUSES = ['scheduled', 'delivered', 'made_up'] as const;
export type NotificationStatus = (typeof NOTIFICATION_STATUSES)[number];

/** 首次 AI 生成告知选择：未表态 / 同意并生成 / 暂不同意 */
export const AI_CONSENTS = ['pending', 'agreed', 'declined'] as const;
export type AiConsent = (typeof AI_CONSENTS)[number];

/** 六个内置节日代号（data-model.md 1.3 节，App 初始化写六行开关） */
export const FESTIVAL_CODES = [
  'new_year',
  'valentines_day',
  'mothers_day',
  'fathers_day',
  'thanksgiving',
  'christmas',
] as const;
export type FestivalCode = (typeof FESTIVAL_CODES)[number];

// ---------- JSON 列结构（data-model.md 第 3 节，键名保持文档原样） ----------

/** 礼物建议（content_snapshots.gifts 的元素；字段细节随门禁 A1 定稿） */
export interface GiftSuggestion {
  /** 礼物名称或方向 */
  name: string;
  /** 为什么适合 TA（与该人特征或节日主题相关） */
  reason: string;
  /** 电商搜索词 */
  search_term: string;
}

/** 收藏/标记祝福时的快照载荷 */
export interface BlessingPayload {
  text: string;
}

/** 收藏/标记礼物时的快照载荷 */
export type GiftPayload = GiftSuggestion;

/** 收藏/标记贺卡时的快照载荷（贺卡图片本身不入库） */
export interface CardPayload {
  template_code: string;
  /** 渲染时称呼，未填则为姓名 */
  salutation: string;
  /** 导出时使用的祝福文字（含用户编辑结果） */
  text: string;
  /** 渲染时自称，未填为 null 且落款整块不显示 */
  signature: string | null;
  occasion_type: OccasionType;
  /** 生日 / 纪念日名 / 节日名 */
  occasion_name: string;
}

/** favorites.payload / sent_records.payload，按 kind 区分实际结构 */
export type ContentPayload = BlessingPayload | GiftPayload | CardPayload;

// ---------- 日子定位键（快照、贺卡状态、通知日志共用） ----------

/**
 * 「人 × 日子 × 年份」定位（通用节日 personId 为 null；
 * 非纪念日 anniversaryId 为 null；非节日 festivalCode 为 null）。
 */
export interface OccasionKey {
  occasionType: OccasionType;
  personId?: string | null;
  anniversaryId?: string | null;
  festivalCode?: FestivalCode | null;
  /** 设备本地年份 */
  year: number;
}

// ---------- 实体（与 11 张表一一对应） ----------

/** 人员档案（上云表，本机 user_id 恒为 null、deleted 恒为 0，物理删除） */
export interface Person {
  id: string;
  name: string;
  relation: Relation;
  /** 生日月（1–12）；2 月 29 日平年由日子引擎按 28 日处理，数据不改存 */
  birthdayMonth: number;
  birthdayDay: number;
  /** 出生年份，选填，仅用于内部理解，祝福/贺卡默认不出现具体岁数 */
  birthYear: number | null;
  /** 「你怎么称呼 TA」，贺卡抬头，未填用姓名 */
  salutation: string | null;
  /** 「你的自称」，祝福落款，未填则不落款 */
  signature: string | null;
  userId: string | null;
  createdAt: string;
  updatedAt: string;
  deleted: boolean;
}

export type PersonCreate = Omit<Person, 'id' | 'userId' | 'createdAt' | 'updatedAt' | 'deleted'>;
export type PersonUpdate = Partial<PersonCreate>;

/** 纪念日（一人多个） */
export interface Anniversary {
  id: string;
  personId: string;
  /** 名称可自定义，如「领证日」「乔迁」 */
  name: string;
  month: number;
  day: number;
  /** 起始年份，选填；填了才可出现具体周年数 */
  startYear: number | null;
  userId: string | null;
  createdAt: string;
  updatedAt: string;
  deleted: boolean;
}

export type AnniversaryCreate = Omit<
  Anniversary,
  'id' | 'userId' | 'createdAt' | 'updatedAt' | 'deleted'
>;
export type AnniversaryUpdate = Partial<Omit<AnniversaryCreate, 'personId'>>;

/** 特征描述（一人 0–5 条，单条不超过 30 字，由应用层强制） */
export interface Trait {
  id: string;
  personId: string;
  content: string;
  /** 顺序位，从 0 起 */
  position: number;
  userId: string | null;
  createdAt: string;
  updatedAt: string;
  deleted: boolean;
}

export type TraitCreate = Omit<Trait, 'id' | 'userId' | 'createdAt' | 'updatedAt' | 'deleted'>;
export type TraitUpdate = Partial<Omit<TraitCreate, 'personId'>>;

/** 应用设置（本机单行表，固定 id=1，不上云） */
export interface AppSettings {
  readonly id: 1;
  /** 全局默认提前天数，1–30，默认 3，不能为 0 */
  globalAdvanceDays: number;
  /** 提醒送达钟点，24 小时制整点（0–23），默认 9 */
  deliveryHour: number;
  /** 祝福条数，默认 3；改为 N 仅对新生成的快照生效 */
  blessingCount: number;
  aiConsent: AiConsent;
}

export type AppSettingsUpdate = Partial<
  Omit<AppSettings, 'id'>
>;

/** 某人的提醒覆盖（与人员一对一，仅本机） */
export interface PersonReminderSettings {
  personId: string;
  /** 覆盖天数 1–30；null 表示跟随全局默认 */
  advanceDays: number | null;
  /** 单独关闭某人提醒：只停推送，日子仍在首页等列表中 */
  disabled: boolean;
}

/** 内置节日关注状态（每节日一行，仅本机；F11，2026-10-30 仅语义变更无迁移） */
export interface FestivalSetting {
  festivalCode: FestivalCode;
  /** 关注/取关状态：false(0)=已关注（默认六个全部关注）；true(1)=已取关——
   * 取关后不推送、不在提醒页节日区显示、无入口进入节日心意；
   * 重新关注后恢复展示与当年推送；取关不溯及既往，历史 Tab 已收藏/已送出内容保留 */
  disabled: boolean;
}

/** 祝福与礼物的当年快照（粒度：人 × 日子 × 年份；通用节日 personId 为 null） */
export interface ContentSnapshot {
  id: string;
  personId: string | null;
  occasionType: OccasionType;
  anniversaryId: string | null;
  festivalCode: FestivalCode | null;
  year: number;
  /** 祝福完整文案数组；连续 3 次失败后存通用兜底文案；未生成时为 null */
  blessings: string[] | null;
  /** 礼物建议数组（不少于五个）；通用版节日保持 null */
  gifts: GiftSuggestion[] | null;
  status: SnapshotStatus;
  /** 连续生成失败次数，达到 3 次走兜底 */
  failCount: number;
  generatedAt: string | null;
  userId: string | null;
  createdAt: string;
  updatedAt: string;
  deleted: boolean;
}

/** upsertSnapshot 的入参：日子定位键 + 可选写入字段（未给的列保持库内现状） */
export type SnapshotUpsert = OccasionKey & {
  blessings?: string[] | null;
  gifts?: GiftSuggestion[] | null;
  status?: SnapshotStatus;
  failCount?: number;
  generatedAt?: string | null;
};

export type SnapshotPatch = Partial<
  Pick<
    ContentSnapshot,
    'blessings' | 'gifts' | 'status' | 'failCount' | 'generatedAt'
  >
>;

/** 贺卡组合状态（人 × 日子 × 年份；进详情自动组合写入，无单独生成按钮） */
export interface CardState {
  id: string;
  personId: string | null;
  occasionType: OccasionType;
  anniversaryId: string | null;
  festivalCode: FestivalCode | null;
  year: number;
  templateCode: string;
  /** 选中第几条祝福，默认 0 */
  selectedIndex: number;
  /** 用户编辑后的文字；null 表示使用选中祝福原文 */
  editedText: string | null;
  userId: string | null;
  createdAt: string;
  updatedAt: string;
  deleted: boolean;
}

export type CardStateUpsert = OccasionKey & {
  templateCode: string;
  selectedIndex?: number;
  editedText?: string | null;
};

/** 收藏夹条目（去重/排序/容量上限随 B 组门禁拍板，当前无唯一约束） */
export interface Favorite {
  id: string;
  kind: ContentKind;
  personId: string | null;
  /** 收藏时刻的对象显示快照，如「张伟（客户）」；通用版为「通用（未指定人）」 */
  personLabel: string | null;
  occasionType: OccasionType;
  anniversaryId: string | null;
  festivalCode: FestivalCode | null;
  /** 日子名称展示快照，如「生日」「领证日」「母亲节」 */
  occasionName: string;
  year: number;
  /** 收藏那一刻的完整快照，可离线查看 */
  payload: ContentPayload;
  userId: string | null;
  createdAt: string;
  updatedAt: string;
  deleted: boolean;
}

export type FavoriteCreate = Omit<
  Favorite,
  'id' | 'userId' | 'createdAt' | 'updatedAt' | 'deleted'
>;

/** 「今年已送出」/ 往年记录（按条目分别标记，允许只送一样；结构随门禁 A4 定稿） */
export interface SentRecord {
  id: string;
  /** 必填：通用版标记前必须先选人，记录归属所选的人 */
  personId: string;
  occasionType: OccasionType;
  anniversaryId: string | null;
  festivalCode: FestivalCode | null;
  year: number;
  kind: ContentKind;
  /** 标记那一刻的快照；当年快照之后被重新生成，本行仍完整保留 */
  payload: ContentPayload;
  markedAt: string;
  userId: string | null;
  createdAt: string;
  updatedAt: string;
  deleted: boolean;
}

export type SentRecordCreate = Omit<
  SentRecord,
  'id' | 'userId' | 'markedAt' | 'createdAt' | 'updatedAt' | 'deleted'
>;

/** 往年记录查询条件（不含 year：取同一人同一日子的全部年份） */
export type SentRecordQuery = Pick<
  SentRecord,
  'personId' | 'occasionType'
> & {
  anniversaryId?: string | null;
  festivalCode?: FestivalCode | null;
  kind?: ContentKind;
};

/** 提醒调度与去重运行数据（纯本机，不上云，同一「日子 × 年份」唯一） */
export interface NotificationLog {
  id: string;
  occasionType: OccasionType;
  personId: string | null;
  anniversaryId: string | null;
  festivalCode: FestivalCode | null;
  year: number;
  /** 计划送达时刻（本地）：日子前第 N 天的 delivery_hour 点 */
  scheduledAt: string;
  status: NotificationStatus;
  /** 因关机/离线错过后补发一次置 true */
  isMadeUp: boolean;
  /** 系统通知标识，用于取消/重排 */
  osNotificationId: string | null;
  deliveredAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export type NotificationLogCreate = OccasionKey & {
  /** 计划送达时刻（本地） */
  scheduledAt: string;
  status?: NotificationStatus;
  isMadeUp?: boolean;
  osNotificationId?: string | null;
};

export type NotificationLogPatch = Partial<
  Pick<
    NotificationLog,
    'scheduledAt' | 'status' | 'isMadeUp' | 'osNotificationId' | 'deliveredAt'
  >
>;
