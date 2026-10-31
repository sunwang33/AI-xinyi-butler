/**
 * 提醒调度器重算与补发状态机单元测试（T73，M5.6 波次一）。
 *
 * 依赖与口径：
 * - expo-notifications 整体手工 mock（见 remindersTestMocks），Repository 层
 *   mock 为内存假件；不触碰真实 SQLite 与系统通知；
 * - scheduler 内部以 new Date()/Date.now() 取设备本地当前时刻，用例统一用
 *   jest.useFakeTimers({ now }) 固定；
 * - 每个用例经 jest.isolateModules 取得全新 scheduler 模块实例，使模块级
 *   catchupDone（补发每冷启动一遍）、监听注册标志互不串扰。
 *
 * 工程未引入生效的 jest 全局类型（同 engine.test.ts 的处理），此处仅声明最小类型。
 *
 * jest.isolateModules 内需按隔离模块注册表同步取得 mock 实例，必须使用 require。
 */
/* eslint-disable @typescript-eslint/no-require-imports */
import type {
  NotificationLog,
  OccasionType,
} from '../../data/entities';
import type { LocalNotificationContent } from './notifications';
import {
  mockCreateExpoNotifications,
  mockCreateExpoRouter,
  mockCreateMemoryRepository,
  mockCreateRepositoryModule,
  mockFestivalSettings,
  mockMakeAnniversary,
  mockMakePerson,
  mockMakeSettings,
  type MemoryRepository,
  type MockExpoNotifications,
  type MockRepositoryInit,
} from './remindersTestMocks';

declare const describe: (name: string, fn: () => void) => void;
declare const it: any;
declare const beforeEach: (fn: () => void) => void;
declare const afterEach: (fn: () => void) => void;
declare const expect: any;
declare const jest: any;
/** @types/jest 未生效时的最小 mock 函数类型别名 */
type JestMock = any;

// jest.mock 工厂只允许引用 mock 前缀的外部变量，故统一由辅助文件构造
jest.mock('expo-notifications', () => mockCreateExpoNotifications());
jest.mock('expo-router', () => mockCreateExpoRouter());
jest.mock('../../data/repository', () => mockCreateRepositoryModule());

type SchedulerModule = typeof import('./scheduler');
type NotificationsModule = typeof import('./notifications');

interface Harness {
  notif: MockExpoNotifications;
  repo: MemoryRepository;
  scheduler: SchedulerModule;
  notifications: NotificationsModule;
  /** 模拟 AppState 'change' 事件（回前台 active 等），监听器在 initializeReminders 时注册 */
  emitAppState: (state: string) => void;
}

/**
 * fake timers 下把 void 异步回调（AppState 监听不向外返回 Promise）产生的
 * 微任务链排空；轮数远大于 rescheduleLocked 内 await 深度即可。
 */
async function flushMicrotasks(rounds = 200): Promise<void> {
  for (let i = 0; i < rounds; i += 1) {
    await Promise.resolve();
  }
}

/** 固定设备时刻并构造一套互相绑定的隔离模块实例 */
function createHarness(now: Date, repoInit: MockRepositoryInit = {}): Harness {
  jest.useFakeTimers({ now });
  const harness = {} as Harness;
  jest.isolateModules(() => {
    const notif = require('expo-notifications') as MockExpoNotifications;
    const repo = mockCreateMemoryRepository(repoInit);
    const repositoryModule = require('../../data/repository') as {
      getRepository: JestMock;
    };
    repositoryModule.getRepository.mockResolvedValue(repo);
    // 劫持 jest-expo 预设的 AppState mock，抓 scheduler 注册的 'change' 监听器
    const reactNative = require('react-native') as {
      AppState: { addEventListener: JestMock };
    };
    let appStateListener: (state: string) => void = () => undefined;
    reactNative.AppState.addEventListener.mockImplementation(
      (event: string, listener: (state: string) => void) => {
        if (event === 'change') {
          appStateListener = listener;
        }
        return { remove: jest.fn() };
      },
    );
    harness.notif = notif;
    harness.repo = repo;
    harness.scheduler = require('./scheduler') as SchedulerModule;
    harness.notifications = require('./notifications') as NotificationsModule;
    harness.emitAppState = (state: string) => {
      appStateListener(state);
    };
  });
  return harness;
}

/** 取 scheduleNotificationAsync 的全部入参（正常调度与补发立即投递都经此） */
function scheduledRequests(notif: MockExpoNotifications): {
  content: LocalNotificationContent;
  trigger: { type: string; date: Date; channelId?: string; delivery?: string };
}[] {
  return notif.scheduleNotificationAsync.mock.calls.map(([request]: [unknown]) => {
    const { content, trigger } = request as {
      content: LocalNotificationContent;
      trigger: { type: string; date: Date; channelId?: string };
    };
    return { content, trigger };
  });
}

