/**
 * 提醒调度重算（T23，spec 第 6 条 / plan 1.4）。
 *
 * 口径：
 * - 一切按设备本地日期与钟点：日期串为本地 YYYY-MM-DD，送达时刻用
 *   new Date(y, m - 1, d, deliveryHour) 构造，不做任何 UTC 换算；
 * - 重算未来 30 天（含今天，引擎 WINDOW_DAYS）内的全部日子，在日子前第 N 天
 *   deliveryHour 点调度一条本地通知；N 取单人覆盖天数或全局默认，节日取全局；
 * - 被关闭的人不调度其生日/纪念日（节日是全局的，不受单人开关影响），
 *   取关的节日（festival_settings.disabled=1，F11）不调度、不补发；送达日早于
 *   今天或等于日子当天（N=0）不调度；
 * - 同一送达时刻的多个日子合并为一条通知，payload 携带当日送达日与全部日子键，
 *   点击路由由 navigation.ts（M5-B）处理；
 * - 每个日子逐行登记 notification_log（scheduled），同一合并通知的多行共享
 *   os_notification_id；已有 delivered/made_up 行的「日子 × 年份」不再调度
 *   （同年去重；重算前 scheduled 行会被整批清除后重建）。
 *
 * T26：冷启动重算前先做一次补发扫描。Android 后台送达 App 无回调，故用系统现存
 * 调度做启发式对账：scheduledAt 已过、但系统调度队列中已无该 id 的行视为已投递
 * （关机后开机 AlarmManager 也会补触发），置 delivered 不重发；id 仍在队列中才是
 * 真正错过（离线/厂商拦截等），距今 ≤24h 且日子仍在今天或未来的补发一次并置
 * made_up；其余错过的不补，随清旧删除，由首页红点兜底。该对账依赖厂商
 * AlarmManager 行为，「系统已投递」为启发式判定，待真机验收（plan 1.4）。
 * 补发每次冷启动至多跑一遍，与重算共用串行锁。
 *
 * T27：设置/档案保存点（M3/M4）调用 rescheduleReminders 即时生效；日子当天用
 * 图标角标提示（不做 disabled 过滤，与首页红点语义一致），回到前台时只刷角标；
 * 用户拒绝通知权限时不调度、不补发，仅刷角标。
 *
 * T68（qa F3 + 调度侧 F11）：冷启动之外的全部重算触发点只经 rescheduleReminders
 * 一个入口，入口处先只读查询权限状态（不弹窗、不 request），未授权则整体短路、
 * 不产生任何 scheduled 日志行；取关节日在正常重算与 T26 补发两处都过滤。
 * 角标依赖 launcher 支持、补发与定时准点依赖国产 Android 后台策略，均待真机验收
 * （plan 1.4），不达标不擅自加 spec 外能力。
 */
import { AppState } from 'react-native';
import { getRepository } from '../../data/repository';
import { registerNotificationCanceller } from '../../data/repository/notificationCanceller';
import type { NotificationLog, OccasionKey } from '../../data/entities';
import { computeHitsInRange, WINDOW_DAYS, type OccasionHit } from '../occasions/engine';
import { setAppBadgeCount } from './badge';
import {
  addReceivedListener,
  cancelScheduledNotification,
  ensureNotificationChannel,
  ensureNotificationPermission,
  getScheduledNotificationIds,
  isExactAlarmGranted,
  isNotificationPermissionGranted,
  presentLocalNotification,
  refreshExactAlarmStatusAsync,
  scheduleLocalNotification,
  setForegroundNotificationHandler,
  type LocalNotificationContent,
} from './notifications';
// payload 结构、data 展平与点击路由由 M5-B 的 navigation.ts 唯一定义
import {
  buildReminderData,
  initializeNotificationNavigation,
  parseReminderData,
  type ReminderItem,
  type ReminderPayload,
} from './navigation';

/** 一个通过全部过滤、等待调度的日子及其送达计划 */
interface PlannedHit extends OccasionHit {
  /** 送达日，本地 YYYY-MM-DD */
  deliveryDate: string;
  /** 送达时刻（送达日的 deliveryHour 点，本地构造） */
  deliveryAt: Date;
  /** 提前天数，即送达日到日子当天的天数差，也是文案中的「还有 N 天」 */
  advanceDays: number;
}

