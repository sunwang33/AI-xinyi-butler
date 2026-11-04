/**
 * DataRepository 的 Supabase 实现（M12 T56，G-A6 口径）。
 *
 * 读写策略（data-model 7.4）：
 * - 读：一律走本机同结构缓存表（委托 inner SqliteRepository），离线天然可读；
 * - 写：write-through「先云端成功，再回写本机缓存」，云端 updated_at 由触发器以
 *   服务器时钟刷新，以回传行为准；云端失败则本机不动（缓存仍保持写前状态）；
 * - 删：云端一律软删（deleted=true），对端经水位同步拉到后物理删本机行；
 *   本机为让 UI 立即生效，直接复用 SqliteRepository 的物理级联（含仅本机表与
 *   通知取消钩子）。PostgREST 无跨表事务，删人逐表 await，部分失败靠下次同步补偿；
 * - 四张仅本机表（app_settings / person_reminder_settings / festival_settings /
 *   notification_log）永远委托 inner，不上云；
 * - 离线（T78 的 NetInfo 判定 type==='none'）时写操作直接抛中文错，不做本地写队列。
 *
 * 业务唯一索引是 COALESCE 表达式，不能作 on_conflict 目标，故 snapshot/cardState/
 * markSent 的云端 upsert 都是「先按业务键 SELECT（含已软删行），再 PATCH/INSERT」；
 * 命中 deleted=true 行时随 PATCH 复活（deleted=false），因为唯一索引不含 deleted。
 */
import type { SQLiteDatabase } from 'expo-sqlite';
import type { PostgrestError } from '@supabase/supabase-js';
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
  SentTimelineRow,
  SnapshotPatch,
  SnapshotUpsert,
  Trait,
  TraitCreate,
  TraitUpdate,
} from '../../entities';
import type { DataRepository } from '../types';
import type { CloudTableName } from '../../../lib/syncMerge';
import { supabase } from '../../../lib/supabase';
import { useNetworkStore } from '../../../lib/network';
import { now, uuid } from '../sqlite/shared';
import { mapAnniversary, mapTrait, type AnniversaryRow, type TraitRow } from '../sqlite/rows';
import { upsertCacheRows } from './localCache';
import { applyOccasionFilters } from './occasionQuery';
import { translateCloudError } from './cloudError';
import {
  anniversaryToCloud,
  cardStateToCloud,
  cloudAnniversaryToEntity,
  cloudCardStateToEntity,
  cloudFavoriteToEntity,
  cloudPersonToEntity,
  cloudSentRecordToEntity,
  cloudSnapshotToEntity,
  cloudTraitToEntity,
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
  type CloudAnniversaryRow,
  type CloudCardStateRow,
  type CloudFavoriteRow,
  type CloudPersonRow,
  type CloudSentRecordRow,
  type CloudSnapshotRow,
  type CloudTraitRow,
} from './cloudRows';

/**
 * 写后钩子：波 3 的 sync 编排注册为「防抖触发增量拉取」（多端并发收敛）。
 * 钩子异常绝不影响写操作本身的结果。
 */
let postWriteHook: (() => void) | null = null;
export function setSupabasePostWriteHook(hook: (() => void) | null): void {
  postWriteHook = hook;
}

export class SupabaseRepository implements DataRepository {
  constructor(
    private readonly db: SQLiteDatabase,
    /** 本机仓储：承担全部读（缓存表）、仅本机表读写、删除时的物理级联与通知钩子 */
    private readonly inner: DataRepository,
    private readonly userId: string,
  ) {}

  // ---------- 基础设施 ----------

  /** G-A6：离线只读，写入口在仓储层统一拦截 */
  private assertOnline(): void {
    if (!useNetworkStore.getState().online) {
      throw new Error('当前无网络连接，已进入离线只读模式：本机数据可正常查看，改动请联网后再进行');
    }
  }