/** 构造一条 notification_log 行（用于预置 delivered/错过 scheduled 等运行数据） */
function makeLog(init: {
  id?: string;
  occasionType: OccasionType;
  personId?: string | null;
  anniversaryId?: string | null;
  festivalCode?: string | null;
  year: number;
  scheduledAt: string;
  status?: NotificationLog['status'];
  isMadeUp?: boolean;
  osNotificationId?: string | null;
  deliveredAt?: string | null;
}): NotificationLog {
  return {
    id: init.id ?? `seed-${init.personId ?? init.festivalCode ?? 'x'}-${init.year}`,
    occasionType: init.occasionType,
    personId: init.personId ?? null,
    anniversaryId: init.anniversaryId ?? null,
    festivalCode: (init.festivalCode as NotificationLog['festivalCode']) ?? null,
    year: init.year,
    scheduledAt: init.scheduledAt,
    status: init.status ?? 'scheduled',
    isMadeUp: init.isMadeUp ?? false,
    osNotificationId: init.osNotificationId ?? null,
    deliveredAt: init.deliveredAt ?? null,
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
  };
}

afterEach(() => {
  jest.useRealTimers();
});

// ① 同日多日子合并为一条通知，payload 携带当天全部日子标识
describe('同日合并', () => {
  it('同一送达时刻的两个生日合并为一条通知，payload 含两个日子键', async () => {
    const now = new Date(2025, 2, 1, 8, 0, 0);
    const { scheduler, repo, notif } = createHarness(now, {
      persons: [
        mockMakePerson({ id: 'p1', name: '张伟', birthdayMonth: 3, birthdayDay: 4 }),
        mockMakePerson({ id: 'p2', name: '李娜', birthdayMonth: 3, birthdayDay: 4 }),
      ],
    });

    await scheduler.rescheduleReminders();

    const requests = scheduledRequests(notif);
    expect(requests).toHaveLength(1);
    const { content, trigger } = requests[0];
    expect(content.title).toBe('今天有 2 个日子要惦记');
    expect(content.body).toContain('张伟 生日（还有 3 天）');
    expect(content.body).toContain('李娜 生日（还有 3 天）');
    // 送达日为日子前第 3 天，9 点整点触发
    expect(content.data).toMatchObject({ date: '2025-03-01' });
    expect(trigger.date.getTime()).toBe(new Date(2025, 2, 1, 9, 0, 0).getTime());

    const items = content.data!.items as Record<string, unknown>[];
    expect(items).toHaveLength(2);
    expect(items.map((item) => [item.personId, item.occasionType, item.year, item.occasionDate])).toEqual(
      expect.arrayContaining([
        ['p1', 'birthday', 2025, '2025-03-04'],
        ['p2', 'birthday', 2025, '2025-03-04'],
      ]),
    );

    // 逐行登记日志，多行共享同一系统通知 id
    expect(repo.logs).toHaveLength(2);
    const osId = await notif.scheduleNotificationAsync.mock.results[0]?.value;
    expect(repo.logs.every((log) => log.osNotificationId === osId)).toBe(true);
    expect(repo.logs.map((log) => log.status)).toEqual(['scheduled', 'scheduled']);
  });
});

