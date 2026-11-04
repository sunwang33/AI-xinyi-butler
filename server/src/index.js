/**
 * 心意管家 AI 生成网关入口（M12 T57）。
 *
 * 零第三方依赖的 Node HTTP 小服务（Node 18+，全局 fetch），由 Nginx 反代、PM2 单实例常驻。
 * 路由：
 * - GET  /health         存活探针（不限频、不鉴权）
 * - POST /api/generate   祝福 / 礼物生成（JWT 用户或 anon key + IP 限频两通道）
 *
 * 隐私：日志只记录 kind / 日子类型 / 是否有人物 / 通道 / 状态与耗时，
 * 不落姓名、称呼、自称、特征等任何用户内容（沿用 T30 口径）。
 *
 * 结构：createGatewayServer(deps) 只造 server 不监听，便于集成测试注入
 * 假鉴权/限频/上游并起在随机端口；直接运行本文件时才读配置并 listen。
 */
import http from 'node:http';
import { pathToFileURL } from 'node:url';
import { assertConfig, config } from './config.js';
import { createCallerResolver } from './auth.js';
import { createLimiter } from './rateLimit.js';
import { parseBlessings, parseGifts } from './prompt.js';
import { validateRequest } from './types.js';
import { callDeepSeek } from './upstream.js';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-api-key, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

/** 请求体大小上限（入参都是短文本，16KB 足够，挡住异常大包） */
const MAX_BODY_BYTES = 16 * 1024;

function sendJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, { ...CORS_HEADERS, 'Content-Type': 'application/json' });
  res.end(payload);
}

/** 隐私安全日志：只含不含个人信息的维度 */
function auditLog(evt, ctx, extra = {}) {
  console.log(
    JSON.stringify({
      evt,
      channel: ctx?.channel ?? '-',
      kind: ctx?.valid?.kind ?? '-',
      occasionType: ctx?.valid?.occasion?.type ?? '-',
      hasPerson: ctx?.valid?.person ? true : false,
      ...extra,
    }),
  );
}

/**
 * 来源 IP：信任 X-Forwarded-For 第一段。
 * 安全前提：Nginx 必须用 proxy_set_header X-Forwarded-For $remote_addr 覆盖下发，
 * 不追加客户端自带值（见部署配置），此头才不可伪造。
 */
function clientIp(headers, socket) {
  const xff = headers['x-forwarded-for'];
  if (typeof xff === 'string') {
    const first = xff.split(',')[0]?.trim();
    if (first) return first;
  }
  return socket.remoteAddress || 'unknown';
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error('body_too_large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

/**
 * 造网关 server（不监听）。依赖全部可注入：集成测试由此替换鉴权与上游。
 * @param {object} deps
 * @param deps.config 配置（至少含 anonRatePerMin/userRatePerMin）
 * @param deps.resolveCaller 鉴权解析（auth.js 的 createCallerResolver 产物）
 * @param deps.anonLimiter 匿名限频器
 * @param deps.userLimiter 登录用户限频器
 * @param deps.callDeepSeek 上游调用（upstream.js 的 callDeepSeek）
 */
export function createGatewayServer({
  config: cfg,
  resolveCaller,
  anonLimiter,
  userLimiter,
  callDeepSeek: runUpstream,
}) {
  return http.createServer(async (req, res) => {
    // 预检
    if (req.method === 'OPTIONS') {
      res.writeHead(204, CORS_HEADERS);
      res.end();
      return;
    }

    const url = new URL(req.url ?? '/', 'http://localhost');

    // 存活探针
    if (req.method === 'GET' && url.pathname === '/health') {
      sendJson(res, 200, { ok: true });
      return;
    }

    if (url.pathname !== '/api/generate') {
      sendJson(res, 404, { error: { code: 'not_found' } });
      return;
    }
    if (req.method !== 'POST') {
      sendJson(res, 405, { error: { code: 'method_not_allowed' } });
      return;
    }

    const ip = clientIp(req.headers, req.socket);
    const ctx = { channel: '-', valid: null };

    // ① 鉴权：JWT 用户 / anon key 两通道
    const caller = await resolveCaller({
      authorization: req.headers['authorization'],
      apiKey: req.headers['x-api-key'],
      ip,
    });
    if (!caller.ok) {
      auditLog('rejected', ctx, { reason: caller.code, ip });
      sendJson(res, caller.status, { error: { code: caller.code } });
      return;
    }
    ctx.channel = caller.channel;

    // ② 限频：用户按 id、匿名按 IP
    const limiter = caller.channel === 'user' ? userLimiter : anonLimiter;
    if (!limiter.allow(caller.rateKey)) {
      sendJson(res, 429, {
        error: { code: 'rate_limited', message: '请求过于频繁，请稍后再试' },
      });
      return;
    }

    // ③ 读 body + 校验
    let rawBody;
    try {
      rawBody = await readBody(req);
    } catch (err) {
      sendJson(res, 413, { error: { code: err instanceof Error ? err.message : 'body_error' } });
      return;
    }

    let parsed;
    try {
      parsed = JSON.parse(rawBody);
    } catch {
      sendJson(res, 400, { error: { code: 'bad_json' } });
      return;
    }

    try {
      ctx.valid = validateRequest(parsed);
    } catch (err) {
      const reason = err instanceof Error ? err.message : 'bad_request';
      auditLog('rejected', ctx, { reason });
      sendJson(res, 400, { error: { code: 'bad_request', message: reason } });
      return;
    }

    // ④ 调上游并按既有契约返回
    const started = Date.now();
    try {
      const raw = await runUpstream(ctx.valid, cfg);
      if (ctx.valid.kind === 'blessing') {
        const blessings = parseBlessings(raw, ctx.valid.count);
        auditLog('success', ctx, { ms: Date.now() - started, count: blessings.length });
        sendJson(res, 200, { kind: 'blessing', blessings });
        return;
      }
      const gifts = parseGifts(raw);
      auditLog('success', ctx, { ms: Date.now() - started, count: gifts.length });
      sendJson(res, 200, { kind: 'gift', gifts });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'unknown';
      auditLog('failed', ctx, { ms: Date.now() - started, reason: message });
      // 上游故障 / 超时 / 返回不合规一律 502，让客户端计入连续失败
      sendJson(res, 502, { error: { code: 'upstream_failed' } });
    }
  });
}

async function main() {
  assertConfig();

  const server = createGatewayServer({
    config,
    resolveCaller: createCallerResolver(config),
    anonLimiter: createLimiter({ windowMs: 60_000, max: config.anonRatePerMin }),
    userLimiter: createLimiter({ windowMs: 60_000, max: config.userRatePerMin }),
    callDeepSeek,
  });

  server.listen(config.port, '127.0.0.1', () => {
    console.log(
      JSON.stringify({
        evt: 'startup',
        port: config.port,
        anonRatePerMin: config.anonRatePerMin,
        userRatePerMin: config.userRatePerMin,
      }),
    );
  });

  // 容器/PM2 停止时干净退出
  const shutdown = (signal) => {
    console.log(JSON.stringify({ evt: 'shutdown', signal }));
    server.close(() => process.exit(0));
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

// 仅直接运行本文件时启动服务；被测试 import 时不监听端口
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error('网关启动失败：', err.message);
    process.exit(1);
  });
}
