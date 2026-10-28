import { useState } from 'react';
import { Keyboard, Pressable, Text, View } from 'react-native';
import { Redirect, useRouter } from 'expo-router';
import { Button, Card, PageHeader, Screen, TextField } from '../src/components';
import { colors, fonts, fontSize, spacing } from '../src/theme/tokens';
import { useAccountStore } from '../src/features/account/authStore';

/**
 * 登录页（plan 3.1 /login；T55，2026-10-28 由 OTP 改为邮箱 + 密码并提前实施）
 *
 * 两种模式：
 * 1. login：邮箱 + 密码登录；
 * 2. forgot：输入邮箱发送重置邮件，用户去邮箱点链接，
 *    在公网重置页（GitHub Pages）设置新密码后回本页用新密码登录。
 * 登录为可选项，未登录不影响任何本机功能。
 */

type Mode = 'login' | 'forgot';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function LoginScreen() {
  const router = useRouter();
  const session = useAccountStore((s) => s.session);
  const ready = useAccountStore((s) => s.ready);
  const signIn = useAccountStore((s) => s.signIn);
  const sendPasswordReset = useAccountStore((s) => s.sendPasswordReset);

  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resetSent, setResetSent] = useState(false);

  // 会话恢复完成且已登录，不允许停留在登录页
  if (ready && session) {
    return <Redirect href="/(tabs)" />;
  }

  const trimmedEmail = email.trim();

  /** 邮箱密码登录 */
  const handleLogin = async () => {
    if (!EMAIL_RE.test(trimmedEmail)) {
      setError('请输入正确的邮箱地址');
      return;
    }
    if (!password) {
      setError('请输入密码');
      return;
    }
    Keyboard.dismiss();
    setBusy(true);
    setError(null);
    try {
      await signIn(trimmedEmail, password);
      router.replace('/(tabs)');
    } catch (e) {
      setError(e instanceof Error ? e.message : '登录失败，请稍后重试');
    } finally {
      setBusy(false);
    }
  };

  /** 发送忘记密码重置邮件 */
  const handleSendReset = async () => {
    if (!EMAIL_RE.test(trimmedEmail)) {
      setError('请输入正确的邮箱地址');
      return;
    }
    Keyboard.dismiss();
    setBusy(true);
    setError(null);
    try {
      await sendPasswordReset(trimmedEmail);
      setResetSent(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : '发送失败，请稍后重试');
    } finally {
      setBusy(false);
    }
  };

  const switchMode = (next: Mode) => {
    setMode(next);
    setError(null);
    setResetSent(false);
  };

  return (
    <Screen scroll>
      <PageHeader
        title={mode === 'login' ? '登录' : '找回密码'}
        onBack={() => (mode === 'forgot' ? switchMode('login') : router.back())}
      />

      <Text
        style={{
          marginTop: spacing.lg,
          marginBottom: spacing.sm,
          fontFamily: fonts.serif,
          fontSize: fontSize.title2,
          color: colors.ink,
        }}
      >
        {mode === 'login' ? '登录心意管家' : '重置登录密码'}
      </Text>
      <Text style={{ marginBottom: spacing.lg, fontSize: fontSize.body, lineHeight: 21, color: colors.inkSoft }}>
        {mode === 'login'
          ? '登录为可选项：未登录也能完整使用全部功能，数据先保存在本机；登录后数据可保存到云端，换机不丢。'
          : '输入注册时使用的邮箱，我们会发送一封重置邮件，按邮件中的链接设置新密码。'}
      </Text>

      <Card>
        {mode === 'forgot' && resetSent ? (
          <View>
            <Text style={{ fontFamily: fonts.serif, fontSize: fontSize.title3, color: colors.pineDeep }}>
              重置邮件已发送
            </Text>
            <Text style={{ marginTop: spacing.sm, fontSize: fontSize.body, lineHeight: 22, color: colors.inkSoft }}>
              若该邮箱已注册，你很快会收到重置邮件。请登录邮箱，点击邮件中的链接，在打开的页面设置新密码；
              完成后回到本页，用新密码登录即可。若没收到，请检查垃圾邮件或稍后重试。
            </Text>
            <Button
              title="返回登录"
              block
              variant="pine"
              style={{ marginTop: spacing.lg }}
              onPress={() => switchMode('login')}
            />
          </View>
        ) : (
          <View>
            <TextField
              label="邮箱"
              value={email}
              onChangeText={setEmail}
              placeholder="you@example.com"
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
              textContentType="emailAddress"
            />

            {mode === 'login' ? (
              <View>
                <TextField
                  label="密码"
                  value={password}
                  onChangeText={setPassword}
                  placeholder="请输入密码"
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                  autoComplete="current-password"
                  textContentType="password"
                  onSubmitEditing={handleLogin}
                  returnKeyType="done"
                />
                <Pressable
                  accessibilityRole="button"
                  hitSlop={8}
                  onPress={() => setShowPassword((v) => !v)}
                  style={{ alignSelf: 'flex-end', marginTop: -8, marginBottom: spacing.sm }}
                >
                  <Text style={{ fontSize: fontSize.footnote, color: colors.pineDeep }}>
                    {showPassword ? '隐藏密码' : '显示密码'}
                  </Text>
                </Pressable>
              </View>
            ) : null}

            {error ? (
              <View
                style={{
                  marginBottom: spacing.md,
                  paddingHorizontal: spacing.md,
                  paddingVertical: 10,
                  borderRadius: 10,
                  backgroundColor: colors.honeyWash,
                }}
              >
                <Text style={{ fontSize: fontSize.body, lineHeight: 19, color: colors.honeyDeep }}>{error}</Text>
              </View>
            ) : null}

            {mode === 'login' ? (
              <>
                <Button title="登录" block loading={busy} onPress={handleLogin} />
                <Pressable
                  accessibilityRole="button"
                  hitSlop={10}
                  disabled={busy}
                  onPress={() => switchMode('forgot')}
                  style={{ alignSelf: 'center', marginTop: spacing.md, padding: spacing.xs }}
                >
                  <Text style={{ fontSize: fontSize.base, color: colors.pineDeep }}>忘记密码？</Text>
                </Pressable>
              </>
            ) : (
              <>
                <Button title="发送重置邮件" block loading={busy} onPress={handleSendReset} />
                <Button
                  title="返回登录"
                  block
                  variant="ghost"
                  disabled={busy}
                  style={{ marginTop: spacing.sm }}
                  onPress={() => switchMode('login')}
                />
              </>
            )}
          </View>
        )}
      </Card>
    </Screen>
  );
}
