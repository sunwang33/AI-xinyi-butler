/**
 * 调用方鉴权自测（T57，node --test，零依赖）：
 * JWT 双通道解析、60 秒正缓存、匿名 key 校验。用可注入的 fetch 桩，
 * 不发任何真实网络请求。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCallerResolver } from '../src/auth.js';

const config = {
  supabaseUrl: 'https://example.supabase.co',
  supabaseAnonKey: 'anon-key-123',
};

/** 替换全局 fetch 并记录调用；返回桩控制器 */
function stubFetch(impl) {
  const calls = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (url, opts) => {
    calls.push({ url, opts });
    return impl(url, opts);
  };
  return {
    calls,
    restore() {
      globalThis.fetch = original;
    },
  };
}

const jsonResponse = (status, body) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
});

test('有效 Bearer：校验 /auth/v1/user 通过，按 user.id 走用户通道', async (t) => {
  const stub = stubFetch(async () => jsonResponse(200, { id: 'user-abc' }));
  t.after(stub.restore);
  const resolve = createCallerResolver(config);

  const result = await resolve({
    authorization: 'Bearer good.jwt.token',
    apiKey: config.supabaseAnonKey, // 带了也优先走 JWT 通道
    ip: '1.2.3.4',
  });

  assert.deepEqual(result, { ok: true, channel: 'user', rateKey: 'u:user-abc' });
  assert.equal(stub.calls.length, 1);
  assert.equal(stub.calls[0].url, 'https://example.supabase.co/auth/v1/user');
  assert.equal(stub.calls[0].opts.headers.Authorization, 'Bearer good.jwt.token');
  assert.equal(stub.calls[0].opts.headers.apikey, config.supabaseAnonKey);
});

test('Bearer 大小写不敏感且容忍多余空白', async (t) => {
  const stub = stubFetch(async () => jsonResponse(200, { id: 'u1' }));
  t.after(stub.restore);
  const resolve = createCallerResolver(config);

  const result = await resolve({ authorization: '  bearer   tok  ', apiKey: null, ip: 'ip' });
  assert.equal(result.ok, true);
  assert.equal(result.channel, 'user');
  assert.equal(stub.calls[0].opts.headers.Authorization, 'Bearer tok');
});

test('上游返回非 2xx：invalid_token，不写缓存', async (t) => {
  const stub = stubFetch(async () => jsonResponse(401, { msg: 'invalid' }));
  t.after(stub.restore);
  const resolve = createCallerResolver(config);

  const result = await resolve({ authorization: 'Bearer bad', apiKey: null, ip: 'ip' });
  assert.deepEqual(result, { ok: false, status: 401, code: 'invalid_token' });

  // 失败不缓存：再解析一次仍会重新请求上游
  await resolve({ authorization: 'Bearer bad', apiKey: null, ip: 'ip' });
  assert.equal(stub.calls.length, 2);
});

test('上游网络异常或响应无 id：一律按 invalid_token 处理', async (t) => {
  const stub = stubFetch(async () => {
    throw new TypeError('fetch failed');
  });
  t.after(stub.restore);
  const resolve = createCallerResolver(config);
  const result = await resolve({ authorization: 'Bearer x', apiKey: null, ip: 'ip' });
  assert.equal(result.code, 'invalid_token');
});

test('同一 token 60 秒内只校验一次（正缓存命中）', async (t) => {
  const stub = stubFetch(async () => jsonResponse(200, { id: 'cached-user' }));
  t.after(stub.restore);
  const resolve = createCallerResolver(config);

  await resolve({ authorization: 'Bearer same', apiKey: null, ip: 'ip1' });
  const second = await resolve({ authorization: 'Bearer same', apiKey: null, ip: 'ip2' });

  assert.equal(stub.calls.length, 1); // 第二次命中缓存，不再往返上海→首尔
  assert.equal(second.rateKey, 'u:cached-user'); // 限频仍按用户，不随 IP 变
});

test('无 Bearer 但 anon key 正确：匿名通道，按来源 IP 限频', async () => {
  const resolve = createCallerResolver(config);
  const result = await resolve({ authorization: null, apiKey: 'anon-key-123', ip: '9.9.9.9' });
  assert.deepEqual(result, { ok: true, channel: 'anon', rateKey: 'ip:9.9.9.9' });
});

test('无 Bearer 且 key 缺失或错误：401 unauthorized', async () => {
  const resolve = createCallerResolver(config);
  assert.deepEqual(
    await resolve({ authorization: null, apiKey: 'wrong-key', ip: 'ip' }),
    { ok: false, status: 401, code: 'unauthorized' },
  );
  assert.deepEqual(
    await resolve({ authorization: null, apiKey: null, ip: 'ip' }),
    { ok: false, status: 401, code: 'unauthorized' },
  );
});
