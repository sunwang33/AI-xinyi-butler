/**
 * T73 专用：reminders 调度器与通知路由测试的 mock 辅助。
 *
 * 仅被同目录 *.test.ts 引用，App 运行代码不依赖本文件：
 * - mockCreateExpoNotifications：手工版 expo-notifications（自增通知 id、可控制
 *   权限与系统排队集合、可抓取点击/前台监听回调）；
 * - mockCreateMemoryRepository：内存版 DataRepository，返回 scheduler 真正使用的
 *   人员/纪念日/设置/单人覆盖/节日开关/notification_log 假数据。
 */
import type { DataRepository } from '../../data/repository/types';
import type {
  Anniversary,
  AppSettings,
  FestivalCode,
  FestivalSetting,
  NotificationLog,
  NotificationLogCreate,
  NotificationLogPatch,
  NotificationStatus,
  OccasionKey,
  Person,
  PersonReminderSettings,
} from '../../data/entities';
import { FESTIVAL_CODES } from '../../data/entities';

// 工程未引入生效的 jest 全局类型（同 engine.test.ts 的处理），此处仅声明最小类型
declare const jest: any;

/** 权限状态假件（形状对齐 expo-notifications 的 NotificationPermissionsStatus） */
export interface MockPermissionStatus {
  status: 'undetermined' | 'denied' | 'granted';
  granted: boolean;
  canAskAgain: boolean;
}

const GRANTED: MockPermissionStatus = { status: 'granted', granted: true, canAskAgain: true };
const DENIED: MockPermissionStatus = { status: 'denied', granted: false, canAskAgain: false };

type NotificationListener = (notification: {
  request: { content: { data: unknown } };
}) => void;
type ResponseListener = (response: {
  notification: { request: { content: { data: unknown } } };
}) => void;

/**
 * 手工 mock 版 expo-notifications。scheduler 经由 ./notifications、./badge、
 * ./navigation 间接调用的 API 均在此就位；__test 下为用例专用控制句柄。
 */
export function mockCreateExpoNotifications() {
  let sequence = 0;
  /** 当前仍在系统队列中的调度（identifier => 请求体），模拟 cancel/getAll 行为 */
  const queued = new Map<string, { identifier: string; request: unknown }>();
  let permission: MockPermissionStatus = GRANTED;
  // T72 精确闹钟授权状态：默认未授权（trigger 走 bestEffort），用例经句柄改写
  let exactAlarmGranted = false;
  const receivedListeners: NotificationListener[] = [];
  const responseListeners: ResponseListener[] = [];
  let lastResponse: unknown = null;

  const subscription = () => ({ remove: jest.fn() });

  return {
    // notifications.ts 顶部的值导入
    AndroidImportance: { UNKNOWN: 0, NONE: 0, MIN: 1, LOW: 2, DEFAULT: 3, HIGH: 4 },
    SchedulableTriggerInputTypes: { DATE: 'date', CALENDAR: 'calendar' },

    setNotificationChannelAsync: jest.fn(async () => null),
    setNotificationHandler: jest.fn(),
    getPermissionsAsync: jest.fn(async () => permission),
    requestPermissionsAsync: jest.fn(async () => permission),
    // T72 精确闹钟封装：读取可经句柄控制状态，也可在用例中
    // mockResolvedValueOnce / mockRejectedValueOnce 临时制造成功或异常
    getExactAlarmPermissionsAsync: jest.fn(async () => ({ granted: exactAlarmGranted })),
    requestExactAlarmPermissionsAsync: jest.fn(async () => ({ granted: exactAlarmGranted })),

    scheduleNotificationAsync: jest.fn(async (request: unknown) => {
      const id = `os-${++sequence}`;
      queued.set(id, { identifier: id, request });
      return id;
    }),
    cancelScheduledNotificationAsync: jest.fn(async (id: string) => {
      queued.delete(id);
    }),
    cancelAllScheduledNotificationsAsync: jest.fn(async () => {
      queued.clear();
    }),
    getAllScheduledNotificationsAsync: jest.fn(async () =>
      Array.from(queued.values()).map((item) => ({ identifier: item.identifier })),
    ),
    setBadgeCountAsync: jest.fn(async () => true),
    getBadgeCountAsync: jest.fn(async () => 0),
    addNotificationReceivedListener: jest.fn((listener: NotificationListener) => {
      receivedListeners.push(listener);
      return subscription();
    }),
    addNotificationResponseReceivedListener: jest.fn((listener: ResponseListener) => {
      responseListeners.push(listener);
      return subscription();
    }),
    getLastNotificationResponseAsync: jest.fn(async () => lastResponse),

    /** 用例控制句柄（非 expo-notifications API） */
    __test: {
      setPermission(next: MockPermissionStatus): void {
        permission = next;
      },
      /** 设置精确闹钟授权状态（随后 getExactAlarmPermissionsAsync 返回它） */
      setExactAlarmGranted(granted: boolean): void {
        exactAlarmGranted = granted;
      },
      deny(): void {
        permission = DENIED;
      },
      /** 预置一条仍在系统排队中的通知，用于 T26 对账集合 */
      seedQueued(id: string): void {
        queued.set(id, { identifier: id, request: null });
      },
      queuedIds(): string[] {
        return [...queued.keys()];
      },
      setLastResponse(response: unknown): void {
        lastResponse = response;
      },
      /** 模拟热启动点击通知 */
      emitResponse(data: unknown): void {
        for (const listener of responseListeners) {
          listener({ notification: { request: { content: { data } } } });
        }
      },
      /** 模拟前台收到通知 */
      emitReceived(data: unknown): void {
        for (const listener of receivedListeners) {
          listener({ request: { content: { data } } });
        }
      },
    },
  };
}

