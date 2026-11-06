/**
 * 首登静默合并编排单测（T58 真机抓出的三缺陷回归）。
 *
 * 本机侧跑真实 node:sqlite 内存库（真实 schema/唯一索引/外键），云端侧用
 * 链式 builder 桩模拟 PostgREST，覆盖：
 * - 缺陷 A：业务键异 id 冲突不再盲插 409，改 PATCH + 本机 id 收敛；
 * - 缺陷 B：单表失败不炸断整链，pullAll 照常执行；
 * - 缺陷 C：只按成功行 id 精确 claim，失败表匿名行保持 NULL 可重试。
 * 注意：不要加 @jest-environment node 注解——jest-expo SDK58 在纯 node 环境
 * 会触发 expo/winter 懒全局的 require 作用域错误；默认环境已支持 node:sqlite。
 * 工程未引入 @types/jest，此处仅声明最小测试全局类型。
 */
import { openTestDb } from '../data/repository/sqlite/sqliteTestDb';

declare const describe: (name: string, fn: () => void) => void;
declare const beforeEach: (fn: () => void) => void;
declare const it: (name: string, fn: () => void) => void;
declare const expect: any;
declare const jest: any;

const T1 = '2026-11-01T00:00:00.000Z';
const T2 = '2026-11-02T00:00:00.000Z';

// 依赖链 rows.ts → shared.ts 引用 expo-crypto，node 环境下用确定性桩替代
jest.mock('expo-crypto', () => {
  let n = 0;
  return { randomUUID: () => `test-uuid-${++n}` };
});

// ---------- 云端桩：记录请求并按用例预置回包 ----------

interface CloudRequest {
  table: string;
  kind?: 'in' | 'maybeSingle' | 'upsert' | 'update';
  filters: { col: string; val: unknown }[];
  rows?: unknown;
  payload?: unknown;
  opts?: unknown;
}

const mockCalls: CloudRequest[] = [];
const mockUpserts: CloudRequest[] = [];
const mockUpdates: CloudRequest[] = [];
// 按表预置：主键 in 查重回包 / 业务键 maybeSingle 回包 / 强制报错
const mockById: Record<string, unknown[]> = {};
const mockByKey: Record<string, unknown> = {};
const mockErrorTables = new Set<string>();
let mockDb: any;

function makeBuilder(table: string): any {
  const req: CloudRequest = { table, filters: [] };
  const builder: any = {
    select(cols: string) {
      req.filters.push({ col: '__select__', val: cols });
      return builder;
    },
    eq(col: string, val: unknown) {
      req.filters.push({ col, val });
      return builder;
    },
    is(col: string, val: unknown) {
      req.filters.push({ col, val });
      return builder;
    },
    in(col: string, vals: unknown[]) {
      req.kind = 'in';
      req.filters.push({ col, val: vals });
      return builder;
    },
    limit() {
      return builder;
    },
    maybeSingle() {
      req.kind = 'maybeSingle';
      return builder;
    },
    upsert(rows: unknown, opts: unknown) {
      req.kind = 'upsert';
      req.rows = rows;
      req.opts = opts;
      return builder;
    },
    update(payload: unknown) {
      req.kind = 'update';
      req.payload = payload;
      return builder;
    },
    // supabase-js 的查询构造器是 PromiseLike：await 时在此统一回包
    then(onFulfilled: (value: unknown) => unknown) {
      mockCalls.push(req);
      let result: { data: unknown; error: unknown };
      if (mockErrorTables.has(table)) {
        result = { data: null, error: { message: 'mock 云端故障', code: '23505' } };
      } else if (req.kind === 'in') {
        result = { data: mockById[table] ?? [], error: null };
      } else if (req.kind === 'maybeSingle') {
        result = { data: mockByKey[table] ?? null, error: null };
      } else if (req.kind === 'upsert') {
        mockUpserts.push(req);
        result = { data: null, error: null };
      } else if (req.kind === 'update') {
        mockUpdates.push(req);
        result = { data: null, error: null };
      } else {
        // pullAll 的 select *：默认空，不拉任何远端行
        result = { data: [], error: null };
      }
      return Promise.resolve(result).then(onFulfilled);
    },
  };
  return builder;
}