  /** 取回「必须非空」的回传行；0 行 / 出错统一转中文异常 */
  private unwrap<T>(
    result: { data: T | null; error: PostgrestError | null },
    fallback: string,
  ): T {
    if (result.error) throw translateCloudError(result.error, fallback);
    if (result.data === null || result.data === undefined) {
      throw new Error('目标数据不存在或已被删除');
    }
    return result.data;
  }

  /** 云端按单列等值软删（deleted=true，触发器刷 updated_at 以便水位传播） */
  private async softDelete(table: CloudTableName, column: string, value: string): Promise<void> {
    const { error } = await supabase.from(table).update({ deleted: true }).eq(column, value);
    if (error) throw translateCloudError(error, '云端删除失败');
  }

  /** 云端按单列 IN 批量软删（删人时清理其纪念日名下的快照/贺卡/收藏/记录） */
  private async softDeleteIn(
    table: CloudTableName,
    column: string,
    values: readonly string[],
  ): Promise<void> {
    if (values.length === 0) return;
    const { error } = await supabase.from(table).update({ deleted: true }).in(column, values);
    if (error) throw translateCloudError(error, '云端删除失败');
  }

  private afterWrite(): void {
    try {
      postWriteHook?.();
    } catch {
      // 同步触发失败不影响已成功的写操作
    }
  }

  /** 从本机缓存表按主键读本账号未删的纪念日行（空变更等不打扰云端的场景使用） */
  private async getCachedAnniversaryOrThrow(id: string): Promise<Anniversary> {
    const row = await this.db.getFirstAsync<AnniversaryRow>(
      'SELECT * FROM anniversaries WHERE id = ? AND deleted = 0 AND user_id = ?',
      id,
      this.userId,
    );
    if (!row) throw new Error(`纪念日不存在或已删除：${id}`);
    return mapAnniversary(row);
  }

  /** 从本机缓存表按主键读本账号未删的特征行 */
  private async getCachedTraitOrThrow(id: string): Promise<Trait> {
    const row = await this.db.getFirstAsync<TraitRow>(
      'SELECT * FROM traits WHERE id = ? AND deleted = 0 AND user_id = ?',
      id,
      this.userId,
    );
    if (!row) throw new Error(`特征不存在或已删除：${id}`);
    return mapTrait(row);
  }

  // ---------- 人员（T08） ----------

  async createPerson(input: PersonCreate): Promise<Person> {
    this.assertOnline();
    const ts = now();
    const id = uuid();
    const payload = {
      ...personToCloud(
        // 先按本机实体形状组装（id/时间戳/未删），复用唯一的列名事实源
        {
          id,
          name: input.name,
          relation: input.relation,
          birthdayMonth: input.birthdayMonth,
          birthdayDay: input.birthdayDay,
          birthYear: input.birthYear,
          salutation: input.salutation,
          signature: input.signature,
          userId: this.userId,
          createdAt: ts,
          updatedAt: ts,
          deleted: false,
        },
        this.userId,
      ),
    };
    const result = await supabase.from('persons').insert(payload).select().single();
    const row = this.unwrap(result, '人员创建失败') as CloudPersonRow;
    await upsertCacheRows(this.db, 'persons', [normalizePersonRow(row)]);
    this.afterWrite();
    return cloudPersonToEntity(row);
  }

  getPerson(id: string): Promise<Person | null> {
    return this.inner.getPerson(id);
  }

  listPersons(): Promise<Person[]> {
    return this.inner.listPersons();
  }