// ② 同年同一「日子 × 年份」只调度一条（重复重算不产生重复）
describe('同年去重与重算重建', () => {
  it('连续两次重算后该日子仍只有一条调度与一行日志，旧系统通知被取消', async () => {
    const now = new Date(2025, 6, 1, 8, 0, 0);
    const { scheduler, repo, notif } = createHarness(now, {
      persons: [mockMakePerson({ id: 'p1', name: '张伟', birthdayMonth: 7, birthdayDay: 10 })],
      festivalSettings: mockFestivalSettings([
        'new_year',
        'valentines_day',
        'mothers_day',
        'fathers_day',
        'thanksgiving',
        'christmas',
      ]),
    });

    await scheduler.rescheduleReminders();
    expect(scheduledRequests(notif)).toHaveLength(1);
    expect(repo.logs).toHaveLength(1);
    const firstOsId = repo.logs[0].osNotificationId;

    await scheduler.rescheduleReminders();
    const requests = scheduledRequests(notif);
    expect(requests).toHaveLength(2);
    expect(repo.logs).toHaveLength(1);
    const secondOsId = repo.logs[0].osNotificationId;
    expect(secondOsId).not.toBe(firstOsId);
    expect(secondOsId).toBe('os-2');
    // 旧通知已取消，系统队列中只保留新通知
    expect(notif.cancelScheduledNotificationAsync).toHaveBeenCalledWith('os-1');
    expect(notif.__test.queuedIds()).toEqual(['os-2']);
    // 键仍为同一「人 × 生日 × 2025」
    expect(repo.logs[0]).toMatchObject({
      occasionType: 'birthday',
      personId: 'p1',
      year: 2025,
    });
  });

  it('已有 delivered 终态日志的「日子 × 年份」不再调度且日志保留', async () => {
    const now = new Date(2025, 6, 1, 8, 0, 0);
    const { scheduler, repo, notif } = createHarness(now, {
      settings: mockMakeSettings(),
      persons: [mockMakePerson({ id: 'p1', name: '张伟', birthdayMonth: 7, birthdayDay: 10 })],
      festivalSettings: mockFestivalSettings([
        'new_year',
        'valentines_day',
        'mothers_day',
        'fathers_day',
        'thanksgiving',
        'christmas',
      ]),
      logs: [
        makeLog({
          occasionType: 'birthday',
          personId: 'p1',
          year: 2025,
          scheduledAt: new Date(2025, 6, 7, 9, 0, 0).toISOString(),
          status: 'delivered',
          osNotificationId: 'os-delivered',
          deliveredAt: new Date(2025, 6, 7, 9, 0, 1).toISOString(),
        }),
      ],
    });

    await scheduler.rescheduleReminders();

    expect(scheduledRequests(notif)).toHaveLength(0);
    expect(repo.logs).toHaveLength(1);
    expect(repo.logs[0].status).toBe('delivered');
    expect(notif.cancelScheduledNotificationAsync).not.toHaveBeenCalled();
  });
});

// ③ 提前 N 天在 delivery_hour 整点触发（跨月、跨年、2/29 平闰）
describe('送达时刻计算', () => {
  it.each([
    {
      name: '跨月',
      now: new Date(2025, 0, 30, 8, 0, 0),
      month: 2,
      day: 2,
      hour: 14,
      expectedDelivery: new Date(2025, 0, 30, 14, 0, 0),
      expectedDate: '2025-02-02',
      expectedYear: 2025,
    },
    {
      name: '跨年',
      now: new Date(2025, 11, 31, 8, 0, 0),
      month: 1,
      day: 3,
      hour: 9,
      expectedDelivery: new Date(2025, 11, 31, 9, 0, 0),
      expectedDate: '2026-01-03',
      expectedYear: 2026,
    },
    {
      name: '2/29 闰年按 29 日',
      now: new Date(2028, 1, 26, 8, 0, 0),
      month: 2,
      day: 29,
      hour: 9,
      expectedDelivery: new Date(2028, 1, 26, 9, 0, 0),
      expectedDate: '2028-02-29',
      expectedYear: 2028,
    },
    {
      name: '2/29 平年折算 2/28，送达日相应提前',
      now: new Date(2026, 1, 25, 8, 0, 0),
      month: 2,
      day: 29,
      hour: 9,
      expectedDelivery: new Date(2026, 1, 25, 9, 0, 0),
      expectedDate: '2026-02-28',
      expectedYear: 2026,
    },
  ] as const)(
    '$name：提前 3 天在 deliveryHour 整点调度，payload 为实际日子日期',
    async (row: {
      name: string;
      now: Date;
      month: number;
      day: number;
      hour: number;
      expectedDelivery: Date;
      expectedDate: string;
      expectedYear: number;
    }) => {
      const { name, now, month, day, hour, expectedDelivery, expectedDate, expectedYear } = row;
      const { scheduler, repo, notif } = createHarness(now, {
        settings: mockMakeSettings({ deliveryHour: hour }),
        persons: [mockMakePerson({ id: 'p1', name: '张伟', birthdayMonth: month, birthdayDay: day })],
        // 屏蔽全部节日，保证窗口内只有这一条调度
        festivalSettings: mockFestivalSettings([
          'new_year',
          'valentines_day',
          'mothers_day',
          'fathers_day',
          'thanksgiving',
          'christmas',
        ]),
      });

      await scheduler.rescheduleReminders();

      const requests = scheduledRequests(notif);
      expect(requests).toHaveLength(1);
      expect(requests[0].trigger.date.getTime()).toBe(expectedDelivery.getTime());
      const items = requests[0].content.data!.items as Record<string, unknown>[];
      expect(items).toHaveLength(1);
      expect(items[0]).toMatchObject({
        personId: 'p1',
        occasionType: 'birthday',
        year: expectedYear,
        occasionDate: expectedDate,
      });
      expect(repo.logs).toHaveLength(1);
      expect(repo.logs[0].scheduledAt).toBe(expectedDelivery.toISOString());
      // 用例名参与断言可读性，name 仅用于区分 it.each 行
      expect(typeof name).toBe('string');
    },
  );

  it('纪念日同样按全局提前天数与送达钟点调度，payload 带 anniversaryId', async () => {
    const now = new Date(2025, 4, 6, 6, 0, 0);
    const { scheduler, repo, notif } = createHarness(now, {
      settings: mockMakeSettings({ globalAdvanceDays: 5, deliveryHour: 7 }),
      persons: [mockMakePerson({ id: 'p1', name: '张伟', birthdayMonth: 9, birthdayDay: 1 })],
      anniversaries: [
        mockMakeAnniversary({ id: 'ann1', personId: 'p1', name: '领证日', month: 5, day: 11 }),
      ],
      festivalSettings: mockFestivalSettings([
        'new_year',
        'valentines_day',
        'mothers_day',
        'fathers_day',
        'thanksgiving',
        'christmas',
      ]),
    });

    await scheduler.rescheduleReminders();

    const requests = scheduledRequests(notif);
    expect(requests).toHaveLength(1);
    expect(requests[0].trigger.date.getTime()).toBe(new Date(2025, 4, 6, 7, 0, 0).getTime());
    const items = requests[0].content.data!.items as Record<string, unknown>[];
    expect(items[0]).toMatchObject({
      occasionType: 'anniversary',
      personId: 'p1',
      anniversaryId: 'ann1',
      year: 2025,
      occasionDate: '2025-05-11',
    });
    expect(repo.logs[0]).toMatchObject({ occasionType: 'anniversary', anniversaryId: 'ann1' });
  });
});