const mockSupabase = {
  auth: {
    getSession: async () => ({ data: { session: null } }),
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
  },
  from: (table: string) => makeBuilder(table),
};

jest.mock('./supabase', () => ({
  supabase: mockSupabase,
  PASSWORD_RESET_PAGE_URL: 'https://example.test/reset',
}));
jest.mock('./network', () => ({
  useNetworkStore: { getState: () => ({ online: true }) },
}));
jest.mock('../features/account/authStore', () => ({
  useAccountStore: { getState: () => ({ session: { user: { id: 'mock-user' } } }) },
}));
jest.mock('../data/db', () => ({
  getDatabase: async () => mockDb,
}));
jest.mock('../data/repository/notificationCanceller', () => ({
  getNotificationCanceller: () => async () => undefined,
}));
jest.mock('../data/repository/registry', () => ({
  resetCloudRepositories: () => undefined,
}));
jest.mock('../data/repository/supabase/SupabaseRepository', () => ({
  setSupabasePostWriteHook: () => undefined,
}));

// 懒加载被测模块：静态 import 会先于下方 mockSupabase/mockDb 常量求值，
// 导致 mock 工厂闭包拿到 undefined；require 确保 jest.mock 与桩对象都就绪后再加载 sync
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { firstSyncForUser } = require('./sync');

// ---------- 测试数据造数 ----------

async function insertAnonymousPerson(id: string, name: string, updatedAt: string): Promise<void> {
  await mockDb.runAsync(
    `INSERT INTO persons (id, name, relation, birthday_month, birthday_day, birth_year,
       salutation, signature, user_id, created_at, updated_at, deleted)
     VALUES (?, ?, '挚友', 1, 1, NULL, NULL, NULL, NULL, ?, ?, 0)`,
    id,
    name,
    updatedAt,
    updatedAt,
  );
}

async function insertAnonymousSnapshot(
  id: string,
  updatedAt: string,
  opts: { personId?: string; year?: number } = {},
): Promise<void> {
  await mockDb.runAsync(
    `INSERT INTO content_snapshots (id, person_id, occasion_type, anniversary_id, festival_code,
       year, blessings, gifts, status, fail_count, generated_at, user_id, created_at, updated_at, deleted)
     VALUES (?, ?, 'birthday', NULL, NULL, ?, NULL, NULL, 'success', 0, NULL, NULL, ?, ?, 0)`,
    id,
    opts.personId ?? null,
    opts.year ?? 2026,
    updatedAt,
    updatedAt,
  );
}

