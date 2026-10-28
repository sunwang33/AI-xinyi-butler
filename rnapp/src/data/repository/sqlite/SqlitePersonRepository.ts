import type { SQLiteBindValue, SQLiteDatabase } from 'expo-sqlite';
import type {
  Anniversary,
  AnniversaryCreate,
  AnniversaryUpdate,
  Person,
  PersonCreate,
  PersonUpdate,
  Trait,
  TraitCreate,
  TraitUpdate,
} from '../../entities';
import type { PersonRepository } from '../types';
import { getNotificationCanceller } from '../notificationCanceller';
import { buildSet, now, uuid } from './shared';
import {
  mapAnniversary,
  mapPerson,
  mapTrait,
  type AnniversaryRow,
  type PersonRow,
  type TraitRow,
} from './rows';

/**
 * T08：人员档案部分（persons / anniversaries / traits）。
 * 删除人员的跨表事务级联在聚合类 SqliteRepository.deletePerson 中实现。
 */
export class SqlitePersonRepository implements Omit<PersonRepository, 'deletePerson'> {
  constructor(private readonly db: SQLiteDatabase) {}

  // ---------- 人员 ----------

  async createPerson(input: PersonCreate): Promise<Person> {
    const id = uuid();
    const ts = now();
    await this.db.runAsync(
      `INSERT INTO persons
         (id, name, relation, birthday_month, birthday_day, birth_year,
          salutation, signature, user_id, created_at, updated_at, deleted)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, 0)`,
      id,
      input.name,
      input.relation,
      input.birthdayMonth,
      input.birthdayDay,
      input.birthYear,
      input.salutation,
      input.signature,
      ts,
      ts,
    );
    return (await this.getPerson(id))!;
  }

  getPerson(id: string): Promise<Person | null> {
    return this.db
      .getFirstAsync<PersonRow>('SELECT * FROM persons WHERE id = ? AND deleted = 0', id)
      .then((row) => (row ? mapPerson(row) : null));
  }

  async listPersons(): Promise<Person[]> {
    const rows = await this.db.getAllAsync<PersonRow>(
      'SELECT * FROM persons WHERE deleted = 0 ORDER BY created_at ASC, id ASC',
    );
    return rows.map(mapPerson);
  }

  async updatePerson(id: string, patch: PersonUpdate): Promise<Person> {
    const values: Record<string, SQLiteBindValue> = {};
    if (patch.name !== undefined) values.name = patch.name;
    if (patch.relation !== undefined) values.relation = patch.relation;
    if (patch.birthdayMonth !== undefined) values.birthday_month = patch.birthdayMonth;
    if (patch.birthdayDay !== undefined) values.birthday_day = patch.birthdayDay;
    if (patch.birthYear !== undefined) values.birth_year = patch.birthYear;
    if (patch.salutation !== undefined) values.salutation = patch.salutation;
    if (patch.signature !== undefined) values.signature = patch.signature;

    if (Object.keys(values).length > 0) {
      values.updated_at = now();
      const { clause, params } = buildSet(values);
      await this.db.runAsync(
        `UPDATE persons SET ${clause} WHERE id = ? AND deleted = 0`,
        ...params,
        id,
      );
    }
    const updated = await this.getPerson(id);
    if (!updated) {
      throw new Error(`人员不存在或已删除：${id}`);
    }
    return updated;
  }

  // deletePerson：见 SqliteRepository（需跨人员/设置/内容全部子表做事务级联）

  // ---------- 纪念日 ----------

  async createAnniversary(input: AnniversaryCreate): Promise<Anniversary> {
    const id = uuid();
    const ts = now();
    await this.db.runAsync(
      `INSERT INTO anniversaries
         (id, person_id, name, month, day, start_year, user_id, created_at, updated_at, deleted)
       VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?, 0)`,
      id,
      input.personId,
      input.name,
      input.month,
      input.day,
      input.startYear,
      ts,
      ts,
    );
    return this.getAnniversaryOrThrow(id);
  }

  async listAnniversaries(personId: string): Promise<Anniversary[]> {
    const rows = await this.db.getAllAsync<AnniversaryRow>(
      'SELECT * FROM anniversaries WHERE person_id = ? AND deleted = 0 ORDER BY created_at ASC, id ASC',
      personId,
    );
    return rows.map(mapAnniversary);
  }