/** Date → 设备本地 YYYY-MM-DD */
function toLocalDateString(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** 本地日期串加减天数（用本地 Date 构造，跨月跨年自动进位） */
function addDaysLocal(value: string, days: number): string {
  const [y, m, d] = value.split('-').map(Number);
  return toLocalDateString(new Date(y, m - 1, d + days));
}

/** 本地日期串在 hour 点的 Date（设备本地口径，不做 UTC 换算） */
function localDateAtHour(value: string, hour: number): Date {
  const [y, m, d] = value.split('-').map(Number);
  return new Date(y, m - 1, d, hour, 0, 0, 0);
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** 两个本地日期串的天数差（a - b），用本地零点构造避免时区漂移 */
function diffLocalDays(a: string, b: string): number {
  const [ay, am, ad] = a.split('-').map(Number);
  const [by, bm, bd] = b.split('-').map(Number);
  return Math.round(
    (new Date(ay, am - 1, ad).getTime() - new Date(by, bm - 1, bd).getTime()) / MS_PER_DAY,
  );
}

/** 「人 × 日子 × 年份」键的稳定序列化，用于命中映射与同年去重查找 */
function occasionKeyString(key: OccasionKey): string {
  return [
    key.occasionType,
    key.personId ?? '',
    key.anniversaryId ?? '',
    key.festivalCode ?? '',
    key.year,
  ].join('|');
}

function isNotNull<T>(value: T | null): value is T {
  return value !== null;
}

/** 从命中结果中抽取「人 × 日子 × 年份」定位键（notification_log 与 payload 共用） */
function toOccasionKey(hit: OccasionHit): OccasionKey {
  return {
    occasionType: hit.occasionType,
    personId: hit.personId ?? null,
    anniversaryId: hit.anniversaryId ?? null,
    festivalCode: hit.festivalCode ?? null,
    year: hit.year,
  };
}

/**
 * 通知正文逐行文案（F5）：每行标注该命中自己的剩余天数（同组 N 可不同）。
 * 人与纪念日为「对象 日子名（还有 N 天）」；节日为「节日名（还有 N 天）」。
 */
function hitLine(hit: PlannedHit): string {
  const name =
    hit.occasionType === 'festival' ? hit.title : `${hit.subjectName ?? ''} ${hit.title}`;
  return `${name}（还有 ${hit.advanceDays} 天）`;
}

/** 命中 → 通知 payload 元素（F2：日子键之外携带日子当天日期、名称与对象，供点击路由使用） */
function toReminderItem(hit: PlannedHit): ReminderItem {
  return {
    occasionType: hit.occasionType,
    personId: hit.personId ?? null,
    anniversaryId: hit.anniversaryId ?? null,
    festivalCode: hit.festivalCode ?? null,
    year: hit.year,
    occasionDate: hit.date,
    title: hit.title,
    subjectName: hit.subjectName,
  };
}

/** 单条通知标题：点明「谁的什么日子、还有几天」；节日必须点明节日名 */
function singleNotificationTitle(hit: PlannedHit): string {
  if (hit.occasionType === 'festival') {
    return `${hit.title}，还有 ${hit.advanceDays} 天`;
  }
  return `${hit.subjectName ?? ''}的${hit.title}，还有 ${hit.advanceDays} 天`;
}

/**
 * 同一送达时刻的合并通知内容（正常调度与 T26 补发共用，保证文案一致）：
 * 单条点明「谁的什么日子、还有几天」（节日点明节日名）；多条标题概括、正文逐条。
 */
function buildGroupContent(group: PlannedHit[]): LocalNotificationContent {
  const payload: ReminderPayload = {
    date: group[0].deliveryDate,
    items: group.map(toReminderItem),
  };
  if (group.length === 1) {
    return {
      title: singleNotificationTitle(group[0]),
      body: '',
      data: buildReminderData(payload),
    };
  }
  return {
    title: `今天有 ${group.length} 个日子要惦记`,
    body: group.map(hitLine).join('\n'),
    data: buildReminderData(payload),
  };
}

/**
 * 重算核心（调用方已持锁）。流程：
 * 1. 读取设置/人员/纪念日/单人覆盖/节日开关，计算未来 30 天命中并过滤；
 * 2. 清除全部 scheduled 日志行对应的系统通知与日志（delivered/made_up 保留）；
 * 3. 同年去重后按送达时刻合并、逐组调度并逐行登记日志。
 */
async function rescheduleLocked(): Promise<void> {
  const repo = await getRepository();
  const [settings, persons, festivalSettings] = await Promise.all([
    repo.getSettings(),
    repo.listPersons(),
    repo.listFestivalSettings(),
  ]);

  // 每人的纪念日一次性取齐（接口按 personId 提供）
  const anniversaries = (
    await Promise.all(persons.map((person) => repo.listAnniversaries(person.id)))
  ).flat();

  // 单人提醒覆盖：null（从未设置）等同跟随全局、未关闭
  const reminderByPerson = new Map(
    await Promise.all(
      persons.map(async (person) => [person.id, await repo.getPersonReminder(person.id)] as const),
    ),
  );
  const disabledPersonIds = new Set(
    [...reminderByPerson.values()]
      .filter((reminder) => reminder?.disabled)
      .map((reminder) => reminder!.personId),
  );
  const disabledFestivals = new Set(
    festivalSettings.filter((item) => item.disabled).map((item) => item.festivalCode),
  );

  const today = toLocalDateString(new Date());
  const to = addDaysLocal(today, WINDOW_DAYS - 1);

  const hits = computeHitsInRange({
    today,
    from: today,
    to,
    persons,
    anniversaries,
  });

  const planned: PlannedHit[] = [];
  for (const hit of hits) {
    // T68/F11：取关节日（festival_settings.disabled=1）不推送。引擎输出暂不区分关注
    // 状态（展示侧过滤归 T66），调度侧在此独立再过滤一层，不依赖引擎是否已过滤。
    if (hit.occasionType === 'festival') {
      if (hit.festivalCode && disabledFestivals.has(hit.festivalCode)) {
        continue;
      }
    } else if (hit.personId && disabledPersonIds.has(hit.personId)) {
      // 被单独关闭的人：生日/纪念日不推送；节日 personId 为空，不受此开关影响
      continue;
    }

    // N：节日与未覆盖的人取全局默认；个人覆盖一旦设置同时作用于其生日与全部纪念日
    const personReminder = hit.personId ? reminderByPerson.get(hit.personId) : null;
    const advanceDays = personReminder?.advanceDays ?? settings.globalAdvanceDays;

    // N=0（日子当天）不调度，当天由首页红点与角标提示（T27）
    if (advanceDays <= 0) {
      continue;
    }
    const deliveryDate = addDaysLocal(hit.date, -advanceDays);
    const deliveryAt = localDateAtHour(deliveryDate, settings.deliveryHour);
    // F3：送达日已过，或就是今天但送达时刻已过（精确到毫秒比较）——不调度，
    // 过去 trigger 不能交给 scheduleNotificationAsync；错过的不补（首页红点兜底）。
    if (deliveryAt.getTime() <= Date.now()) {
      continue;
    }

    // 同年去重：同一「日子 × 年份」唯一（至多一行）；只有终态
    // delivered/made_up 才跳过，残留的 scheduled 行不跳过，稍后随清旧重建。
    const existing = await repo.getNotificationLog(toOccasionKey(hit));
    if (existing && (existing.status === 'delivered' || existing.status === 'made_up')) {
      continue;
    }

    planned.push({
      ...hit,
      deliveryDate,
      deliveryAt,
      advanceDays,
    });
  }

  // ---- 重算先清旧：取消所有 scheduled 系统通知并删除其日志行 ----
  const oldScheduled = await repo.listNotificationLogs({ status: 'scheduled' });
  const oldOsIds = [...new Set(
    oldScheduled
      .map((log) => log.osNotificationId)
      .filter((id): id is string => id != null),
  )];
  for (const id of oldOsIds) {
    try {
      // 通知可能已被系统送达或清除：单条取消失败不阻断整体重算
      await cancelScheduledNotification(id);
    } catch (error) {
      console.warn('[reminders] 取消旧通知失败', id, error);
    }
  }
  for (const log of oldScheduled) {
    await repo.deleteNotificationLog(log.id);
  }

  // ---- 按送达时刻合并：同一刻多条日子只发一条系统通知 ----
  const groups = new Map<string, PlannedHit[]>();
  for (const item of planned) {
    // 送达时刻同刻即同组：送达日 + 整点钟点唯一确定
    const key = `${item.deliveryDate}T${settings.deliveryHour}`;
    const group = groups.get(key);
    if (group) {
      group.push(item);
    } else {
      groups.set(key, [item]);
    }
  }

  const sortedGroups = [...groups.values()].sort(
    (a, b) => a[0].deliveryAt.getTime() - b[0].deliveryAt.getTime(),
  );

  for (const group of sortedGroups) {
    // 单组失败不影响其他组；必须先调度成功拿到系统 id，再逐行登记日志，
    // 任何一步失败都回滚本组半成品（取消已发通知、删除已写日志），不留半截。
    let osNotificationId: string | null = null;
    const insertedLogIds: string[] = [];
    try {
      osNotificationId = await scheduleLocalNotification(
        buildGroupContent(group),
        group[0].deliveryAt,
      );
      // 每个日子逐行登记；同一条合并通知的多行共享 os_notification_id
      for (const hit of group) {
        const log = await repo.insertNotificationLog({
          ...toOccasionKey(hit),
          scheduledAt: hit.deliveryAt.toISOString(),
          osNotificationId,
        });
        insertedLogIds.push(log.id);
      }
    } catch (error) {
      console.warn('[reminders] 单组提醒调度失败，跳过该组', error);
      if (osNotificationId) {
        try {
          await cancelScheduledNotification(osNotificationId);
        } catch (rollbackError) {
          console.warn('[reminders] 回滚已调度通知失败', rollbackError);
        }
      }
      for (const id of insertedLogIds) {
        try {
          await repo.deleteNotificationLog(id);
        } catch (rollbackError) {
          console.warn('[reminders] 回滚半截通知日志失败', id, rollbackError);
        }
      }
    }
  }

  // 重算后顺带刷新今天的图标角标（T27）
  await refreshTodayBadge();
}

/**
 * 模块级串行队列：补发扫描、重算及设置/档案变更触发的重算排队串行执行，
 * 避免并发重算互相取消通知；单次任务失败不中断后续排队。
 */
let taskQueue: Promise<void> = Promise.resolve();

function enqueue(task: () => Promise<void>): Promise<void> {
  const current = taskQueue.then(task);
  taskQueue = current.then(
    () => undefined,
    () => undefined,
  );
  return current;
}

/**
 * T23/T27 入口：按当前设置与档案全量重算未来 30 天提醒。
 *
 * T68 拒权守卫（qa F3）：改全局/单人设置、保存档案、节日关注变更等冷启动之外的
 * 全部重算触发点都汇聚到本入口，故守卫只此一处。入队前只「查询」权限状态、绝不
 * 发起 request（授权弹窗一生一次，只由冷启动的 ensureNotificationPermission 发起）。
 * 未授权/已拒权时整体短路：不调度、不取消或删除任何系统通知与日志、不写新的
 * scheduled 行，仅刷新当天角标（提醒页当天提示与角标是拒权兜底，不依赖权限）；
 * 旧系统调度与旧日志保持原样，授权后的下一次重算会统一清旧重建。冷启动路径已先
 * 查过权限，此处重复查询只读状态、不弹窗。
 */
export async function rescheduleReminders(): Promise<void> {
  const granted = await isNotificationPermissionGranted();
  if (!granted) {
    await refreshTodayBadge();
    return;
  }
  return enqueue(rescheduleLocked);
}

// ---------- T26：关机/离线错过提醒补发一次 ----------

/** 错过提醒只在补发窗口内补：超过 24h 的不再打扰（spec：其余错过不补） */
const CATCHUP_WINDOW_MS = 24 * 60 * 60 * 1000;

/** 每次冷启动至多补发扫描一遍 */
let catchupDone = false;

/**
 * 补发与送达对账扫描（调用方持队列锁，必须排在 rescheduleLocked 清旧之前）。
 * 取 scheduledAt 已过的 scheduled 行，按原 os_notification_id 分组（同一条合并通知
 * 的多行整组处理；无 id 的异常行不参与，随清旧删除），并用系统现存调度集合对账：
 * - id 已不在系统队列：启发式判定系统已投递（后台送达无回调，关机后开机
 *   AlarmManager 也会补触发），整组置 delivered，不重发；
 * - id 仍在队列：真正错过（离线/厂商拦截等），整组未超 24h 补发窗口、且每个日子
 *   仍能在未来 30 天命中（日子 ≥ 今天、人员/纪念日仍在档）才补发一条并置 made_up；
 * - 超窗、日子已过或人已删：保持 scheduled，随随后重算的清旧流程删除，不补推。
 * 注意：「系统已投递」依赖厂商 AlarmManager 行为，是启发式判定，待真机验收（plan 1.4）。
 */
async function runCatchupOnce(): Promise<void> {
  if (catchupDone) {
    return;
  }
  catchupDone = true;

  try {
    const repo = await getRepository();
    const [persons, festivalSettings] = await Promise.all([
      repo.listPersons(),
      repo.listFestivalSettings(),
    ]);
    const anniversaries = (
      await Promise.all(persons.map((person) => repo.listAnniversaries(person.id)))
    ).flat();
    // T68/F11：取关节日连补发也不推；其残留 scheduled 行在命中映射中查不到，
    // 整组不补，随后续重算清旧删除。
    const disabledFestivals = new Set(
      festivalSettings.filter((item) => item.disabled).map((item) => item.festivalCode),
    );
    // T66 qa-f：单人提醒关闭者同样不补发（与正常重算 disabledPersonIds 同口径）
    const reminderByPerson = new Map(
      await Promise.all(
        persons.map(async (person) => [person.id, await repo.getPersonReminder(person.id)] as const),
      ),
    );
    const disabledPersonIds = new Set(
      [...reminderByPerson.values()]
        .filter((reminder) => reminder?.disabled)
        .map((reminder) => reminder!.personId),
    );

    const now = Date.now();
    const today = toLocalDateString(new Date());
    const hits = computeHitsInRange({
      today,
      from: today,
      to: addDaysLocal(today, WINDOW_DAYS - 1),
      persons,
      anniversaries,
    });
    // 区间从今天起，命中映射天然保证「日子日期 ≥ 今天」；取关节日、单人提醒
    // 关闭者的生日/纪念日都不进映射，其残留 scheduled 行查不到命中则整组不补
    const hitByKey = new Map(
      hits
        .filter((hit) => {
          if (hit.occasionType === 'festival') {
            return !(hit.festivalCode != null && disabledFestivals.has(hit.festivalCode));
          }
          return !(hit.personId != null && disabledPersonIds.has(hit.personId));
        })
        .map((hit) => [occasionKeyString(toOccasionKey(hit)), hit]),
    );

    // F1 对账依据：系统中仍排队的调度 id 集合
    const pendingIds = await getScheduledNotificationIds();

    // 只看计划时刻已过的 scheduled 行；无 os_notification_id 的异常行无法对账，跳过
    const overdueLogs = (await repo.listNotificationLogs({ status: 'scheduled' })).filter(
      (log) => {
        const scheduledMs = Date.parse(log.scheduledAt);
        return Number.isFinite(scheduledMs) && scheduledMs < now && log.osNotificationId != null;
      },
    );

    // 同一 os_notification_id 的多行是一条合并通知，整组对账/补发
    const groups = new Map<string, NotificationLog[]>();
    for (const log of overdueLogs) {
      const key = log.osNotificationId as string;
      const group = groups.get(key);
      if (group) {
        group.push(log);
      } else {
        groups.set(key, [log]);
      }
    }

    const deliveredAt = new Date().toISOString();
    for (const [osId, logs] of groups) {
      if (!pendingIds.has(osId)) {
        // 系统队列已无此调度：启发式判定已投递，置 delivered，不重发
        for (const log of logs) {
          await repo.updateNotificationLog(log.id, { status: 'delivered', deliveredAt });
        }
        continue;
      }

      // id 仍在队列（真正错过）：超过 24h 补发窗口则不补，随清旧删除
      const withinWindow = logs.every(
        (log) => now - Date.parse(log.scheduledAt) <= CATCHUP_WINDOW_MS,
      );
      if (!withinWindow) {
        continue;
      }

      // 组内任一键已查不到（人/纪念日删除、日子超出未来窗口）则整组不补
      const members = logs.map((log) => {
        const hit = hitByKey.get(occasionKeyString(log));
        if (!hit) {
          return null;
        }
        // 送达日取该行 scheduledAt 的本地日期；同组同刻，结果一致
        const deliveryDate = toLocalDateString(new Date(log.scheduledAt));
        const item: PlannedHit = {
          ...hit,
          deliveryDate,
          deliveryAt: new Date(log.scheduledAt),
          // 文案与当时调度逐字一致：N=日子与送达日的天数差
          advanceDays: diffLocalDays(hit.date, deliveryDate),
        };
        return { log, item };
      });
      if (!members.every(isNotNull)) {
        continue;
      }

      // F8：补发前必须先取消原调度——否则 Doze 延迟等情况下原通知随后仍可能被
      // 系统触发，与补发一条造成同一天两条（违反同年只一条）。组内共享同一 id，取消一次。
      try {
        await cancelScheduledNotification(osId);
      } catch (error) {
        // 取消失败说明可能已送达或不可取消：不补发，按已投递对账
        console.warn('[reminders] 补发前取消原通知失败，按已投递处理', osId, error);
        for (const member of members) {
          await repo.updateNotificationLog(member.log.id, {
            status: 'delivered',
            deliveredAt,
          });
        }
        continue;
      }

      try {
        // 立即展示一条补发通知（不加补发标识，文案同正常推送）
        await presentLocalNotification(buildGroupContent(members.map((m) => m.item)));
      } catch (error) {
        // 补发失败：原调度已取消，保留 scheduled 状态不变（下轮冷启动再对账），
        // 不写 made_up/delivered，不留半截
        console.warn('[reminders] 补发通知失败，保留 scheduled 待下轮对账', error);
        continue;
      }

      // 补发成功：整组置 made_up；同年去重使该键后续不再被调度
      for (const member of members) {
        await repo.updateNotificationLog(member.log.id, {
          status: 'made_up',
          isMadeUp: true,
          deliveredAt,
        });
      }
    }
  } catch (error) {
    console.error('[reminders] 补发扫描失败', error);
  }
}

// ---------- T27：图标角标与拒权兜底 ----------

/**
 * 按今天的命中数刷新应用图标角标（0 即清除）。
 * F11（T66 qa-a）：取关节日不在提醒页展示，角标同样不计；被单独关闭提醒的人
 * 语义不同——日子仍在提醒页列表，故仍计入角标。角标是拒权时的兜底提示，
 * 权限未授予也照常执行。launcher 不支持角标时底层静默无效，待真机验收。
 */
export async function refreshTodayBadge(): Promise<void> {
  try {
    const repo = await getRepository();
    const [persons, festivalSettings] = await Promise.all([
      repo.listPersons(),
      repo.listFestivalSettings(),
    ]);
    const anniversaries = (
      await Promise.all(persons.map((person) => repo.listAnniversaries(person.id)))
    ).flat();
    const disabledFestivals = festivalSettings
      .filter((item) => item.disabled)
      .map((item) => item.festivalCode);
    const today = toLocalDateString(new Date());
    const hits = computeHitsInRange({
      today,
      from: today,
      to: today,
      persons,
      anniversaries,
      disabledFestivalCodes: disabledFestivals,
    });
    await setAppBadgeCount(hits.length);
  } catch (error) {
    console.warn('[reminders] 角标刷新失败', error);
  }
}

let appStateListenerRegistered = false;

/**
 * 回前台精确闹钟刷新是否在进行中：连续多个 active（系统页返回可能触发多次）
 * 只保留一次刷新，避免并发 enqueue 第二次全量重排（qa F3）。
 */
let exactAlarmForegroundInFlight = false;

/**
 * 回前台时刷新精确闹钟状态（T72）：仅当状态由非 granted 翻转为 granted
 * （用户刚从系统「闹钟和提醒」设置授权回来）时全量重排，让已排通知升级为
 * alarmClock 准点投递；前后值用模块内缓存布尔比对，其余情况不重算，避免耗电。
 * 并发 active 经 in-flight 标记去重；任何异常（含重算失败）只告警，绝不冒泡。
 */
async function refreshExactAlarmOnForeground(): Promise<void> {
  if (exactAlarmForegroundInFlight) {
    return;
  }
  exactAlarmForegroundInFlight = true;
  try {
    const wasGranted = isExactAlarmGranted();
    const status = await refreshExactAlarmStatusAsync();
    if (!wasGranted && status === 'granted') {
      await rescheduleReminders();
    }
  } catch (error) {
    console.warn('[reminders] 回前台刷新精确闹钟状态失败', error);
  } finally {
    exactAlarmForegroundInFlight = false;
  }
}

/**
 * 回到前台时只刷新角标与精确闹钟状态（均不做无条件全量重算，避免耗电）；
 * 模块级只注册一次。定时准点与后台策略待真机验收（plan 1.4）。
 */
function registerAppStateListener(): void {
  if (appStateListenerRegistered) {
    return;
  }
  appStateListenerRegistered = true;
  AppState.addEventListener('change', (state) => {
    if (state === 'active') {
      void refreshTodayBadge();
      void refreshExactAlarmOnForeground();
    }
  });
}

// ---------- F1：前台送达时的 scheduled → delivered 状态流转 ----------

let receivedListenerRegistered = false;

/**
 * 前台收到本 App 通知时（此刻系统送达可观测），把 payload 中当前仍为 scheduled
 * 的日志行批量置 delivered；delivered/made_up 终态行不动。经任务队列串行，
 * 避免与补发扫描/重算并发互相覆盖。
 */
async function markDeliveredByPayload(data: Record<string, unknown>): Promise<void> {
  const payload = parseReminderData(data);
  if (!payload) {
    return;
  }
  const repo = await getRepository();
  const scheduledLogs = await repo.listNotificationLogs({ status: 'scheduled' });
  const deliveredAt = new Date().toISOString();
  for (const item of payload.items) {
    const matched = scheduledLogs.find(
      (log) => occasionKeyString(log) === occasionKeyString(item),
    );
    if (matched) {
      await repo.updateNotificationLog(matched.id, { status: 'delivered', deliveredAt });
    }
  }
}

/** 注册前台送达监听（模块级只注册一次） */
function registerReceivedListener(): void {
  if (receivedListenerRegistered) {
    return;
  }
  receivedListenerRegistered = true;
  addReceivedListener((data) => {
    void enqueue(() => markDeliveredByPayload(data));
  });
}

/**
 * App 启动初始化（在根布局 dbReady 后调用，不阻塞首屏）：
 * 渠道 → 前台处理器 → 数据层取消钩子 → 回前台角标/前台送达监听 → 通知点击路由
 * → 一次性权限申请。授权通过：补发对账扫描（先于重算清旧）→ 重算；
 * 被拒绝：不调度、不补发，仅刷新角标，临近日子由首页红点 + 角标兜底。
 */
export async function initializeReminders(): Promise<void> {
  await ensureNotificationChannel();
  setForegroundNotificationHandler(true);

  // data 层删除人员时经此钩子取消其待送达通知（与 T13 联调，T27）
  registerNotificationCanceller((ids) =>
    Promise.all(ids.map((id) => cancelScheduledNotification(id))).then(() => undefined),
  );

  // 角标与通知权限无关，监听先注册
  registerAppStateListener();
  // 前台送达时及时把 scheduled 行置 delivered，避免被当成错过而重复补发（F1）
  registerReceivedListener();

  // 通知点击路由由 M5-B 的 navigation.ts 提供；其内部异常不应阻断调度初始化
  try {
    await initializeNotificationNavigation();
  } catch (error) {
    console.error('[reminders] 通知点击路由初始化失败', error);
  }

  const granted = await ensureNotificationPermission();
  if (!granted) {
    // T27：拒权不重弹、不调度、不补发；首页红点（T17）+ 图标角标兜底
    await refreshTodayBadge();
    return;
  }

  // T26：补发必须排在重算清旧之前，二者经同一队列串行
  await enqueue(runCatchupOnce);
  await rescheduleReminders();
}
