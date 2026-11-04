/**
 * 聚合仓储删人级联单测（T77）：deletePerson 在一个事务内物理删除该人的
 * 全部子表数据（spec 第 2 条），并取消其尚待送达的系统通知；
 * 已送达/补记通知只删行、不触发取消。
 */
/** @jest-environment node */
import type { OccasionKey } from '../../entities';
import { SqliteRepository } from './SqliteRepository';
import { openTestDb } from './sqliteTestDb';
import { getNotificationCanceller, registerNotificationCanceller } from '../notificationCanceller';

declare const describe: (name: string, fn: () => void) => void;
declare const it: (name: string, fn: () => Promise<void>) => void;
declare const expect: any;
declare const beforeEach: (fn: () => Promise<void>) => void;
declare const afterEach: (fn: () => void) => void;
declare const jest: any;

// 应用层 UUID 改为确定性自增
jest.mock('expo-crypto', () => {
  let n = 0;
  return { randomUUID: () => `test-uuid-${++n}` };
});

let db: any;
let repo: SqliteRepository;
let cancelNotifications: any;
let originalCanceller: ReturnType<typeof getNotificationCanceller>;

beforeEach(async () => {
  db = await openTestDb();
  repo = new SqliteRepository(db, null);
  originalCanceller = getNotificationCanceller();
  cancelNotifications = jest.fn(async () => {});
  registerNotificationCanceller(cancelNotifications);
});

afterEach(() => {
  registerNotificationCanceller(originalCanceller);
});

describe('deletePerson · 跨表事务级联', () => {
  it('删除人员时清空其全部子表数据，并取消待送达通知', async () => {
    const person = await repo.createPerson({
      name: '周琳',
      relation: '客户',
      birthdayMonth: 3,
      birthdayDay: 8,
      birthYear: 1985,
      salutation: '周总',
      signature: '小孙',
    });
    const pid = person.id;
    const anniversary = await repo.createAnniversary({
      personId: pid,
      name: '乔迁',
      month: 6,
      day: 1,
      startYear: 2020,
    });
    await repo.createTrait({ personId: pid, content: '爱喝茶', position: 0 });

    const key: OccasionKey = {
      occasionType: 'anniversary',
      personId: pid,
      anniversaryId: anniversary.id,
      festivalCode: null,
      year: 2026,
    };
    await repo.upsertSnapshot({ ...key, blessings: ['乔迁大吉'], status: 'success' });
    await repo.upsertCardState({ ...key, templateCode: 'warm' });
    await repo.addFavorite({
      kind: 'blessing',
      personId: pid,
      personLabel: '周琳（客户）',
      occasionType: 'anniversary',
      anniversaryId: anniversary.id,
      festivalCode: null,
      occasionName: '乔迁',
      year: 2026,
      payload: { text: '乔迁大吉' },
    });
    // markSent 的 personId 必填，显式列出（不走可选键的 OccasionKey）
    await repo.markSent({
      personId: pid,
      occasionType: 'anniversary',
      anniversaryId: anniversary.id,
      festivalCode: null,
      year: 2026,
      kind: 'blessing',
      payload: { text: '乔迁大吉' },
    });
    await repo.upsertPersonReminder(pid, { advanceDays: 7, disabled: false });

    // 一条待送达（应取消）＋一条已送达（只删行，不取消）
    await repo.insertNotificationLog({
      ...key,
      scheduledAt: '2026-05-30T09:00:00',
      status: 'scheduled',
      osNotificationId: 'os-pending',
    });
    const deliveredLog = await repo.insertNotificationLog({
      occasionType: 'birthday',
      personId: pid,
      anniversaryId: null,
      festivalCode: null,
      year: 2025,
      scheduledAt: '2025-03-08T09:00:00',
      status: 'scheduled',
      osNotificationId: 'os-delivered',
    });
    // deliveredAt 只能在送达后通过 updateNotificationLog 写入
    await repo.updateNotificationLog(deliveredLog.id, {
      status: 'delivered',
      deliveredAt: '2025-03-08T09:01:00',
    });

    await repo.deletePerson(pid);

    // 主行与全部子表均不可读
    expect(await repo.getPerson(pid)).toBeNull();
    expect(await repo.listAnniversaries(pid)).toHaveLength(0);
    expect(await repo.listTraits(pid)).toHaveLength(0);
    expect(await repo.getSnapshot(key)).toBeNull();
    expect(await repo.getCardState(key)).toBeNull();
    expect(await repo.listFavorites()).toHaveLength(0);
    expect(
      await repo.listSentRecords({
        personId: pid,
        occasionType: 'anniversary',
        anniversaryId: anniversary.id,
        festivalCode: null,
      }),
    ).toHaveLength(0);
    expect(await repo.getPersonReminder(pid)).toBeNull();
    expect(await repo.listNotificationLogs()).toHaveLength(0);

    // 仅待送达那条的系统通知被取消
    expect(cancelNotifications).toHaveBeenCalledTimes(1);
    expect(cancelNotifications).toHaveBeenCalledWith(['os-pending']);
  });

  it('没有待送达通知时不调用取消器，删除仍成功', async () => {
    const person = await repo.createPerson({
      name: '钱多',
      relation: '其他',
      birthdayMonth: 12,
      birthdayDay: 31,
      birthYear: null,
      salutation: null,
      signature: null,
    });
    await repo.deletePerson(person.id);
    expect(cancelNotifications).not.toHaveBeenCalled();
    expect(await repo.listPersons()).toHaveLength(0);
  });
});
