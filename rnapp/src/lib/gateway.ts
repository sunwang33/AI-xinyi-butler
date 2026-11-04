/**
 * 内容生成通道配置（M12 T57，G-NET 回国方案）。
 *
 * 两条通道由 USE_SHANGHAI_GATEWAY 单开关切换，默认仍走 Supabase Edge——
 * 上海主机（备案子域 + Nginx + Node 网关）部署并真机联调通过前，对现有功能零影响；
 * 收口时把开关置 true 即可，App 无需重装依赖。
 *
 * 数据通道（登录/七表 REST）的切换在 supabase.ts：联调反代后把 SUPABASE_URL
 * 改为 https://api.talentspec.top（Nginx 已限路径反代 /auth/v1/、/rest/v1/）。
 */
import { SUPABASE_ANON_KEY } from './supabase';

/** true＝手机→上海备案主机→DeepSeek；false＝Supabase Edge Functions（T30 旧链路回退） */
export const USE_SHANGHAI_GATEWAY = false;

/** 上海主机 AI 生成网关地址（Nginx：/api/generate → 本机 Node 127.0.0.1:3000） */
export const SHANGHAI_GATEWAY_URL = 'https://api.talentspec.top/api/generate';

export { SUPABASE_ANON_KEY };