  async updatePerson(id: string, patch: PersonUpdate): Promise<Person> {
    this.assertOnline();
    const payload: Record<string, unknown> = {};
    if (patch.name !== undefined) payload.name = patch.name;
    if (patch.relation !== undefined) payload.relation = patch.relation;
    if (patch.birthdayMonth !== undefined) payload.birthday_month = patch.birthdayMonth;
    if (patch.birthdayDay !== undefined) payload.birthday_day = patch.birthdayDay;
    // birthYear / salutation / signature 的 null 是有效值，只能按 !== undefined 挑列
    if (patch.birthYear !== undefined) payload.birth_year = patch.birthYear;
    if (patch.salutation !== undefined) payload.salutation = patch.salutation;
    if (patch.signature !== undefined) payload.signature = patch.signature;

    if (Object.keys(payload).length === 0) {
      // 无实际变更列：不打扰云端，回读本机缓存即可（与 SQLite 实现行为一致）
      const current = await this.inner.getPerson(id);
      if (!current) throw new Error(`人员不存在或已删除：${id}`);
      return current;
    }

    const result = await supabase
      .from('persons')
      .update(payload)
      .eq('id', id)
      .eq('deleted', false)
      .select()
      .single();
    const row = this.unwrap(result, '人员更新失败') as CloudPersonRow;
    await upsertCacheRows(this.db, 'persons', [normalizePersonRow(row)]);
    this.afterWrite();
    return cloudPersonToEntity(row);
  }

  async deletePerson(id: string): Promise<void> {
    this.assertOnline();

    // 1) 云端应用层级联软删：先取该人的纪念日 id（快照等可能按 anniversary_id 归属）
    const annResult = await supabase.from('anniversaries').select('id').eq('person_id', id);
    if (annResult.error) throw translateCloudError(annResult.error, '云端删除失败');
    const annIds: string[] = (annResult.data ?? []).map((r: { id: string }) => r.id);

    // PostgREST 无跨表事务：七表逐表 await；任一失败即抛错，已软删部分靠下次水位同步补偿
    await this.softDelete('persons', 'id', id);
    await this.softDelete('anniversaries', 'person_id', id);
    await this.softDelete('traits', 'person_id', id);
    for (const table of [
      'content_snapshots',
      'card_states',
      'favorites',
      'sent_records',
    ] as const) {
      await this.softDelete(table, 'person_id', id);
      await this.softDeleteIn(table, 'anniversary_id', annIds);
    }

    // 2) 云端成功后，本机走既有物理级联（含仅本机表 person_reminder_settings /
    //    notification_log 与 M5 通知取消钩子），UI 立即生效
    await this.inner.deletePerson(id);
    this.afterWrite();
  }

  async createAnniversary(input: AnniversaryCreate): Promise<Anniversary> {
    this.assertOnline();
    const ts = now();
    const payload = anniversaryToCloud(
      {
        id: uuid(),
        personId: input.personId,
        name: input.name,
        month: input.month,
        day: input.day,
        startYear: input.startYear,
        userId: this.userId,
        createdAt: ts,
        updatedAt: ts,
        deleted: false,
      },
      this.userId,
    );
    const result = await supabase.from('anniversaries').insert(payload).select().single();
    const row = this.unwrap(result, '纪念日创建失败') as CloudAnniversaryRow;
    await upsertCacheRows(this.db, 'anniversaries', [normalizeAnniversaryRow(row)]);
    this.afterWrite();
    return cloudAnniversaryToEntity(row);
  }

  listAnniversaries(personId: string): Promise<Anniversary[]> {
    return this.inner.listAnniversaries(personId);
  }

  async updateAnniversary(id: string, patch: AnniversaryUpdate): Promise<Anniversary> {
    this.assertOnline();
    const payload: Record<string, unknown> = {};
    if (patch.name !== undefined) payload.name = patch.name;
    if (patch.month !== undefined) payload.month = patch.month;
    if (patch.day !== undefined) payload.day = patch.day;
    if (patch.startYear !== undefined) payload.start_year = patch.startYear;

    if (Object.keys(payload).length === 0) {
      // 无实际变更列：不打扰云端，回读本机缓存（与 SQLite 实现行为一致）
      return this.getCachedAnniversaryOrThrow(id);
    }

    const result = await supabase
      .from('anniversaries')
      .update(payload)
      .eq('id', id)
      .eq('deleted', false)
      .select()
      .single();
    const row = this.unwrap(result, '纪念日更新失败') as CloudAnniversaryRow;
    await upsertCacheRows(this.db, 'anniversaries', [normalizeAnniversaryRow(row)]);
    this.afterWrite();
    return cloudAnniversaryToEntity(row);
  }