// ④ 取关节日与单人提醒关闭不调度
describe('开关过滤', () => {
  it('取关的节日不调度；同窗口内仍关注的节日照常调度', async () => {
    const now = new Date(2025, 11, 10, 8, 0, 0);
    const { scheduler, repo, notif } = createHarness(now, {
      // 窗口 2025-12-10～2026-01-08：圣诞（12-25）已取关，元旦（2026-01-01）仍关注
      festivalSettings: mockFestivalSettings(['christmas']),
    });

    await scheduler.rescheduleReminders();

    const items = scheduledRequests(notif).flatMap(
      (request) => request.content.data!.items,
    ) as Record<string, unknown>[];
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      occasionType: 'festival',
      festivalCode: 'new_year',
      year: 2026,
      occasionDate: '2026-01-01',
    });
    expect(repo.logs.some((log) => log.festivalCode === 'christmas')).toBe(false);
  });

  it('单人提醒关闭：该人生日不调度，其他人照常；节日不受单人开关影响', async () => {
    const now = new Date(2025, 11, 10, 8, 0, 0);
    const { scheduler, repo, notif } = createHarness(now, {
      persons: [
        mockMakePerson({ id: 'p1', name: '张伟', birthdayMonth: 12, birthdayDay: 18 }),
        mockMakePerson({ id: 'p2', name: '李娜', birthdayMonth: 12, birthdayDay: 20 }),
      ],
      reminders: [{ personId: 'p2', advanceDays: null, disabled: true }],
      festivalSettings: mockFestivalSettings([
        'new_year',
        'valentines_day',
        'mothers_day',
        'fathers_day',
        'thanksgiving',
        'christmas',
      ]),
    });

    await scheduler.rescheduleReminders();

    const items = scheduledRequests(notif).flatMap(
      (request) => request.content.data!.items,
    ) as Record<string, unknown>[];
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ occasionType: 'birthday', personId: 'p1' });
    expect(repo.logs.some((log) => log.personId === 'p2')).toBe(false);
  });
});

// ⑤ 已过日子不调度、日子当天不推
describe('过去与当天不调度', () => {
  it('日子就是今天：送达时刻（今天 9 点）已过，不调度不写日志', async () => {
    // 注意：new Date 月份为 0 基，birthdayMonth 为 1 基，二者都指向 7/15
    const now = new Date(2025, 6, 15, 10, 0, 0);
    const { scheduler, repo, notif } = createHarness(now, {
      persons: [mockMakePerson({ id: 'p1', name: '张伟', birthdayMonth: 7, birthdayDay: 15 })],
    });

    await scheduler.rescheduleReminders();

    // 命中存在但 deliveryAt(今天 9 点) <= now(今天 10 点)，走「送达时刻已过」分支
    expect(scheduledRequests(notif)).toHaveLength(0);
    expect(repo.logs).toHaveLength(0);
  });

  it('提前天数为 0（N=0 覆盖）：日子当天不推，不调度', async () => {
    // 7/20 在未来 30 天窗口内；N=0 使送达日即日子当天，命中后被 advanceDays<=0 分支拦截
    const now = new Date(2025, 6, 15, 10, 0, 0);
    const { scheduler, repo, notif } = createHarness(now, {
      persons: [mockMakePerson({ id: 'p1', name: '张伟', birthdayMonth: 7, birthdayDay: 20 })],
      reminders: [{ personId: 'p1', advanceDays: 0, disabled: false }],
    });

    await scheduler.rescheduleReminders();

    expect(scheduledRequests(notif)).toHaveLength(0);
    expect(repo.logs).toHaveLength(0);
  });
});