describe('firstSyncForUser 首登静默合并（T58 三缺陷回归）', () => {
  beforeEach(async () => {
    mockDb = await openTestDb();
    mockCalls.length = 0;
    mockUpserts.length = 0;
    mockUpdates.length = 0;
    for (const key of Object.keys(mockById)) delete mockById[key];
    for (const key of Object.keys(mockByKey)) delete mockByKey[key];
    mockErrorTables.clear();
  });

  it('缺陷A：业务键异 id 冲突且云端较新 → 不上传，本机 id 收敛为云端 id 并 claim', async () => {
    await insertAnonymousSnapshot('snap-local', T1);
    // 主键查重无同 id 行；业务键查到异 id 的云端行（更新）
    mockByKey.content_snapshots = { id: 'snap-cloud', updated_at: T2, deleted: false };

    await firstSyncForUser('user-a');

    expect(mockUpserts.filter((c) => c.table === 'content_snapshots')).toHaveLength(0);
    expect(mockUpdates.filter((c) => c.table === 'content_snapshots')).toHaveLength(0);
    const row = await mockDb.getFirstAsync(
      'SELECT id, user_id FROM content_snapshots WHERE person_id IS NULL AND year = 2026',
    );
    expect(row.id).toBe('snap-cloud');
    expect(row.user_id).toBe('user-a');
  });

  it('缺陷A：业务键异 id 冲突且本机较新 → PATCH 云端既有行（非 upsert），本机 id 收敛', async () => {
    await insertAnonymousSnapshot('snap-local', T2);
    mockByKey.content_snapshots = { id: 'snap-cloud', updated_at: T1, deleted: false };

    await firstSyncForUser('user-b');

    const patchReqs = mockUpdates.filter((c) => c.table === 'content_snapshots');
    expect(patchReqs).toHaveLength(1);
    expect(patchReqs[0].filters).toContainEqual({ col: 'id', val: 'snap-cloud' });
    expect(mockUpserts.filter((c) => c.table === 'content_snapshots')).toHaveLength(0);
    const row = await mockDb.getFirstAsync('SELECT id, user_id FROM content_snapshots');
    expect(row.id).toBe('snap-cloud');
    expect(row.user_id).toBe('user-b');
  });

  it('同 id 云端较新（persons 场景）→ 跳过上传但精确 claim，UI 立即可见', async () => {
    await insertAnonymousPerson('p1', '妈妈', T1);
    mockById.persons = [{ id: 'p1', updated_at: T2, deleted: false }];

    await firstSyncForUser('user-c');

    expect(mockUpserts.filter((c) => c.table === 'persons')).toHaveLength(0);
    const row = await mockDb.getFirstAsync('SELECT id, user_id FROM persons WHERE id = ?', 'p1');
    expect(row.user_id).toBe('user-c');
  });

  it('无冲突的匿名行 → 走 onConflict=id 的 upsert 并 claim', async () => {
    // traits.person_id 有外键约束，先造父行人
    await insertAnonymousPerson('p1', '妈妈', T1);
    await mockDb.runAsync(
      `INSERT INTO traits (id, person_id, content, position, user_id, created_at, updated_at, deleted)
       VALUES ('t1', 'p1', '爱吃辣', 0, NULL, ?, ?, 0)`,
      T1,
      T1,
    );

    await firstSyncForUser('user-d');

    const upsertReqs = mockUpserts.filter((c) => c.table === 'traits');
    expect(upsertReqs).toHaveLength(1);
    expect(upsertReqs[0].opts).toEqual({ onConflict: 'id' });
    const row = await mockDb.getFirstAsync('SELECT user_id FROM traits WHERE id = ?', 't1');
    expect(row.user_id).toBe('user-d');
  });

  it('缺陷B/C：单表合并失败不炸链，失败表保持匿名，pullAll 仍执行；承诺永远 resolve 但清缓存可重试', async () => {
    await insertAnonymousPerson('p1', '测试同事', T1);
    await insertAnonymousSnapshot('snap-local', T1);
    // content_snapshots 所有云端请求都报错
    mockErrorTables.add('content_snapshots');

    // 生产契约：首登承诺永远 resolve（登录页靠它消除登录后数据空窗），失败只记录不炸调用方
    await firstSyncForUser('user-e');

    // persons 不受影响，成功 claim
    const person = await mockDb.getFirstAsync('SELECT user_id FROM persons WHERE id = ?', 'p1');
    expect(person.user_id).toBe('user-e');
    // 失败表匿名行保持 NULL，下次首登仍可被 listAnonymousRows 读到
    const snapshot = await mockDb.getFirstAsync('SELECT user_id FROM content_snapshots');
    expect(snapshot.user_id).toBeNull();
    // pullAll 仍对七表发起 select * 拉取（合并失败没有挡住拉取阶段）
    const pullCalls = mockCalls.filter(
      (c) =>
        c.kind === undefined &&
        c.filters.some((f) => f.col === '__select__' && f.val === '*'),
    );
    expect(pullCalls.length).toBeGreaterThanOrEqual(7);

    // 重试语义：失败应清除 firstSyncs 缓存。再次调用必须重跑合并 job——
    // 失败表再发云端请求；若缓存未清会直接返回旧承诺，零新请求
    const attemptsBefore = mockCalls.filter((c) => c.table === 'content_snapshots').length;
    expect(attemptsBefore).toBeGreaterThan(0);
    await firstSyncForUser('user-e');
    const attemptsAfter = mockCalls.filter((c) => c.table === 'content_snapshots').length;
    expect(attemptsAfter).toBeGreaterThan(attemptsBefore);
  });

  it('真机回归：匿名行与已拉回的账号行同业务键共存（user_id 领先索引允许）→ 删冗余不抛错', async () => {
    // 模拟真机现场：pullAll 已拉回云端行（带账号 id），匿名空间还残留同业务键行。
    // 本机唯一索引 user_id 领先，(NULL,K) 与 (uid,K) 索引键不同，两行可共存。
    await mockDb.runAsync(
      `INSERT INTO content_snapshots (id, person_id, occasion_type, anniversary_id, festival_code,
         year, blessings, gifts, status, fail_count, generated_at, user_id, created_at, updated_at, deleted)
       VALUES ('snap-cloud', NULL, 'birthday', NULL, NULL, 2026, NULL, NULL, 'success', 0, NULL,
         'user-g', ?, ?, 0)`,
      T2,
      T2,
    );
    await insertAnonymousSnapshot('snap-local', T1);
    mockByKey.content_snapshots = { id: 'snap-cloud', updated_at: T2, deleted: false };

    await firstSyncForUser('user-g');

    // 匿名冗余行被物理删除，云端 id 行保留，全程无异常、无盲插 upsert
    const rows: { id: string; user_id: string | null }[] = await mockDb.getAllAsync(
      'SELECT id, user_id FROM content_snapshots',
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe('snap-cloud');
    expect(rows[0].user_id).toBe('user-g');
    expect(mockUpserts.filter((c) => c.table === 'content_snapshots')).toHaveLength(0);
  });

  it('真机回归：冗余匿名行比云端新 → 先 PATCH 云端再删本机冗余，内容不丢', async () => {
    await mockDb.runAsync(
      `INSERT INTO content_snapshots (id, person_id, occasion_type, anniversary_id, festival_code,
         year, blessings, gifts, status, fail_count, generated_at, user_id, created_at, updated_at, deleted)
       VALUES ('snap-cloud', NULL, 'birthday', NULL, NULL, 2026, NULL, NULL, 'success', 0, NULL,
         'user-h', ?, ?, 0)`,
      T1,
      T1,
    );
    // 匿名行更新时间更晚（T2 > T1）
    await insertAnonymousSnapshot('snap-local', T2);
    mockByKey.content_snapshots = { id: 'snap-cloud', updated_at: T1, deleted: false };

    await firstSyncForUser('user-h');

    const patchReqs = mockUpdates.filter((c) => c.table === 'content_snapshots');
    expect(patchReqs).toHaveLength(1);
    expect(patchReqs[0].filters).toContainEqual({ col: 'id', val: 'snap-cloud' });
    const rows = await mockDb.getAllAsync('SELECT id FROM content_snapshots');
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe('snap-cloud');
  });

  it('sent_records 业务键查询额外带 kind 过滤', async () => {
    // sent_records.person_id 有外键约束，先造父行人
    await insertAnonymousPerson('p1', '妈妈', T1);
    await mockDb.runAsync(
      `INSERT INTO sent_records (id, person_id, occasion_type, anniversary_id, festival_code,
         year, kind, payload, marked_at, user_id, created_at, updated_at, deleted)
       VALUES ('s1', 'p1', 'birthday', NULL, NULL, 2026, 'blessing', '{}', ?, NULL, ?, ?, 0)`,
      T1,
      T1,
      T1,
    );
    mockByKey.sent_records = { id: 's-cloud', updated_at: T2, deleted: false };

    await firstSyncForUser('user-f');

    const keyQuery = mockCalls.find(
      (c) => c.table === 'sent_records' && c.kind === 'maybeSingle',
    );
    expect(keyQuery).toBeTruthy();
    expect(keyQuery!.filters).toContainEqual({ col: 'kind', val: 'blessing' });
    const row = await mockDb.getFirstAsync('SELECT id, user_id FROM sent_records');
    expect(row.id).toBe('s-cloud');
    expect(row.user_id).toBe('user-f');
  });
});