  async deleteAnniversary(id: string): Promise<void> {
    this.assertOnline();
    // 与本机 data-model 第 4 节级联口径一致：纪念日落软删时其快照/贺卡一并软删；
    // favorites / sent_records 不按 anniversary 清理（历史保留）。
    await this.softDelete('anniversaries', 'id', id);
    await this.softDelete('content_snapshots', 'anniversary_id', id);
    await this.softDelete('card_states', 'anniversary_id', id);
    // 本机物理级联（含 notification_log 与通知取消钩子）
    await this.inner.deleteAnniversary(id);
    this.afterWrite();
  }

  async createTrait(input: TraitCreate): Promise<Trait> {
    this.assertOnline();
    const ts = now();
    const payload = traitToCloud(
      {
        id: uuid(),
        personId: input.personId,
        content: input.content,
        position: input.position,
        userId: this.userId,
        createdAt: ts,
        updatedAt: ts,
        deleted: false,
      },
      this.userId,
    );
    const result = await supabase.from('traits').insert(payload).select().single();
    const row = this.unwrap(result, '特征创建失败') as CloudTraitRow;
    await upsertCacheRows(this.db, 'traits', [normalizeTraitRow(row)]);
    this.afterWrite();
    return cloudTraitToEntity(row);
  }

  listTraits(personId: string): Promise<Trait[]> {
    return this.inner.listTraits(personId);
  }

  async updateTrait(id: string, patch: TraitUpdate): Promise<Trait> {
    this.assertOnline();
    const payload: Record<string, unknown> = {};
    if (patch.content !== undefined) payload.content = patch.content;
    if (patch.position !== undefined) payload.position = patch.position;

    if (Object.keys(payload).length === 0) {
      // 无实际变更列：不打扰云端，回读本机缓存（与 SQLite 实现行为一致）
      return this.getCachedTraitOrThrow(id);
    }

    const result = await supabase
      .from('traits')
      .update(payload)
      .eq('id', id)
      .eq('deleted', false)
      .select()
      .single();
    const row = this.unwrap(result, '特征更新失败') as CloudTraitRow;
    await upsertCacheRows(this.db, 'traits', [normalizeTraitRow(row)]);
    this.afterWrite();
    return cloudTraitToEntity(row);
  }

  async deleteTrait(id: string): Promise<void> {
    this.assertOnline();
    await this.softDelete('traits', 'id', id);
    await this.inner.deleteTrait(id);
    this.afterWrite();
  }

  // ---------- 设置（T09，四张仅本机表，全部委托） ----------

  getSettings(): Promise<AppSettings> {
    return this.inner.getSettings();
  }

  updateSettings(patch: AppSettingsUpdate): Promise<AppSettings> {
    return this.inner.updateSettings(patch);
  }

  getPersonReminder(personId: string): Promise<PersonReminderSettings | null> {
    return this.inner.getPersonReminder(personId);
  }

  upsertPersonReminder(
    personId: string,
    patch: Partial<Pick<PersonReminderSettings, 'advanceDays' | 'disabled'>>,
  ): Promise<PersonReminderSettings> {
    return this.inner.upsertPersonReminder(personId, patch);
  }

  listFestivalSettings(): Promise<FestivalSetting[]> {
    return this.inner.listFestivalSettings();
  }

  setFestivalDisabled(festivalCode: FestivalCode, disabled: boolean): Promise<FestivalSetting> {
    return this.inner.setFestivalDisabled(festivalCode, disabled);
  }

  // ---------- 心意快照（T10） ----------

