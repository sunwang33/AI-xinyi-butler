/**
 * 配置：全部来自环境变量（PM2 ecosystem / .env），代码库不持密钥。
 * 启动时 assertConfig() 校验必需项，缺失直接退出并打印缺哪几项。
 */

export const config = {
  // 默认 3210：主机 3000 已被现有 Next.js 服务占用（2026-11-05 部署实证），网关让路不碰原有服务
  port: Number(process.env.PORT || 3210),
  deepseekEndpoint: process.env.DEEPSEEK_ENDPOINT || 'https://api.deepseek.com/chat/completions',
  deepseekApiKey: process.env.DEEPSEEK_API_KEY || '',
  // 去掉末尾斜杠，避免拼出双斜杠路径
  supabaseUrl: (process.env.SUPABASE_URL || '').replace(/\/+$/, ''),
  supabaseAnonKey: process.env.SUPABASE_ANON_KEY || '',
  anonRatePerMin: Number(process.env.ANON_RATE_PER_MIN || 24),
  userRatePerMin: Number(process.env.USER_RATE_PER_MIN || 30),
  upstreamTimeoutMs: Number(process.env.UPSTREAM_TIMEOUT_MS || 25_000),
};

/** 启动校验：缺关键配置直接退出（不让服务在半残状态下接客） */
export function assertConfig() {
  const missing = [];
  if (!config.deepseekApiKey) missing.push('DEEPSEEK_API_KEY');
  if (!config.supabaseUrl) missing.push('SUPABASE_URL');
  if (!config.supabaseAnonKey) missing.push('SUPABASE_ANON_KEY');
  if (missing.length > 0) {
    throw new Error(`缺少必需环境变量：${missing.join('、')}（见 .env.example）`);
  }
}
