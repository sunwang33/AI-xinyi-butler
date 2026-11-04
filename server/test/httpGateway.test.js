/**
 * 网关 HTTP 层端到端自测（T57，node --test，零依赖）：
 * 起真实 server 在随机端口，打真实 HTTP 请求——覆盖路由/状态码/CORS/
 * 鉴权→限频→校验→上游→结果解析的完整链路。鉴权与上游均为注入桩，
 * 不访问 Supabase、DeepSeek，也不需要任何密钥。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGatewayServer } from '../src/index.js';
import { createLimiter } from '../src/rateLimit.js';

const ANON_KEY = 'test-anon-key';

const validBlessingBody = {
  kind: 'blessing',
  count: 3,
  occasion: { type: 'birthday' },
  person: { relation: '家人', traits: ['爱喝茶'], salutation: '爸爸', signature: '小明' },
};

/** 鉴权桩：user-token 为有效用户；test-anon-key 为匿名；其余拒绝 */
function stubResolver() {
  return async ({ authorization, apiKey, ip }) => {
    const m = /^Bearer\s+(.+)$/i.exec((authorization ?? '').trim());
    if (m) {
      const token = m[1].trim();
      return token === 'user-token'
        ? { ok: true, channel: 'user', rateKey: 'u:1' }
        : { ok: false, status: 401, code: 'invalid_token' };
    }
    if (apiKey === ANON_KEY) return { ok: true, channel: 'anon', rateKey: `ip:${ip}` };
    return { ok: false, status: 401, code: 'unauthorized' };
  };
}

/** 假 DeepSeek：按契约返回对象（上游模块本应返回 extractJson 后的结果） */
function fakeUpstream(valid) {
  if (valid.kind === 'blessing') {
    return { blessings: Array.from({ length: valid.count }, (_, i) => `祝福 ${i + 1}`) };
  }
  return {
    gifts: Array.from({ length: 6 }, (_, i) => ({
      name: `礼物 ${i + 1}`,
      reason: '适合 TA',
      search_term: `搜索词 ${i + 1}`,
    })),
  };
}

const failingUpstream = async () => {
  throw new Error('upstream_500');
};

