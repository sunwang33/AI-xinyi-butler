/**
 * 通知 payload 防御性解析与点击路由单元测试（T73，M5.6 波次一）。
 *
 * - expo-notifications 手工 mock：抓取 addNotificationResponseReceivedListener
 *   回调模拟热启动点击、用 getLastNotificationResponseAsync 模拟冷启动拉起；
 * - expo-router 手工 mock：断言 router.push 的落地页；
 * - 每个用例经 jest.isolateModules 重置 navigation 模块级单例（监听订阅、
 *   coldStartHandled），互不串扰。
 *
 * 工程未引入生效的 jest 全局类型（同 engine.test.ts 的处理），此处仅声明最小类型。
 *
 * jest.isolateModules 内需按隔离模块注册表同步取得 mock 实例，必须使用 require。
 */
/* eslint-disable @typescript-eslint/no-require-imports */
import type { ReminderItem, ReminderPayload } from './navigation';
import {
  mockCreateExpoNotifications,
  mockCreateExpoRouter,
  type MockExpoNotifications,
} from './remindersTestMocks';

declare const describe: (name: string, fn: () => void) => void;
declare const it: any;
declare const expect: any;
declare const jest: any;
/** @types/jest 未生效时的最小 mock 函数类型别名 */
type JestMock = any;

// jest.mock 工厂只允许引用 mock 前缀的外部变量，故统一由辅助文件构造
jest.mock('expo-notifications', () => mockCreateExpoNotifications());
jest.mock('expo-router', () => mockCreateExpoRouter());

type NavigationModule = typeof import('./navigation');

interface Harness {
  notif: MockExpoNotifications;
  nav: NavigationModule;
  routerPush: JestMock;
}

/** 加载一套全新的 navigation 模块；lastResponse 控制冷启动通知内容 */
function loadNavigation(lastResponse: unknown = null): Harness {
  const harness = {} as Harness;
  jest.isolateModules(() => {
    const notif = require('expo-notifications') as MockExpoNotifications;
    notif.__test.setLastResponse(lastResponse);
    harness.notif = notif;
    harness.routerPush = (require('expo-router') as { router: { push: JestMock } }).router.push;
    harness.nav = require('./navigation') as NavigationModule;
  });
  return harness;
}