// ⑥ T68：已拒通知权限时非冷启动重算短路
describe('拒权守卫（T68）', () => {
  it('rescheduleReminders 拒权时不调度、不写 scheduled 日志、不动旧数据，且不重复申请权限', async () => {
    const now = new Date(2025, 6, 1, 8, 0, 0);
    const { scheduler, repo, notif } = createHarness(now, {
      persons: [mockMakePerson({ id: 'p1', name: '张伟', birthdayMonth: 7, birthdayDay: 10 })],
      logs: [
        makeLog({
          occasionType: 'birthday',
          personId: 'p1',
          year: 2025,
          scheduledAt: new Date(2025, 6, 7, 9, 0, 0).toISOString(),
          osNotificationId: 'os-old',
        }),
      ],
    });
    notif.__test.deny();

    await scheduler.rescheduleReminders();

    expect(notif.scheduleNotificationAsync).not.toHaveBeenCalled();
    expect(repo.insertNotificationLog).not.toHaveBeenCalled();
    expect(notif.requestPermissionsAsync).not.toHaveBeenCalled();
    // 守卫只读查询一次权限
    expect(notif.getPermissionsAsync).toHaveBeenCalledTimes(1);
    // 旧系统通知与旧日志原样保留
    expect(notif.cancelScheduledNotificationAsync).not.toHaveBeenCalled();
    expect(repo.deleteNotificationLog).not.toHaveBeenCalled();
    expect(repo.logs).toHaveLength(1);
    expect(repo.logs[0].status).toBe('scheduled');
    // 拒权兜底：仍刷新当天角标
    expect(notif.setBadgeCountAsync).toHaveBeenCalledTimes(1);
  });

  it('冷启动即已拒权：不补发、不调度，只刷角标，错过日志原样保留', async () => {
    const now = new Date(2025, 6, 15, 10, 0, 0);
    const { scheduler, repo, notif } = createHarness(now, {
      persons: [mockMakePerson({ id: 'p1', name: '张伟', birthdayMonth: 6, birthdayDay: 15 })],
      logs: [
        makeLog({
          occasionType: 'birthday',
          personId: 'p1',
          year: 2025,
          scheduledAt: new Date(2025, 6, 15, 8, 0, 0).toISOString(),
          osNotificationId: 'os-miss',
        }),
      ],
    });
    notif.__test.seedQueued('os-miss');
    notif.__test.deny();

    await scheduler.initializeReminders();

    expect(notif.scheduleNotificationAsync).not.toHaveBeenCalled();
    expect(notif.cancelScheduledNotificationAsync).not.toHaveBeenCalled();
    expect(repo.updateNotificationLog).not.toHaveBeenCalled();
    expect(repo.logs).toHaveLength(1);
    expect(repo.logs[0].status).toBe('scheduled');
    expect(notif.requestPermissionsAsync).not.toHaveBeenCalled();
    expect(notif.setBadgeCountAsync).toHaveBeenCalled();
    expect(notif.setNotificationChannelAsync).toHaveBeenCalled();
  });
});