  getSnapshot(key: OccasionKey): Promise<ContentSnapshot | null> {
    return this.inner.getSnapshot(key);
  }

  async upsertSnapshot(input: SnapshotUpsert): Promise<ContentSnapshot> {
    this.assertOnline();
    const key: OccasionKey = {
      occasionType: input.occasionType,
      personId: input.personId ?? null,
      anniversaryId: input.anniversaryId ?? null,
      festivalCode: input.festivalCode ?? null,
      year: input.year,
    };

    // 业务键先 SELECT（不过滤 deleted：唯一索引不含 deleted，命中软删行需随 PATCH 复活）
    const selectBuilder = applyOccasionFilters(
      supabase.from('content_snapshots').select('*'),
      key,
    );
    const selected = await selectBuilder.limit(1).maybeSingle();
    if (selected.error) throw translateCloudError(selected.error, '快照读取失败');
    const existing = selected.data as CloudSnapshotRow | null;

    let row: CloudSnapshotRow;
    if (existing) {
      const patch: Record<string, unknown> = {};
      if (input.blessings !== undefined) patch.blessings = input.blessings; // jsonb 直给数组
      if (input.gifts !== undefined) patch.gifts = input.gifts;
      if (input.status !== undefined) patch.status = input.status;
      if (input.failCount !== undefined) patch.fail_count = input.failCount;
      if (input.generatedAt !== undefined) patch.generated_at = input.generatedAt;
      if (existing.deleted) patch.deleted = false; // 复活软删行
      const result = await supabase
        .from('content_snapshots')
        .update(patch)
        .eq('id', existing.id)
        .select()
        .single();
      row = this.unwrap(result, '快照更新失败') as CloudSnapshotRow;
    } else {
      const ts = now();
      const payload = snapshotToCloud(
        {
          id: uuid(),
          personId: key.personId ?? null,
          occasionType: key.occasionType,
          anniversaryId: key.anniversaryId ?? null,
          festivalCode: key.festivalCode ?? null,
          year: key.year,
          blessings: input.blessings === undefined ? null : input.blessings,
          gifts: input.gifts === undefined ? null : input.gifts,
          status: input.status ?? 'pending',
          failCount: input.failCount ?? 0,
          generatedAt: input.generatedAt ?? null,
          userId: this.userId,
          createdAt: ts,
          updatedAt: ts,
          deleted: false,
        },
        this.userId,
      );
      const result = await supabase.from('content_snapshots').insert(payload).select().single();
      row = this.unwrap(result, '快照创建失败') as CloudSnapshotRow;
    }

    await upsertCacheRows(this.db, 'content_snapshots', [normalizeSnapshotRow(row)]);
    this.afterWrite();
    return cloudSnapshotToEntity(row);
  }

  async updateSnapshot(id: string, patch: SnapshotPatch): Promise<ContentSnapshot> {
    this.assertOnline();
    const payload: Record<string, unknown> = {};
    if (patch.blessings !== undefined) payload.blessings = patch.blessings;
    if (patch.gifts !== undefined) payload.gifts = patch.gifts;
    if (patch.status !== undefined) payload.status = patch.status;
    if (patch.failCount !== undefined) payload.fail_count = patch.failCount;
    if (patch.generatedAt !== undefined) payload.generated_at = patch.generatedAt;

    // 与 SQLite 实现一致：即使无业务字段，也放行一次 UPDATE（{} 合法，
    // 服务端触发器仍会以服务器时钟刷新 updated_at），随后取回回传行
    const result = await supabase
      .from('content_snapshots')
      .update(payload)
      .eq('id', id)
      .eq('deleted', false)
      .select()
      .single();
    const row = this.unwrap(result, '快照更新失败') as CloudSnapshotRow;
    await upsertCacheRows(this.db, 'content_snapshots', [normalizeSnapshotRow(row)]);
    this.afterWrite();
    return cloudSnapshotToEntity(row);
  }