  async updateAnniversary(id: string, patch: AnniversaryUpdate): Promise<Anniversary> {
    const values: Record<string, SQLiteBindValue> = {};
    if (patch.name !== undefined) values.name = patch.name;
    if (patch.month !== undefined) values.month = patch.month;
    if (patch.day !== undefined) values.day = patch.day;
    if (patch.startYear !== undefined) values.start_year = patch.startYear;

    if (Object.keys(values).length > 0) {
      values.updated_at = now();
      const { clause, params } = buildSet(values);
      await this.db.runAsync(
        `UPDATE anniversaries SET ${clause} WHERE id = ? AND deleted = 0`,
        ...params,
        id,
      );
    }
    return this.getAnniversaryOrThrow(id);
  }

  async deleteAnniversary(id: string): Promise<void> {
    // data-model 第 4 节：纪念日本身被删时，其快照/贺卡状态/通知日志一并清理
    const pending = await this.db.getAllAsync<{ os_notification_id: string | null }>(
      `SELECT os_notification_id FROM notification_log
       WHERE anniversary_id = ? AND status = 'scheduled'`,
      id,
    );
    await this.db.withTransactionAsync(async () => {
      await this.db.runAsync('DELETE FROM notification_log WHERE anniversary_id = ?', id);
      await this.db.runAsync('DELETE FROM content_snapshots WHERE anniversary_id = ?', id);
      await this.db.runAsync('DELETE FROM card_states WHERE anniversary_id = ?', id);
      await this.db.runAsync('DELETE FROM anniversaries WHERE id = ?', id);
    });
    // M5 接入点：同步取消该纪念日待送达的系统通知
    const osIds = pending
      .map((row) => row.os_notification_id)
      .filter((value): value is string => Boolean(value));
    if (osIds.length > 0) {
      await getNotificationCanceller()(osIds);
    }
  }

  private async getAnniversaryOrThrow(id: string): Promise<Anniversary> {
    const row = await this.db.getFirstAsync<AnniversaryRow>(
      'SELECT * FROM anniversaries WHERE id = ? AND deleted = 0',
      id,
    );
    if (!row) {
      throw new Error(`纪念日不存在或已删除：${id}`);
    }
    return mapAnniversary(row);
  }

  // ---------- 特征 ----------

  async createTrait(input: TraitCreate): Promise<Trait> {
    const id = uuid();
    const ts = now();
    await this.db.runAsync(
      `INSERT INTO traits
         (id, person_id, content, position, user_id, created_at, updated_at, deleted)
       VALUES (?, ?, ?, ?, NULL, ?, ?, 0)`,
      id,
      input.personId,
      input.content,
      input.position,
      ts,
      ts,
    );
    return this.getTraitOrThrow(id);
  }

  async listTraits(personId: string): Promise<Trait[]> {
    const rows = await this.db.getAllAsync<TraitRow>(
      'SELECT * FROM traits WHERE person_id = ? AND deleted = 0 ORDER BY position ASC, created_at ASC',
      personId,
    );
    return rows.map(mapTrait);
  }

  async updateTrait(id: string, patch: TraitUpdate): Promise<Trait> {
    const values: Record<string, SQLiteBindValue> = {};
    if (patch.content !== undefined) values.content = patch.content;
    if (patch.position !== undefined) values.position = patch.position;

    if (Object.keys(values).length > 0) {
      values.updated_at = now();
      const { clause, params } = buildSet(values);
      await this.db.runAsync(
        `UPDATE traits SET ${clause} WHERE id = ? AND deleted = 0`,
        ...params,
        id,
      );
    }
    return this.getTraitOrThrow(id);
  }

  async deleteTrait(id: string): Promise<void> {
    await this.db.runAsync('DELETE FROM traits WHERE id = ?', id);
  }

  private async getTraitOrThrow(id: string): Promise<Trait> {
    const row = await this.db.getFirstAsync<TraitRow>(
      'SELECT * FROM traits WHERE id = ? AND deleted = 0',
      id,
    );
    if (!row) {
      throw new Error(`特征不存在或已删除：${id}`);
    }
    return mapTrait(row);
  }
}
