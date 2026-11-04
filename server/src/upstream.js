/**
 * DeepSeek 上游调用（T57 由 Edge callDeepSeek 原样移植：模型参数一字未改）。
 */
import { buildPrompt, extractJson } from './prompt.js';

/**
 * 调用 DeepSeek 并解析出 JSON。
 * 上游非 2xx / 超时 / 空响应 / JSON 非法一律抛错，由调用方统一转 502。
 */
export async function callDeepSeek(valid, config) {
  if (!config.deepseekApiKey) {
    throw new Error('server_misconfigured');
  }
  const { system, user } = buildPrompt(valid.kind, valid);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.upstreamTimeoutMs);
  try {
    const resp = await fetch(config.deepseekEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.deepseekApiKey}`,
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
        max_tokens: valid.kind === 'gift' ? 1800 : 400 + valid.count * 220,
        response_format: { type: 'json_object' },
        stream: false,
      }),
      signal: controller.signal,
    });
    if (!resp.ok) {
      // 不回传上游响应体（可能含调试信息），只带状态码
      throw new Error(`upstream_${resp.status}`);
    }
    const data = await resp.json();
    const text = data.choices?.[0]?.message?.content;
    if (typeof text !== 'string' || text.trim().length === 0) {
      throw new Error('upstream_empty');
    }
    return extractJson(text);
  } finally {
    clearTimeout(timer);
  }
}