  // ---------- 贺卡组合状态 ----------

  getCardState(key: OccasionKey): Promise<CardState | null> {
    return this.inner.getCardState(key);
  }

  async upsertCardState(input: CardStateUpsert): Promise<CardState> {
    this.assertOnline();
    const key: OccasionKey = {
      occasionType: input.occasionType,
      personId: input.personId ?? null,
      anniversaryId: input.anniversaryId ?? null,
      festivalCode: input.festivalCode ?? null,
      year: input.year,
    };

    const selectBuilder = applyOccasionFilters(
      supabase.from('card_states').select('*'),
      key,
    );
    const selected = await selectBuilder.limit(1).maybeSingle();
    if (selected.error) throw translateCloudError(selected.error, '贺卡状态读取失败');
    const existing = selected.data as CloudCardStateRow | null;

    let row: CloudCardStateRow;
    if (existing) {
      const patch: Record<string, unknown> = {};
      if (input.templateCode !== undefined) patch.template_code = input.templateCode;
      if (input.selectedIndex !== undefined) patch.selected_index = input.selectedIndex;
      if (input.editedText !== undefined) patch.edited_text = input.editedText;
      if (existing.deleted) patch.deleted = false;
      const result = await supabase
        .from('card_states')
        .update(patch)
        .eq('id', existing.id)
        .select()
        .single();
      row = this.unwrap(result, '贺卡状态更新失败') as CloudCardStateRow;
    } else {
      const ts = now();
      const payload = cardStateToCloud(
        {
          id: uuid(),
          personId: key.personId ?? null,
          occasionType: key.occasionType,
          anniversaryId: key.anniversaryId ?? null,
          festivalCode: key.festivalCode ?? null,
          year: key.year,
          templateCode: input.templateCode,
          selectedIndex: input.selectedIndex ?? 0,
          editedText: input.editedText ?? null,
          userId: this.userId,
          createdAt: ts,
          updatedAt: ts,
          deleted: false,
        },
        this.userId,
      );
      const result = await supabase.from('card_states').insert(payload).select().single();
      row = this.unwrap(result, '贺卡状态创建失败') as CloudCardStateRow;
    }

    await upsertCacheRows(this.db, 'card_states', [normalizeCardStateRow(row)]);
    this.afterWrite();
    return cloudCardStateToEntity(row);
  }

  // ---------- 收藏夹 ----------

  async addFavorite(input: FavoriteCreate): Promise<Favorite> {
    this.assertOnline();
    // G-A5：add 不去重，库内无业务唯一约束，每次都是新行
    const ts = now();
    const payload = favoriteToCloud(
      {
        id: uuid(),
        kind: input.kind,
        personId: input.personId,
        personLabel: input.personLabel,
        occasionType: input.occasionType,
        anniversaryId: input.anniversaryId,
        festivalCode: input.festivalCode,
        occasionName: input.occasionName,
        year: input.year,
        payload: input.payload, // jsonb 直给对象
        userId: this.userId,
        createdAt: ts,
        updatedAt: ts,
        deleted: false,
      },
      this.userId,
    );
    const result = await supabase.from('favorites').insert(payload).select().single();
    const row = this.unwrap(result, '收藏失败') as CloudFavoriteRow;
    await upsertCacheRows(this.db, 'favorites', [normalizeFavoriteRow(row)]);
    this.afterWrite();
    return cloudFavoriteToEntity(row);
  }

  getFavorite(id: string): Promise<Favorite | null> {
    return this.inner.getFavorite(id);
  }

  async removeFavorite(id: string): Promise<void> {
    this.assertOnline();
    await this.softDelete('favorites', 'id', id);
    // 本机物理删：UI 立即消失；对端经水位同步拉到软删后再物理删
    await this.inner.removeFavorite(id);
    this.afterWrite();
  }

  listFavorites(filter?: { kind?: ContentKind }): Promise<Favorite[]> {
    return this.inner.listFavorites(filter);
  }

