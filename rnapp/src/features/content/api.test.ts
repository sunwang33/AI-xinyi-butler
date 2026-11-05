/**
 * 内容生成 API 单测（T58 真机联调期补齐，2026-11-05）：
 * 上海网关通道的响应契约、错误分类、鉴权头与 30s 客户端超时兜底。
 * Edge 通道经 supabase-js 封装，其行为由该库自身保证，不在此重复测试。
 */
import { fetchBlessings, fetchGifts } from './api';
import { ContentError, type ContentContext } from './types';

declare const describe: (name: string, fn: () => void) => void;
declare const it: (name: string, fn: () => void) => void;
declare const expect: any;
declare const beforeEach: (fn: () => void) => void;
declare const afterEach: (fn: () => void) => void;
declare const jest: any;

// 固定走上海网关通道，URL/anon key 用测试值，不触碰真实配置
jest.mock('../../lib/gateway', () => ({
  USE_SHANGHAI_GATEWAY: true,
  SHANGHAI_GATEWAY_URL: 'https://test-gateway.local/api/generate',
  SUPABASE_ANON_KEY: 'test-anon-key',
}));

// 鉴权会话可按用例切换：默认匿名（无 session）。
// 变量须 mock 前缀：jest.mock 工厂被提升，只允许引用此前缀的外部变量（jest-hoist 限制）
const mockGetSession = jest.fn(async () => ({ data: { session: null } }));
jest.mock('../../lib/supabase', () => ({
  supabase: { auth: { getSession: (...args: unknown[]) => mockGetSession(...args) } },
}));

const context: ContentContext = {
  occasion: { type: 'birthday' },
  person: { relation: '家人', traits: [], salutation: null, signature: null },
};