export type MockExpoNotifications = ReturnType<typeof mockCreateExpoNotifications>;

/** 手工 mock 版 expo-router：只保留用例需要断言的 router.push 等命令式方法 */
export function mockCreateExpoRouter(): unknown {
  return {
    __esModule: true,
    router: {
      push: jest.fn(),
      replace: jest.fn(),
      back: jest.fn(),
    },
  };
}

/** 手工 mock 版 ../../data/repository：getRepository 由用例注入内存假件 */
export function mockCreateRepositoryModule(): unknown {
  return {
    __esModule: true,
    getRepository: jest.fn(),
  };
}

const NOW_TS = '2025-01-01T00:00:00.000Z';

/** 构造最小 Person（业务无关字段给实体默认字面量） */
export function mockMakePerson(init: {
  id?: string;
  name: string;
  birthdayMonth: number;
  birthdayDay: number;
  salutation?: string | null;
}): Person {
  return {
    id: init.id ?? init.name,
    name: init.name,
    relation: '家人',
    birthdayMonth: init.birthdayMonth,
    birthdayDay: init.birthdayDay,
    birthYear: null,
    salutation: init.salutation ?? null,
    signature: null,
    userId: null,
    createdAt: NOW_TS,
    updatedAt: NOW_TS,
    deleted: false,
  };
}

/** 构造最小 Anniversary */
export function mockMakeAnniversary(init: {
  id?: string;
  personId?: string;
  name?: string;
  month: number;
  day: number;
  startYear?: number | null;
}): Anniversary {
  return {
    id: init.id ?? init.name ?? 'a1',
    personId: init.personId ?? 'p1',
    name: init.name ?? '纪念日',
    month: init.month,
    day: init.day,
    startYear: init.startYear ?? null,
    userId: null,
    createdAt: NOW_TS,
    updatedAt: NOW_TS,
    deleted: false,
  };
}

/** 默认设置：全局提前 3 天、9 点送达 */
export function mockMakeSettings(init?: Partial<AppSettings>): AppSettings {
  return {
    id: 1,
    globalAdvanceDays: 3,
    deliveryHour: 9,
    blessingCount: 3,
    aiConsent: 'pending',
    ...init,
  };
}

/** 默认六个节日全部关注；可传入取关代号集合 */
export function mockFestivalSettings(disabledCodes: FestivalCode[] = []): FestivalSetting[] {
  const disabled = new Set<FestivalCode>(disabledCodes);
  return FESTIVAL_CODES.map((festivalCode) => ({
    festivalCode,
    disabled: disabled.has(festivalCode),
  }));
}

