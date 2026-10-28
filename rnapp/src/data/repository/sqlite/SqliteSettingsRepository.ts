import type { SQLiteBindValue, SQLiteDatabase } from 'expo-sqlite';
import {
  FESTIVAL_CODES,
  type AppSettings,
  type AppSettingsUpdate,
  type FestivalCode,
  type FestivalSetting,
  type PersonReminderSettings,
} from '../../entities';
import type { SettingsRepository } from '../types';
import { buildSet, toInt } from './shared';
import {
  mapAppSettings,
  mapFestival,
  mapPersonReminder,
  type AppSettingsRow,
  type FestivalRow,
  type PersonReminderRow,
} from './rows';

/**
 * T09：设置部分——app_settings（单行）、person_reminder_settings（一人一行）、
 * festival_settings（六行开关）。
 */
export class SqliteSettingsRepository implements SettingsRepository {
  constructor(private readonly db: SQLiteDatabase) {}

  async getSettings(): Promise<AppSettings> {
    const row = await this.db.getFirstAsync<AppSettingsRow>(
      'SELECT * FROM app_settings WHERE id = 1',
    );
    if (!row) {
      throw new Error('app_settings 默认行缺失（001_init 迁移未生效？）');
    }
    return mapAppSettings(row);
  }

  async updateSettings(patch: AppSettingsUpdate): Promise<AppSettings> {
    const values: Record<string, SQLiteBindValue> = {};
    if (patch.globalAdvanceDays !== undefined) {
      values.global_advance_days = patch.globalAdvanceDays;
    }
    if (patch.deliveryHour !== undefined) values.delivery_hour = patch.deliveryHour;
    if (patch.blessingCount !== undefined) values.blessing_count = patch.blessingCount;
    if (patch.aiConsent !== undefined) values.ai_consent = patch.aiConsent;

    if (Object.keys(values).length > 0) {
      const { clause, params } = buildSet(values);
      await this.db.runAsync(`UPDATE app_settings SET ${clause} WHERE id = 1`, ...params);
    }
    return this.getSettings();
  }

  async getPersonReminder(personId: string): Promise<PersonReminderSettings | null> {
    const row = await this.db.getFirstAsync<PersonReminderRow>(
      'SELECT * FROM person_reminder_settings WHERE person_id = ?',
      personId,
    );
    return row ? mapPersonReminder(row) : null;
  }

  async upsertPersonReminder(
    personId: string,
    patch: Partial<Pick<PersonReminderSettings, 'advanceDays' | 'disabled'>>,
  ): Promise<PersonReminderSettings> {
    const existing = await this.getPersonReminder(personId);
    const advanceDays =
      patch.advanceDays !== undefined ? patch.advanceDays : existing?.advanceDays ?? null;
    const disabled = patch.disabled !== undefined ? patch.disabled : existing?.disabled ?? false;

    await this.db.runAsync(
      `INSERT INTO person_reminder_settings (person_id, advance_days, disabled)
       VALUES (?, ?, ?)
       ON CONFLICT(person_id) DO UPDATE SET
         advance_days = excluded.advance_days,
         disabled = excluded.disabled`,
      personId,
      advanceDays,
      toInt(disabled),
    );
    return (await this.getPersonReminder(personId))!;
  }

  async listFestivalSettings(): Promise<FestivalSetting[]> {
    const rows = await this.db.getAllAsync<FestivalRow>('SELECT * FROM festival_settings');
    const byCode = new Map(rows.map((row) => [row.festival_code, row]));
    // 以代码常量顺序为准，保证六行齐全且展示顺序稳定
    return FESTIVAL_CODES.map((code) => {
      const row = byCode.get(code);
      if (!row) {
        throw new Error(`festival_settings 缺少默认行：${code}`);
      }
      return mapFestival(row);
    });
  }

  async setFestivalDisabled(
    festivalCode: FestivalCode,
    disabled: boolean,
  ): Promise<FestivalSetting> {
    await this.db.runAsync(
      'UPDATE festival_settings SET disabled = ? WHERE festival_code = ?',
      toInt(disabled),
      festivalCode,
    );
    const row = await this.db.getFirstAsync<FestivalRow>(
      'SELECT * FROM festival_settings WHERE festival_code = ?',
      festivalCode,
    );
    if (!row) {
      throw new Error(`festival_settings 缺少默认行：${festivalCode}`);
    }
    return mapFestival(row);
  }
}