  // ---------- 「今年已送出」/ 往年记录 ----------

  async markSent(input: SentRecordCreate): Promise<SentRecord> {
    this.assertOnline();
    const ts = now();
    const key: OccasionKey = {
      occasionType: input.occasionType,
      personId: input.personId,
      anniversaryId: input.anniversaryId ?? null,
      festivalCode: input.festivalCode ?? null,
      year: input.year,
    };

    // 业务键（五元组 + kind）先 SELECT；不过滤 deleted，命中软删行则复活
    const selectBuilder = applyOccasionFilters(
      supabase.from('sent_records').select('*'),
      key,
    );
    const selected = await selectBuilder.eq('kind', input.kind).limit(1).maybeSingle();
    if (selected.error) throw translateCloudError(selected.error, '已送出记录读取失败');
    const existing = selected.data as CloudSentRecordRow | null;

    let row: CloudSentRecordRow;
    if (existing) {
      const patch: Record<string, unknown> = {
        payload: input.payload, // jsonb 直给对象
        marked_at: ts,
      };
      if (existing.deleted) patch.deleted = false;
      const result = await supabase
        .from('sent_records')
        .update(patch)
        .eq('id', existing.id)
        .select()
        .single();
      row = this.unwrap(result, '已送出标记失败') as CloudSentRecordRow;
    } else {
      const payload = sentRecordToCloud(
        {
          id: uuid(),
          personId: input.personId,
          occasionType: input.occasionType,
          anniversaryId: input.anniversaryId ?? null,
          festivalCode: input.festivalCode ?? null,
          year: input.year,
          kind: input.kind,
          payload: input.payload,
          markedAt: ts,
          userId: this.userId,
          createdAt: ts,
          updatedAt: ts,
          deleted: false,
        },
        this.userId,
      );
      const result = await supabase.from('sent_records').insert(payload).select().single();
      row = this.unwrap(result, '已送出标记失败') as CloudSentRecordRow;
    }

    await upsertCacheRows(this.db, 'sent_records', [normalizeSentRecordRow(row)]);
    this.afterWrite();
    return cloudSentRecordToEntity(row);
  }

  async unmarkSent(id: string): Promise<void> {
    this.assertOnline();
    await this.softDelete('sent_records', 'id', id);
    await this.inner.unmarkSent(id);
    this.afterWrite();
  }

  getSentRecord(id: string): Promise<SentRecord | null> {
    return this.inner.getSentRecord(id);
  }

  listSentRecords(query: SentRecordQuery): Promise<SentRecord[]> {
    // 云端不能 JOIN、也无必要：本机缓存表同构，直接读缓存
    return this.inner.listSentRecords(query);
  }

  listSentTimeline(): Promise<SentTimelineRow[]> {
    // 全局流水依赖 persons/anniversaries JOIN：业务表刻意无物理 FK，
    // 不把 JOIN 搬到云端；缓存表内 JOIN 由 inner 完成（缓存经水位同步保持齐全）
    return this.inner.listSentTimeline();
  }

  // ---------- 通知日志（纯本机，不上云） ----------

  insertNotificationLog(input: NotificationLogCreate): Promise<NotificationLog> {
    return this.inner.insertNotificationLog(input);
  }

  getNotificationLog(key: OccasionKey): Promise<NotificationLog | null> {
    return this.inner.getNotificationLog(key);
  }

  listNotificationLogs(filter?: {
    status?: NotificationStatus | readonly NotificationStatus[];
  }): Promise<NotificationLog[]> {
    return this.inner.listNotificationLogs(filter);
  }

  updateNotificationLog(id: string, patch: NotificationLogPatch): Promise<NotificationLog> {
    return this.inner.updateNotificationLog(id, patch);
  }

  deleteNotificationLog(id: string): Promise<void> {
    return this.inner.deleteNotificationLog(id);
  }
}