// ⑦ T26：补发状态机
describe('冷启动补发（T26）', () => {
  /** 6/15 8:00 的错过生日通知（冷启动时刻固定为当天 10:00，错过 2 小时） */
  function missedBirthdayHarness(extra: MockRepositoryInit = {}): Harness {
    const now = new Date(2025, 5, 15, 10, 0, 0);
    return createHarness(now, {
      persons: [mockMakePerson({ id: 'p1', name: '张伟', birthdayMonth: 6, birthdayDay: 15 })],
      logs: [
        makeLog({
          occasionType: 'birthday',
          personId: 'p1',
          year: 2025,
          scheduledAt: new Date(2025, 5, 15, 8, 0, 0).toISOString(),
          osNotificationId: 'os-miss',
        }),
      ],
      ...extra,
    });
  }

  it('错过且未送达（id 仍在系统队列）：冷启动补发一次并置 made_up/is_made_up，再次启动不重复补', async () => {
    const { scheduler, repo, notif } = missedBirthdayHarness();
    notif.__test.seedQueued('os-miss');
    const now = new Date(2025, 5, 15, 10, 0, 0);

    await scheduler.initializeReminders();

    // 补发前先取消原调度，再立即投递一条
    expect(notif.cancelScheduledNotificationAsync).toHaveBeenCalledWith('os-miss');
    const requests = scheduledRequests(notif);
    expect(requests).toHaveLength(1);
    expect(requests[0].trigger.date.getTime()).toBe(now.getTime() + 1000);
    expect(requests[0].content.title).toBe('张伟的生日，还有 0 天');
    const items = requests[0].content.data!.items as Record<string, unknown>[];
    expect(items[0]).toMatchObject({
      occasionType: 'birthday',
      personId: 'p1',
      year: 2025,
      occasionDate: '2025-06-15',
    });
    expect(repo.logs).toHaveLength(1);
    expect(repo.logs[0].status).toBe('made_up');
    expect(repo.logs[0].isMadeUp).toBe(true);
    expect(repo.logs[0].deliveredAt).not.toBeNull();
    // 重算阶段同年去重：made_up 终态不再重新调度（仅补发那一条）
    expect(notif.scheduleNotificationAsync).toHaveBeenCalledTimes(1);

    // 第二次冷启动：catchupDone 保证补发扫描不重跑
    await scheduler.initializeReminders();
    expect(notif.scheduleNotificationAsync).toHaveBeenCalledTimes(1);
    expect(repo.logs[0].status).toBe('made_up');
  });

  it('系统队列已无该 id：启发式判定已投递，置 delivered，不重发', async () => {
    const { scheduler, repo, notif } = missedBirthdayHarness();
    // 不 seedQueued：系统现存调度集合为空

    await scheduler.initializeReminders();

    expect(notif.scheduleNotificationAsync).not.toHaveBeenCalled();
    expect(notif.cancelScheduledNotificationAsync).not.toHaveBeenCalled();
    expect(repo.logs).toHaveLength(1);
    expect(repo.logs[0].status).toBe('delivered');
    expect(repo.logs[0].isMadeUp).toBe(false);
    expect(repo.logs[0].deliveredAt).not.toBeNull();
  });

  it('错过超过 24h 补发窗口：不补发，残留 scheduled 行随重算清旧删除', async () => {
    const now = new Date(2025, 5, 15, 10, 0, 0);
    const { scheduler, repo, notif } = createHarness(now, {
      persons: [mockMakePerson({ id: 'p1', name: '张伟', birthdayMonth: 6, birthdayDay: 15 })],
      logs: [
        makeLog({
          occasionType: 'birthday',
          personId: 'p1',
          year: 2025,
          scheduledAt: new Date(now.getTime() - 25 * 60 * 60 * 1000).toISOString(),
          osNotificationId: 'os-miss',
        }),
      ],
    });
    notif.__test.seedQueued('os-miss');

    await scheduler.initializeReminders();

    expect(notif.scheduleNotificationAsync).not.toHaveBeenCalled();
    expect(repo.logs.some((log) => log.status === 'made_up')).toBe(false);
    // 超窗行不补，重算清旧取消并删除
    expect(notif.cancelScheduledNotificationAsync).toHaveBeenCalledWith('os-miss');
    expect(repo.logs).toHaveLength(0);
  });

  it('人已删除（日子键在未来命中中查不到）：不补发，残留行随清旧删除', async () => {
    const now = new Date(2025, 5, 15, 10, 0, 0);
    const { scheduler, repo, notif } = createHarness(now, {
      persons: [],
      logs: [
        makeLog({
          occasionType: 'birthday',
          personId: 'p-deleted',
          year: 2025,
          scheduledAt: new Date(2025, 5, 15, 8, 0, 0).toISOString(),
          osNotificationId: 'os-orphan',
        }),
      ],
    });
    notif.__test.seedQueued('os-orphan');

    await scheduler.initializeReminders();

    expect(notif.scheduleNotificationAsync).not.toHaveBeenCalled();
    expect(repo.logs.some((log) => log.status === 'made_up')).toBe(false);
    expect(repo.logs).toHaveLength(0);
    expect(notif.cancelScheduledNotificationAsync).toHaveBeenCalledWith('os-orphan');
  });
});

