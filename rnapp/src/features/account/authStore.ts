import { create } from 'zustand';
import type { Session } from '@supabase/supabase-js';
import { PASSWORD_RESET_PAGE_URL, supabase } from '../../lib/supabase';

/**
 * 账号状态（T55，2026-10-28 提前实施）。
 * 只管 Supabase Auth 登录态：邮箱密码登录、忘记密码发信、退出。
 * 云端数据表与同步仍在 M12（T54/T56），当前登录态不影响本机数据读写。
 */

type AuthErrorInfo = { message?: string };

/** 把 supabase-js 的英文报错翻译成对用户友好的中文提示 */
function translateError(error: unknown): Error {
  const raw = (error as AuthErrorInfo | null)?.message ?? '';
  if (/network request failed|failed to fetch|network/i.test(raw)) {
    return new Error('网络连接异常，请检查网络后重试');
  }
  if (/invalid login credentials/i.test(raw)) {
    return new Error('邮箱或密码不正确');
  }
  if (/email not confirmed/i.test(raw)) {
    return new Error('该邮箱尚未完成验证，请先查收邮箱中的验证邮件');
  }
  if (/too many requests|rate limit|over.*limit/i.test(raw)) {
    return new Error('请求过于频繁，请稍后再试');
  }
  if (/unable to validate email|invalid email/i.test(raw)) {
    return new Error('邮箱格式不正确');
  }
  if (/for security purposes/i.test(raw)) {
    // Supabase 对重置邮件的频控提示
    return new Error('重置邮件请求过于频繁，请稍后再试');
  }
  if (/user already registered|already been registered/i.test(raw)) {
    return new Error('该邮箱已注册，请直接登录');
  }
  return new Error(raw || '操作失败，请稍后重试');
}

type AccountState = {
  /** 当前登录会话；null 表示未登录 */
  session: Session | null;
  /** 首次从本机存储恢复会话完成前为 false，避免登录页/账号区闪烁误判 */
  ready: boolean;
  /** App 启动时调用一次：恢复会话并订阅登录态变化 */
  initialize: () => void;
  /** 邮箱 + 密码登录；失败时抛出中文 Error */
  signIn: (email: string, password: string) => Promise<void>;
  /** 发送忘记密码重置邮件（回跳到公网重置页）；失败时抛出中文 Error */
  sendPasswordReset: (email: string) => Promise<void>;
  /** 退出登录 */
  signOut: () => Promise<void>;
};

let initialized = false;

export const useAccountStore = create<AccountState>((set) => ({
  session: null,
  ready: false,

  initialize: () => {
    if (initialized) return;
    initialized = true;
    // 从 AsyncStorage 恢复上次登录会话
    supabase.auth
      .getSession()
      .then(({ data }) => set({ session: data.session, ready: true }))
      .catch((error: unknown) => {
        console.error('[auth] 恢复登录态失败', error);
        set({ ready: true });
      });
    // 会话变化（登录 / 退出 / token 自动刷新）随时同步
    supabase.auth.onAuthStateChange((_event, session) => {
      set({ session });
    });
  },

  signIn: async (email, password) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw translateError(error);
  },

  sendPasswordReset: async (email) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: PASSWORD_RESET_PAGE_URL,
    });
    if (error) throw translateError(error);
    // 注意：Supabase 对已注册/未注册邮箱统一返回成功（防账号枚举），
    // 页面提示应表述为「若该邮箱已注册，重置邮件已发送」。
  },

  signOut: async () => {
    const { error } = await supabase.auth.signOut();
    if (error) throw translateError(error);
  },
}));