/** 起一套全新依赖的 server（限频器每用例重置），返回 base URL */
async function startServer({ upstream = async (v) => fakeUpstream(v), rateMax = 30 } = {}) {
  const server = createGatewayServer({
    config: { anonRatePerMin: rateMax, userRatePerMin: rateMax },
    resolveCaller: stubResolver(),
    anonLimiter: createLimiter({ windowMs: 60_000, max: rateMax }),
    userLimiter: createLimiter({ windowMs: 60_000, max: rateMax }),
    callDeepSeek: upstream,
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  return { server, base: `http://127.0.0.1:${port}` };
}

async function post(base, { headers = {}, body = validBlessingBody } = {}) {
  return fetch(`${base}/api/generate`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

test('GET /health：200 且不鉴权、不限频（限频上限设为 0 也能探活）', async (t) => {
  const { server, base } = await startServer({ rateMax: 0 });
  t.after(() => server.close());

  const resp = await fetch(`${base}/health`);
  assert.equal(resp.status, 200);
  assert.deepEqual(await resp.json(), { ok: true });
});

test('OPTIONS 预检：204 并带 CORS 头', async (t) => {
  const { server, base } = await startServer();
  t.after(() => server.close());

  const resp = await fetch(`${base}/api/generate`, { method: 'OPTIONS' });
  assert.equal(resp.status, 204);
  assert.equal(resp.headers.get('access-control-allow-origin'), '*');
  assert.match(resp.headers.get('access-control-allow-headers') ?? '', /x-api-key/);
});

test('未知路径 404；错误方法 405', async (t) => {
  const { server, base } = await startServer();
  t.after(() => server.close());

  const notFound = await fetch(`${base}/nope`);
  assert.equal(notFound.status, 404);
  assert.equal((await notFound.json()).error.code, 'not_found');

  const method = await fetch(`${base}/api/generate`); // GET
  assert.equal(method.status, 405);
  assert.equal((await method.json()).error.code, 'method_not_allowed');
});

test('无凭证 401 unauthorized；坏 Bearer 401 invalid_token', async (t) => {
  const { server, base } = await startServer();
  t.after(() => server.close());

  const none = await post(base, { headers: {} });
  assert.equal(none.status, 401);
  assert.equal((await none.json()).error.code, 'unauthorized');

  const bad = await post(base, { headers: { authorization: 'Bearer forged' } });
  assert.equal(bad.status, 401);
  assert.equal((await bad.json()).error.code, 'invalid_token');
});

test('匿名通道合法祝福请求：端到端 200，条数等于 count', async (t) => {
  const { server, base } = await startServer();
  t.after(() => server.close());

  const resp = await post(base, { headers: { 'x-api-key': ANON_KEY } });
  assert.equal(resp.status, 200);
  const data = await resp.json();
  assert.equal(data.kind, 'blessing');
  assert.deepEqual(data.blessings, ['祝福 1', '祝福 2', '祝福 3']);
});

test('匿名通道礼物请求：200，6 个礼物三字段齐全', async (t) => {
  const { server, base } = await startServer();
  t.after(() => server.close());

  const resp = await post(base, {
    headers: { 'x-api-key': ANON_KEY },
    body: {
      kind: 'gift', // 礼物契约强制有具体对象（通用版节日不出礼物）
      occasion: { type: 'birthday' },
      person: { relation: '挚友', traits: ['夜跑'], salutation: null, signature: null },
    },
  });
  assert.equal(resp.status, 200);
  const data = await resp.json();
  assert.equal(data.kind, 'gift');
  assert.equal(data.gifts.length, 6);
  assert.ok(data.gifts.every((g) => g.name && g.reason && g.search_term));
});

test('坏 JSON → 400 bad_json；非法入参 → 400 bad_request', async (t) => {
  const { server, base } = await startServer();
  t.after(() => server.close());
  const headers = { 'x-api-key': ANON_KEY };

  const badJson = await post(base, { headers, body: '{not json' });
  assert.equal(badJson.status, 400);
  assert.equal((await badJson.json()).error.code, 'bad_json');

  const badBody = await post(base, { headers, body: { kind: 'poem' } });
  assert.equal(badBody.status, 400);
  assert.equal((await badBody.json()).error.code, 'bad_request');
});

test('匿名限频：上限 2，第 3 次（即便 body 非法也计数）返回 429', async (t) => {
  const { server, base } = await startServer({ rateMax: 2 });
  t.after(() => server.close());
  const headers = { 'x-api-key': ANON_KEY };

  assert.equal((await post(base, { headers })).status, 200);
  assert.equal((await post(base, { headers })).status, 200);
  const limited = await post(base, { headers });
  assert.equal(limited.status, 429);
  assert.equal((await limited.json()).error.code, 'rate_limited');
});

test('上游故障：502 upstream_failed（客户端据此计入连续失败）', async (t) => {
  const { server, base } = await startServer({ upstream: failingUpstream });
  t.after(() => server.close());

  const resp = await post(base, {
    headers: { 'x-api-key': ANON_KEY },
  });
  assert.equal(resp.status, 502);
  assert.equal((await resp.json()).error.code, 'upstream_failed');
});

test('登录用户通道：Bearer 合法即 200（匿名 key 不再参与判定）', async (t) => {
  const { server, base } = await startServer();
  t.after(() => server.close());

  const resp = await post(base, {
    headers: { authorization: 'Bearer user-token' },
  });
  assert.equal(resp.status, 200);
  assert.equal((await resp.json()).kind, 'blessing');
});

test('超过 16KB 的大包被拒（413 或连接被短接，总之拿不到业务响应）', async (t) => {
  const { server, base } = await startServer();
  t.after(() => server.close());

  const huge = JSON.stringify({
    ...validBlessingBody,
    person: { ...validBlessingBody.person, traits: ['x'.repeat(20_000)] },
  });
  let outcome;
  try {
    const resp = await post(base, { headers: { 'x-api-key': ANON_KEY }, body: huge });
    outcome = resp.status;
  } catch {
    outcome = 'connection-reset'; // req.destroy() 可能直接短接，客户端收不到响应
  }
  assert.notEqual(outcome, 200);
});