// ⑧ T72：精确闹钟（SCHEDULE_EXACT_ALARM）封装与 trigger 形态
describe('精确闹钟封装（T72）', () => {
  // 精确闹钟查询/授权页失败路径会 console.warn，统一静默；
  // afterEach 即使断言失败也保证 restore，不污染其他 describe
  let warnSpy: JestMock;
  beforeEach(() => {
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  });
  afterEach(() => {
    warnSpy.mockRestore();
  });

  /** 窗口内仅有一条生日调度（屏蔽全部节日），便于检查 trigger.delivery */
  function harnessWithOneBirthday(): Harness {
    const now = new Date(2025, 6, 1, 8, 0, 0);
    return createHarness(now, {
      persons: [mockMakePerson({ id: 'p1', name: '张伟', birthdayMonth: 7, birthdayDay: 10 })],
      festivalSettings: mockFestivalSettings([
        'new_year',
        'valentines_day',
        'mothers_day',
        'fathers_day',
        'thanksgiving',
        'christmas',
      ]),
    });
  }

  it('已授权：初始化后调度的 trigger 带 delivery:alarmClock', async () => {
    const { scheduler, notifications, notif } = harnessWithOneBirthday();
    notif.__test.setExactAlarmGranted(true);

    await scheduler.initializeReminders();

    expect(notifications.isExactAlarmGranted()).toBe(true);
    const requests = scheduledRequests(notif);
    expect(requests).toHaveLength(1);
    expect(requests[0].trigger.delivery).toBe('alarmClock');
  });

  it('未授权（默认）：trigger 不含 delivery，按 bestEffort 投递', async () => {
    const { scheduler, notifications, notif } = harnessWithOneBirthday();

    await scheduler.initializeReminders();

    expect(notifications.isExactAlarmGranted()).toBe(false);
    const requests = scheduledRequests(notif);
    expect(requests).toHaveLength(1);
    expect(requests[0].trigger).not.toHaveProperty('delivery');
  });

  it('状态查询抛异常（Expo Go 能力缺失）：降级未授权不抛错，trigger 不含 delivery', async () => {
    const { scheduler, notifications, notif } = harnessWithOneBirthday();
    notif.getExactAlarmPermissionsAsync.mockRejectedValue(new Error('unsupported'));

    await expect(scheduler.initializeReminders()).resolves.toBeUndefined();

    expect(notifications.isExactAlarmGranted()).toBe(false);
    const requests = scheduledRequests(notif);
    expect(requests).toHaveLength(1);
    expect(requests[0].trigger).not.toHaveProperty('delivery');
  });

  it('requestExactAlarmPermissionAsync 成功后缓存刷新：随后重算的 trigger 带 alarmClock', async () => {
    const { scheduler, notifications, notif } = harnessWithOneBirthday();
    // 先初始化：默认未授权
    await scheduler.initializeReminders();
    expect(notifications.isExactAlarmGranted()).toBe(false);

    // 用户在系统页授权：request resolve 后封装重新查询得到 granted:true
    notif.requestExactAlarmPermissionsAsync.mockResolvedValueOnce({ granted: true });
    notif.__test.setExactAlarmGranted(true);
    await notifications.requestExactAlarmPermissionAsync();

    expect(notifications.isExactAlarmGranted()).toBe(true);
    // 再次重算（模拟返回 App 后触发），新 trigger 带 alarmClock
    await scheduler.rescheduleReminders();
    const requests = scheduledRequests(notif);
    expect(requests[requests.length - 1].trigger.delivery).toBe('alarmClock');
  });

  it('底层打开授权页 reject：包装返回 false 且不抛，缓存仍为未授权', async () => {
    const { notifications, notif } = harnessWithOneBirthday();
    notif.requestExactAlarmPermissionsAsync.mockRejectedValueOnce(new Error('cannot open'));

    let result: unknown;
    await expect(
      (async () => {
        result = await notifications.requestExactAlarmPermissionAsync();
      })(),
    ).resolves.toBeUndefined();

    expect(result).toBe(false);
    expect(notifications.isExactAlarmGranted()).toBe(false);
    expect(notif.getExactAlarmPermissionsAsync).not.toHaveBeenCalled();
  });

  it('getExactAlarmStatus 三态：granted / denied / 查询异常 unknown', async () => {
    const { notifications, notif } = harnessWithOneBirthday();

    // 模块初始缓存为 unknown（尚未查询过）
    expect(notifications.getExactAlarmStatus()).toBe('unknown');

    notif.__test.setExactAlarmGranted(true);
    await expect(notifications.refreshExactAlarmStatusAsync()).resolves.toBe('granted');
    expect(notifications.getExactAlarmStatus()).toBe('granted');
    expect(notifications.isExactAlarmGranted()).toBe(true);

    notif.__test.setExactAlarmGranted(false);
    await expect(notifications.refreshExactAlarmStatusAsync()).resolves.toBe('denied');
    expect(notifications.getExactAlarmStatus()).toBe('denied');
    expect(notifications.isExactAlarmGranted()).toBe(false);

    notif.getExactAlarmPermissionsAsync.mockRejectedValueOnce(new Error('unsupported'));
    await expect(notifications.refreshExactAlarmStatusAsync()).resolves.toBe('unknown');
    expect(notifications.getExactAlarmStatus()).toBe('unknown');
    expect(notifications.isExactAlarmGranted()).toBe(false);
  });
});