/** 等冷启动异步处理（getLastNotificationResponseAsync 为 mock 异步）完成 */
async function flushColdStart(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

function makeItem(init: Partial<ReminderItem> & Pick<ReminderItem, 'occasionType' | 'year'>): ReminderItem {
  return {
    personId: null,
    anniversaryId: null,
    festivalCode: null,
    occasionDate: '2025-03-04',
    title: '生日',
    subjectName: '张伟',
    ...init,
  };
}

function makePayload(items: ReminderItem[], date = '2025-03-01'): ReminderPayload {
  return { date, items };
}

describe('parseReminderData 防御性解析', () => {
  it('buildReminderData 展平后可原样解析回来', () => {
    const { nav } = loadNavigation();
    const payload = makePayload([
      makeItem({
        occasionType: 'birthday',
        personId: 'p1',
        year: 2025,
        occasionDate: '2025-03-04',
      }),
    ]);
    const parsed = nav.parseReminderData(nav.buildReminderData(payload));
    expect(parsed).toEqual(payload);
  });

  it.each([null, undefined, {}, 'x', { date: '2025-03-01' }, { date: 'bad', items: [] }])(
    '结构缺失/date 非法一律返回 null：%j',
    (raw: unknown) => {
      const { nav } = loadNavigation();
      expect(nav.parseReminderData(raw)).toBeNull();
    },
  );

  it('items 内字段非法（未知日子类型/非法节日代号/空标题/日期格式错）返回 null', () => {
    const { nav } = loadNavigation();
    const base = makeItem({ occasionType: 'birthday', personId: 'p1', year: 2025 });
    expect(
      nav.parseReminderData({ date: '2025-03-01', items: [{ ...base, occasionType: 'wedding' }] }),
    ).toBeNull();
    expect(
      nav.parseReminderData({
        date: '2025-03-01',
        items: [makeItem({ occasionType: 'festival', festivalCode: 'spring' as never, year: 2025 })],
      }),
    ).toBeNull();
    expect(
      nav.parseReminderData({
        date: '2025-03-01',
        items: [makeItem({ occasionType: 'birthday', personId: 'p1', year: 2025, title: '   ' })],
      }),
    ).toBeNull();
    expect(
      nav.parseReminderData({
        date: '2025-03-01',
        items: [
          makeItem({ occasionType: 'birthday', personId: 'p1', year: 2025, occasionDate: '2025/03/04' }),
        ],
      }),
    ).toBeNull();
  });

  it('通用节日 subjectName 为 null 合法', () => {
    const { nav } = loadNavigation();
    const parsed = nav.parseReminderData(
      nav.buildReminderData(
        makePayload([
          makeItem({
            occasionType: 'festival',
            festivalCode: 'christmas',
            year: 2025,
            occasionDate: '2025-12-25',
            title: '圣诞节',
            subjectName: null,
          }),
        ]),
      ),
    );
    expect(parsed?.items[0].subjectName).toBeNull();
  });
});

describe('routeForPayload 落地页', () => {
  it('单个生日直达心意详情，query 含 kind/year/personId', () => {
    const { nav } = loadNavigation();
    const route = nav.routeForPayload(
      makePayload([makeItem({ occasionType: 'birthday', personId: 'p1', year: 2025 })]),
    );
    expect(route).toBe('/occasion-detail?kind=birthday&year=2025&personId=p1');
  });

  it('单个纪念日直达心意详情并带 anniversaryId', () => {
    const { nav } = loadNavigation();
    const route = nav.routeForPayload(
      makePayload([
        makeItem({
          occasionType: 'anniversary',
          personId: 'p1',
          anniversaryId: 'ann9',
          year: 2025,
          title: '领证日',
        }),
      ]),
    );
    expect(route).toBe('/occasion-detail?kind=anniversary&year=2025&personId=p1&anniversaryId=ann9');
  });

  it('单个节日直达节日选人页', () => {
    const { nav } = loadNavigation();
    const route = nav.routeForPayload(
      makePayload(
        [
          makeItem({
            occasionType: 'festival',
            festivalCode: 'christmas',
            year: 2025,
            occasionDate: '2025-12-25',
            title: '圣诞节',
          }),
        ],
        '2025-12-22',
      ),
    );
    expect(route).toBe('/festival/christmas/select?year=2025');
  });

  it('多个日子进当日清单页（以送达日为 date）', () => {
    const { nav } = loadNavigation();
    const route = nav.routeForPayload(
      makePayload(
        [
          makeItem({ occasionType: 'birthday', personId: 'p1', year: 2025 }),
          makeItem({ occasionType: 'birthday', personId: 'p2', year: 2025 }),
        ],
        '2025-03-01',
      ),
    );
    expect(route).toBe('/day-list?date=2025-03-01');
  });

  it('0 个日子兜底进当日清单页；单条节日缺代号同样兜底', () => {
    const { nav } = loadNavigation();
    expect(nav.routeForPayload(makePayload([], '2025-03-01'))).toBe('/day-list?date=2025-03-01');
    expect(
      nav.routeForPayload(
        makePayload(
          [makeItem({ occasionType: 'festival', year: 2025, title: '未知节日' })],
          '2025-03-01',
        ),
      ),
    ).toBe('/day-list?date=2025-03-01');
  });
});

describe('通知点击监听（热启动）', () => {
  it('点击单个人员日子：router.push 心意详情', () => {
    const { nav, notif, routerPush } = loadNavigation();
    nav.initializeNotificationNavigation();
    const data = nav.buildReminderData(
      makePayload([makeItem({ occasionType: 'birthday', personId: 'p1', year: 2025 })]),
    );

    notif.__test.emitResponse(data);

    expect(routerPush).toHaveBeenCalledWith(
      '/occasion-detail?kind=birthday&year=2025&personId=p1',
    );
  });

  it('点击节日通知：router.push 节日选人页', () => {
    const { nav, notif, routerPush } = loadNavigation();
    nav.initializeNotificationNavigation();
    const data = nav.buildReminderData(
      makePayload(
        [
          makeItem({
            occasionType: 'festival',
            festivalCode: 'christmas',
            year: 2025,
            occasionDate: '2025-12-25',
            title: '圣诞节',
          }),
        ],
        '2025-12-22',
      ),
    );

    notif.__test.emitResponse(data);

    expect(routerPush).toHaveBeenCalledWith('/festival/christmas/select?year=2025');
  });

  it('点击多日子通知：router.push 当日清单页并携带完整 payload 参数', () => {
    const { nav, notif, routerPush } = loadNavigation();
    nav.initializeNotificationNavigation();
    const payload = makePayload(
      [
        makeItem({
          occasionType: 'birthday',
          personId: 'p1',
          year: 2025,
          occasionDate: '2025-03-04',
        }),
        makeItem({
          occasionType: 'anniversary',
          personId: 'p2',
          anniversaryId: 'ann2',
          year: 2025,
          occasionDate: '2025-03-05',
          title: '领证日',
        }),
      ],
      '2025-03-01',
    );

    notif.__test.emitResponse(nav.buildReminderData(payload));

    expect(routerPush).toHaveBeenCalledTimes(1);
    const arg = routerPush.mock.calls[0][0] as {
      pathname: string;
      params: { date: string; payload: string };
    };
    expect(arg.pathname).toBe('/day-list');
    expect(arg.params.date).toBe('2025-03-01');
    const carried = JSON.parse(arg.params.payload) as ReminderPayload;
    expect(carried.items).toHaveLength(2);
    expect(carried.items.map((item) => item.occasionDate)).toEqual(['2025-03-04', '2025-03-05']);
  });

  it('payload 缺失或非法时不跳转、不抛错', () => {
    const { nav, notif, routerPush } = loadNavigation();
    nav.initializeNotificationNavigation();
    expect(() => {
      notif.__test.emitResponse(null);
      notif.__test.emitResponse({ foo: 1 });
      notif.__test.emitResponse({ date: 'bad', items: [] });
    }).not.toThrow();
    expect(routerPush).not.toHaveBeenCalled();
  });
});

describe('冷启动由通知拉起', () => {
  it('冷启动响应携带单日子 payload：初始化后自动跳转，且全局只处理一次', async () => {
    const response = {
      notification: {
        request: {
          content: {
            data: null as unknown,
          },
        },
      },
    };
    const payload = makePayload(
      [
        makeItem({
          occasionType: 'festival',
          festivalCode: 'new_year',
          year: 2026,
          occasionDate: '2026-01-01',
          title: '元旦',
        }),
      ],
      '2025-12-29',
    );
    response.notification.request.content.data = payload;
    const { nav, notif, routerPush } = loadNavigation(response);

    const subscription = nav.initializeNotificationNavigation();
    await flushColdStart();

    expect(routerPush).toHaveBeenCalledWith('/festival/new_year/select?year=2026');
    expect(routerPush).toHaveBeenCalledTimes(1);
    // 重复初始化不重复注册监听、不重复处理冷启动
    expect(nav.initializeNotificationNavigation()).toBe(subscription);
    await flushColdStart();
    expect(notif.addNotificationResponseReceivedListener).toHaveBeenCalledTimes(1);
    expect(routerPush).toHaveBeenCalledTimes(1);
  });

  it('冷启动无通知响应：不跳转', async () => {
    const { nav, routerPush } = loadNavigation(null);
    nav.initializeNotificationNavigation();
    await flushColdStart();
    expect(routerPush).not.toHaveBeenCalled();
  });

  it('冷启动通知 payload 非法：兜底不跳转不抛错', async () => {
    const response = { notification: { request: { content: { data: { unknown: true } } } } };
    const { nav, routerPush } = loadNavigation(response);
    await expect(
      (async () => {
        nav.initializeNotificationNavigation();
        await flushColdStart();
      })(),
    ).resolves.toBeUndefined();
    expect(routerPush).not.toHaveBeenCalled();
  });
});