/** 造一个标准 Response 桩（jest-expo 环境自带 Response/Headers） */
function jsonResponse(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

// 保存环境原始 fetch，每个用例替换、结束还原，避免污染其他测试文件
const originalFetch = globalThis.fetch;

beforeEach(() => {
  jest.clearAllMocks();
  mockGetSession.mockResolvedValue({ data: { session: null } });
});

afterEach(() => {
  jest.useRealTimers();
  globalThis.fetch = originalFetch;
});

describe('上海网关通道 · 成功与契约', () => {
  it('祝福 200：透传 blessings 并 trim', async () => {
    globalThis.fetch = jest.fn(async () =>
      jsonResponse(200, { kind: 'blessing', blessings: [' 甲 ', '乙'] }),
    ) as any;

    const list = await fetchBlessings(context, 2);
    expect(list).toEqual(['甲', '乙']);

    const [url, init] = (globalThis.fetch as any).mock.calls[0];
    expect(url).toBe('https://test-gateway.local/api/generate');
    expect(init.method).toBe('POST');
    // 匿名通道：带 x-api-key，不带 Authorization
    expect(init.headers['x-api-key']).toBe('test-anon-key');
    expect(init.headers.Authorization).toBeUndefined();
  });

  it('礼物 200：不足 5 个按 bad_response 拒绝', async () => {
    globalThis.fetch = jest.fn(async () =>
      jsonResponse(200, {
        kind: 'gift',
        gifts: [
          { name: '茶', reason: '爱喝', search_term: '茶 礼盒' },
          { name: '靠垫', reason: '腰不好', search_term: '靠垫' },
        ],
      }),
    ) as any;

    await expect(fetchGifts(context)).rejects.toBeInstanceOf(ContentError);
  });

  it('登录态：自动带 Bearer JWT', async () => {
    mockGetSession.mockResolvedValue({ data: { session: { access_token: 'jwt-abc' } } });
    globalThis.fetch = jest.fn(async () =>
      jsonResponse(200, { kind: 'blessing', blessings: ['甲'] }),
    ) as any;

    await fetchBlessings(context, 1);
    const [, init] = (globalThis.fetch as any).mock.calls[0];
    expect(init.headers.Authorization).toBe('Bearer jwt-abc');
    expect(init.headers['x-api-key']).toBe('test-anon-key');
  });
});

describe('上海网关通道 · 错误分类', () => {
  it('429 状态码 → ratelimit', async () => {
    globalThis.fetch = jest.fn(async () =>
      jsonResponse(429, { error: { code: 'rate_limited' } }),
    ) as any;
    await expect(fetchBlessings(context, 1)).rejects.toMatchObject({ reason: 'ratelimit' });
  });

  it('502 → service（计入连续失败与祝福兜底）', async () => {
    globalThis.fetch = jest.fn(async () =>
      jsonResponse(502, { error: { code: 'upstream_failed' } }),
    ) as any;
    await expect(fetchBlessings(context, 1)).rejects.toMatchObject({ reason: 'service' });
  });

  it('fetch 直接拒绝（断网/DNS/TLS）→ network', async () => {
    globalThis.fetch = jest.fn(async () => {
      throw new TypeError('Network request failed');
    }) as any;
    await expect(fetchBlessings(context, 1)).rejects.toMatchObject({ reason: 'network' });
  });

  it('响应体缺 blessings 数组 → bad_response', async () => {
    globalThis.fetch = jest.fn(async () => jsonResponse(200, { kind: 'blessing' })) as any;
    await expect(fetchBlessings(context, 1)).rejects.toBeInstanceOf(ContentError);
  });
});

describe('上海网关通道 · 登录态读取挂起降级（T58 真机抓出的 getSession 卡死）', () => {
  it('getSession 永不返回：5s 后降级匿名，请求照常发出且不带 JWT', async () => {
    jest.useFakeTimers();
    // 模拟 GoTrue 锁等待：getSession 不 resolve 也不 reject
    mockGetSession.mockReturnValue(new Promise(() => {}));
    globalThis.fetch = jest.fn(async () =>
      jsonResponse(200, { kind: 'blessing', blessings: ['甲'] }),
    ) as any;

    const pending = fetchBlessings(context, 1);
    // 推进 5s（SESSION_TIMEOUT_MS），Async 变体排空微任务让降级链路落定
    await jest.advanceTimersByTimeAsync(5_000);
    const list = await pending;

    expect(list).toEqual(['甲']);
    const [, init] = (globalThis.fetch as any).mock.calls[0];
    expect(init.headers.Authorization).toBeUndefined();
    expect(init.headers['x-api-key']).toBe('test-anon-key');
  });

  it('getSession 直接拒绝（auth 域名被墙快速失败）：立即降级匿名，不等 5s', async () => {
    mockGetSession.mockRejectedValue(new Error('AuthRetryableFetchError'));
    globalThis.fetch = jest.fn(async () =>
      jsonResponse(200, { kind: 'blessing', blessings: ['甲'] }),
    ) as any;

    const list = await fetchBlessings(context, 1);
    expect(list).toEqual(['甲']);
    const [, init] = (globalThis.fetch as any).mock.calls[0];
    expect(init.headers.Authorization).toBeUndefined();
  });
});

describe('上海网关通道 · 30s 客户端超时兜底（T58 真机抓出的挂死缺陷）', () => {
  it('上游静默不响应：30s 主动 abort，按 network 失败且请求只发一次', async () => {
    jest.useFakeTimers();
    // 模拟静默丢包：fetch 不 resolve 也不 reject，只监听 abort 信号
    globalThis.fetch = jest.fn(
      (_url: string, init: { signal: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          init.signal.addEventListener('abort', () => {
            const err = new Error('Aborted');
            err.name = 'AbortError';
            reject(err);
          });
        }),
    ) as any;

    const pending = fetchBlessings(context, 3);
    // 先挂拒绝处理器再推进时钟，避免 abort 的 reject 在 handler 附加上前落定
    const rejection = expect(pending).rejects.toMatchObject({ reason: 'network' });
    // 与 api.ts 的 RELAY_TIMEOUT_MS 保持同步；Async 变体在推进时钟间排空微任务，
    // 让 abort→reject→catch 转 ContentError 的链路落定
    await jest.advanceTimersByTimeAsync(30_000);
    await rejection;

    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    // abort 信号确实发出
    const [, init] = (globalThis.fetch as any).mock.calls[0];
    expect(init.signal.aborted).toBe(true);
  });

  it('正常返回后定时器被清理（不残留 open handle）', async () => {
    const clearSpy = jest.spyOn(globalThis, 'clearTimeout');
    globalThis.fetch = jest.fn(async () =>
      jsonResponse(200, { kind: 'blessing', blessings: ['甲'] }),
    ) as any;

    await fetchBlessings(context, 1);
    expect(clearSpy).toHaveBeenCalled();
    clearSpy.mockRestore();
  });
});