// ⑨ T72：AppState 回前台时精确闹钟授权翻转 → 全量重排升级
describe('回前台精确闹钟升级（T72）', () => {
  let warnSpy: JestMock;
  beforeEach(() => {
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  });
  afterEach(() => {
    warnSpy.mockRestore();
  });

  /** 初始化（通知权限已授权、精确闹钟未授权）后，窗口内有一条 bestEffort 生日调度 */
  async function initWithBestEffortBirthday(): Promise<Harness> {
    const now = new Date(2025, 6, 1, 8, 0, 0);
    const harness = createHarness(now, {
      persons: [mockMakePerson({ id: 'p1', name: '张伟', birthdayMonth: 7, birthdayDay: 10 })],
      festivalSettings: mockFestivalSettings([
        'new_year',
        'valentines_day',
        'mothers_day',
        'fathers_day',
        'thanksgiving',
        'christmas',
      ]),
    });
    await harness.scheduler.initializeReminders();
    // 初始化产生一条 bestEffort 调度
    expect(scheduledRequests(harness.notif)).toHaveLength(1);
    expect(scheduledRequests(harness.notif)[0].trigger).not.toHaveProperty('delivery');
    return harness;
  }

  it('未授权初始化后回前台，此时已授权：全量重排一次且新 trigger 带 alarmClock', async () => {
    const { notifications, notif, emitAppState } = await initWithBestEffortBirthday();

    // 用户在系统「闹钟和提醒」页授权后回到 App
    notif.__test.setExactAlarmGranted(true);
    emitAppState('active');
    await flushMicrotasks();

    expect(notifications.getExactAlarmStatus()).toBe('granted');
    const requests = scheduledRequests(notif);
    // 初始化一条 + 回前台升级重排一条
    expect(requests).toHaveLength(2);
    expect(requests[1].trigger.delivery).toBe('alarmClock');
    // 重排先取消旧的 bestEffort 通知
    expect(notif.cancelScheduledNotificationAsync).toHaveBeenCalledWith('os-1');
  });

  it('回前台时仍明确未授权（denied）：不重排，仍只有初始化的一条', async () => {
    const { notifications, notif, emitAppState } = await initWithBestEffortBirthday();
    const cancelCountBefore = notif.cancelScheduledNotificationAsync.mock.calls.length;

    emitAppState('active');
    await flushMicrotasks();

    expect(notifications.getExactAlarmStatus()).toBe('denied');
    expect(scheduledRequests(notif)).toHaveLength(1);
    expect(notif.cancelScheduledNotificationAsync.mock.calls.length).toBe(cancelCountBefore);
  });

  it('连续两次 active 且首次刷新 Promise 未 resolve：in-flight 去重，授权翻转后只重排一次', async () => {
    const { notifications, notif, emitAppState } = await initWithBestEffortBirthday();

    // 让精确闹钟查询挂起，模拟第一次 active 的刷新尚未返回；收集全部 resolver，
    // 之后一起 resolve——若无 in-flight 去重，两次 active 会各自完成并各重排一次
    const statusResolvers: ((result: { granted: boolean }) => void)[] = [];
    notif.getExactAlarmPermissionsAsync.mockImplementation(
      () =>
        new Promise<{ granted: boolean }>((resolve) => {
          statusResolvers.push(resolve);
        }),
    );

    emitAppState('active');
    emitAppState('active');
    // 两次 active 都已进入监听器，但查询 Promise 均未 resolve，此时不得有重排
    await flushMicrotasks(10);
    expect(scheduledRequests(notif)).toHaveLength(1);
    // in-flight 去重：第二次 active 直接复用在途刷新，未再发起一次状态查询
    expect(statusResolvers).toHaveLength(1);

    // 用户在系统页授权：两个挂起的等待共享同一次在途刷新，全部 resolve 后只允许一次重排
    statusResolvers.forEach((resolve) => resolve({ granted: true }));
    await flushMicrotasks();

    expect(notifications.getExactAlarmStatus()).toBe('granted');
    // 初始化一条 + 在途刷新完成后的一次升级重排（不是两次）
    expect(scheduledRequests(notif)).toHaveLength(2);
    expect(scheduledRequests(notif)[1].trigger.delivery).toBe('alarmClock');
  });
});
