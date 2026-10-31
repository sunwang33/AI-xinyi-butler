/**
 * 心意内容生成网关（M6 T30 祝福 / M7 T36 礼物）。
 *
 * - 服务端持有 DEEPSEEK_API_KEY（supabase secrets set，绝不进代码库与客户端）；
 * - 匿名可访问（verify_jwt=true：Supabase 网关先校验 anon/apikey，再进函数），
 *   函数内做按 IP 的基本限频；本期不持久化任何用户数据；
 * - 隐私：日志只记录 kind / 日子类型 / 是否有人物 / 结果状态与耗时，不落姓名、称呼、自称、特征。
 */
import { allow, clientIp } from './rate_limit.ts';
import { buildPrompt, extractJson, parseBlessings, parseGifts } from './prompt.ts';
import { validateRequest, type ValidRequest } from './types.ts';

const DEEPSEEK_ENDPOINT = 'https://api.deepseek.com/chat/completions';
/** 与上游模型通信的超时时间 */
const UPSTREAM_TIMEOUT_MS = 25_000;

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

/** 隐私安全日志：只含不含个人信息的维度 */
function auditLog(
  evt: string,
  req: ValidRequest | null,
  extra: Record<string, string | number | boolean> = {},
): void {
  console.log(
    JSON.stringify({
      evt,
      kind: req?.kind ?? '-',
      occasionType: req?.occasion.type ?? '-',
      hasPerson: req?.person ? true : false,
      ...extra,
    }),
  );
}

async function callDeepSeek(req: ValidRequest): Promise<unknown> {
  const apiKey = Deno.env.get('DEEPSEEK_API_KEY');
  if (!apiKey) {
    throw new Error('server_misconfigured');
  }
  const { system, user } = buildPrompt(req.kind, req);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
  try {
    const resp = await fetch(DEEPSEEK_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        // deepseek-chat 为 DeepSeek 官方稳定别名，供应商侧升级不影响 App
        model: 'deepseek-chat',
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        temperature: 0.8,
        // 祝福按条数缩放（3 条≈1060，10 条封顶 2600）；礼物固定 6 个
        max_tokens: req.kind === 'gift' ? 1800 : 400 + req.count * 220,
        response_format: { type: 'json_object' },
        stream: false,
      }),
      signal: controller.signal,
    });
    if (!resp.ok) {
      // 不回传上游响应体（可能含调试信息），只带状态码
      throw new Error(`upstream_${resp.status}`);
    }
    const data = (await resp.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const text = data.choices?.[0]?.message?.content;
    if (typeof text !== 'string' || text.trim().length === 0) {
      throw new Error('upstream_empty');
    }
    return extractJson(text);
  } finally {
    clearTimeout(timer);
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }
  if (req.method !== 'POST') {
    return jsonResponse(405, { error: { code: 'method_not_allowed' } });
  }

  const ip = clientIp(req);
  if (!allow(ip)) {
    return jsonResponse(429, { error: { code: 'rate_limited', message: '请求过于频繁，请稍后再试' } });
  }

  let parsed: unknown;
  try {
    parsed = await req.json();
  } catch {
    return jsonResponse(400, { error: { code: 'bad_json' } });
  }

  let valid: ValidRequest;
  try {
    valid = validateRequest(parsed);
  } catch (err) {
    auditLog('rejected', null, { reason: (err as Error).message });
    return jsonResponse(400, { error: { code: 'bad_request', message: (err as Error).message } });
  }

  const started = Date.now();
  try {
    const raw = await callDeepSeek(valid);
    if (valid.kind === 'blessing') {
      const blessings = parseBlessings(raw, valid.count);
      auditLog('success', valid, { ms: Date.now() - started, count: blessings.length });
      return jsonResponse(200, { kind: 'blessing', blessings });
    }
    const gifts = parseGifts(raw);
    auditLog('success', valid, { ms: Date.now() - started, count: gifts.length });
    return jsonResponse(200, { kind: 'gift', gifts });
  } catch (err) {
    const message = (err as Error).message ?? 'unknown';
    auditLog('failed', valid, { ms: Date.now() - started, reason: message });
    // 上游故障 / 超时 / 返回不合规一律 502，让客户端计入连续失败
    return jsonResponse(502, { error: { code: 'upstream_failed' } });
  }
});
