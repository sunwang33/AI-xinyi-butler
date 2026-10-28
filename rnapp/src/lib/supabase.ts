import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Supabase 客户端（T55，2026-10-28 提前实施：邮箱密码登录 + 忘记密码）。
 *
 * 安全说明：anon key 设计上就是公开的（会打进 App 安装包），
 * 数据安全由 Postgres RLS 保证；service_role 密钥绝不能出现在 App 中。
 * 常量需与公网重置页 web/index.html 保持一致（同一项目）。
 */
export const SUPABASE_URL = 'https://wohcvgarvrizbbcepggg.supabase.co';
export const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndvaGN2Z2FydnJpemJiY2VwZ2dnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTMxNzI5NTIsImV4cCI6MjEwODc0ODk1Mn0.OLSxt0C4TUnYPLmSz5YbnqlHUucWmZMsnpDAsPPyPLo';

/**
 * 忘记密码的公网回跳页（GitHub Pages 静态托管，见 web/index.html）。
 * 必须同时登记在 Supabase Dashboard → Authentication → URL Configuration
 * 的 Site URL / Redirect URLs 中，邮件链接才允许回跳到这里。
 */
export const PASSWORD_RESET_PAGE_URL = 'https://sunwang33.github.io/AI-xinyi-butler/';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    // React Native 端用 AsyncStorage 持久化会话，重开 App 不需重复登录
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    // RN 没有 URL hash 会话承接（回跳发生在浏览器网页），必须关闭
    detectSessionInUrl: false,
  },
});
