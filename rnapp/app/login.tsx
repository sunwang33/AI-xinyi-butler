import { PlaceholderScreen } from '../src/components';

/**
 * 登录页（plan 3.1 /login，阶段 10 / M12 实现）
 * Supabase 邮箱验证码（OTP）登录；登录可选，未登录不影响任何功能。
 * M1 仅占位，设置页账号入口在 M12 前不启用。
 */
export default function LoginScreen() {
  return (
    <PlaceholderScreen
      title="登录心意管家"
      route="/login"
      description="输入邮箱、获取并填写验证码完成登录（Supabase Auth 邮箱 OTP）。登录为可选项，未登录可完整使用全部功能，数据先保存在本机；登录后数据保存到云端，换机登录同一账号后仍在。"
      milestone="M12 · T55 实现（本期仅占位）"
    />
  );
}