/** 内存假件初始化入参 */
export interface MockRepositoryInit {
  settings?: AppSettings;
  persons?: Person[];
  anniversaries?: Anniversary[];
  /** 单人提醒覆盖（默认每人 null，跟随全局） */
  reminders?: PersonReminderSettings[];
  festivalSettings?: FestivalSetting[];
  /** 预置 notification_log（直接给运行数据用） */
  logs?: NotificationLog[];
}

function keyOf(key: OccasionKey): string {
  return [
    key.occasionType,
    key.personId ?? '',
    key.anniversaryId ?? '',
    key.festivalCode ?? '',
    key.year,
  ].join('|');
}

/**
 * 内存版 DataRepository：只实现 scheduler 实际调用的方法，其余通过 unknown
 * 强转为接口（用例不会调用，避免把整接口 30+ 方法都桩一遍）。
 */
export function mockCreateMemoryRepository(init: MockRepositoryInit = {}) {
  const settings = init.settings ?? mockMakeSettings();
  const persons = [...(init.persons ?? [])];
  const anniversaries = [...(init.anniversaries ?? [])];
  const reminders = new Map<string, PersonReminderSettings>(
    (init.reminders ?? []).map((item) => [item.personId, item]),
  );
  const festivalSettings = init.festivalSettings ?? mockFestivalSettings();
  const logs: NotificationLog[] = [...(init.logs ?? [])];
  let logSequence = 0;

  const repo = {
    /** 直接暴露内部状态，供用例预置与断言 */
    logs,

    getSettings: jest.fn(async () => settings),
    listPersons: jest.fn(async () => persons),
    listAnniversaries: jest.fn(async (personId: string) =>
      anniversaries.filter((item) => item.personId === personId),
    ),
    getPersonReminder: jest.fn(async (personId: string) => reminders.get(personId) ?? null),
    listFestivalSettings: jest.fn(async () => festivalSettings),

    insertNotificationLog: jest.fn(async (input: NotificationLogCreate): Promise<NotificationLog> => {
      const row: NotificationLog = {
        id: `log-${++logSequence}`,
        occasionType: input.occasionType,
        personId: input.personId ?? null,
        anniversaryId: input.anniversaryId ?? null,
        festivalCode: input.festivalCode ?? null,
        year: input.year,
        scheduledAt: input.scheduledAt,
        status: input.status ?? 'scheduled',
        isMadeUp: input.isMadeUp ?? false,
        osNotificationId: input.osNotificationId ?? null,
        deliveredAt: null,
        createdAt: NOW_TS,
        updatedAt: NOW_TS,
      };
      logs.push(row);
      return row;
    }),
    getNotificationLog: jest.fn(async (key: OccasionKey): Promise<NotificationLog | null> => {
      const target = keyOf(key);
      return logs.find((log) => keyOf(log) === target) ?? null;
    }),
    listNotificationLogs: jest.fn(
      async (filter?: {
        status?: NotificationStatus | readonly NotificationStatus[];
      }): Promise<NotificationLog[]> => {
        if (!filter?.status) {
          return [...logs];
        }
        const wanted = Array.isArray(filter.status) ? filter.status : [filter.status];
        return logs.filter((log) => wanted.includes(log.status));
      },
    ),
    updateNotificationLog: jest.fn(
      async (id: string, patch: NotificationLogPatch): Promise<NotificationLog> => {
        const row = logs.find((item) => item.id === id);
        if (!row) {
          throw new Error(`内存假件中无通知日志 ${id}`);
        }
        Object.assign(row, patch, { updatedAt: NOW_TS });
        return row;
      },
    ),
    deleteNotificationLog: jest.fn(async (id: string): Promise<void> => {
      const index = logs.findIndex((item) => item.id === id);
      if (index >= 0) {
        logs.splice(index, 1);
      }
    }),
  };

  return repo as unknown as DataRepository & { logs: NotificationLog[] };
}

export type MemoryRepository = ReturnType<typeof mockCreateMemoryRepository>;
