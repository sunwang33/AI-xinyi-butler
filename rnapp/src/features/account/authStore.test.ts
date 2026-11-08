/**
 * 账号 store 单测（T58 冷启动竞态修复期补齐，2026-11-08）：
 * 重点覆盖 initialize 的 ready 门控与 5s 兜底超时——getSession 挂起时
 * 先按未登录放行（ready=true、session=null），会话晚到由 onAuthStateChange 接回；
 * 顺带覆盖登录/重置邮件的中文错误翻译。
 */
declare const describe: (name: string, fn: () => void) => void;
declare const it: (name: string, fn: () => void) => void;
declare const expect: any;
declare const beforeEach: (fn: () => void) => void;
declare const afterEach: (fn: () => void) => void;
declare const jest: any;

// mock 前缀变量：jest.mock 工厂被提升，只允许引用此前缀的外部变量（jest-hoist 限制）
const mockGetSession = jest.fn();
const mockOnAuthStateChange = jest.fn();
const mockSignInWithPassword = jest.fn();
const mockResetPasswordForEmail = jest.fn();

jest.mock('../../lib/supabase', () => ({
  PASSWORD_RESET_PAGE_URL: 'https://test.local/reset',
  supabase: {
    auth: {
      getSession: (...args: unknown[]) => mockGetSession(...args),
      onAuthStateChange: (...args: unknown[]) => mockOnAuthStateChange(...args),
      signInWithPassword: (...args: unknown[]) => mockSignInWithPassword(...args),
      resetPasswordForEmail: (...args: unknown[]) => mockResetPasswordForEmail(...args),
    },
  },
}));

const fakeSession = { user: { id: 'user-a' }, access_token: 'jwt-a' } as any;

/**
 * 重新加载被测模块：authStore 用模块级 initialized 标志保证 initialize 幂等，
 * 每个用例 resetModules 后懒 require，拿到全新 store 与标志位
 */
async function loadStore() {
  jest.resetModules();
  // 懒 require：配合 resetModules 每个用例重新加载，拿到全新模块级 initialized 标志
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mod = await Promise.resolve().then(() => require('./authStore'));
  return mod.useAccountStore;
}

/** 排空 Promise.race 链条上的微任务，再读 store 状态 */
async function flushMicrotasks() {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

beforeEach(() => {
  jest.clearAllMocks();
  mockGetSession.mockResolvedValue({ data: { session: null } });
});

afterEach(() => {
  jest.useRealTimers();
});

describe('initialize · 会话恢复与 ready 门控', () => {
  it('getSession 返回会话：ready 转 true 且 session 透传', async () => {
    mockGetSession.mockResolvedValue({ data: { session: fakeSession } });
    const store = await loadStore();

    expect(store.getState().ready).toBe(false);
    store.getState().initialize();
    await flushMicrotasks();

    expect(store.getState().ready).toBe(true);
    expect(store.getState().session).toEqual(fakeSession);
  });

  it('getSession 返回 null（未登录）：ready 转 true、session 为 null', async () => {
    const store = await loadStore();
    store.getState().initialize();
    await flushMicrotasks();

    expect(store.getState().ready).toBe(true);
    expect(store.getState().session).toBeNull();
  });

  it('getSession reject：不抛出，ready 仍转 true，首屏不卡死', async () => {
    mockGetSession.mockRejectedValue(new Error('Network request failed'));
    const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const store = await loadStore();

    store.getState().initialize();
    await flushMicrotasks();

    expect(store.getState().ready).toBe(true);
    expect(store.getState().session).toBeNull();
    errSpy.mockRestore();
  });

  it('getSession 挂起：5s 兜底超时后按未登录放行并告警', async () => {
    jest.useFakeTimers();
    // 永不 settle 的 Promise，模拟被墙域名内部锁挂起
    mockGetSession.mockReturnValue(new Promise(() => {}));
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const store = await loadStore();

    store.getState().initialize();
    expect(store.getState().ready).toBe(false);

    await jest.advanceTimersByTimeAsync(5000);

    expect(store.getState().ready).toBe(true);
    expect(store.getState().session).toBeNull();
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('超时'));
    warnSpy.mockRestore();
  });

  it('兜底放行后会话晚到：onAuthStateChange 回调把 session 接回', async () => {
    let authListener: ((event: string, session: unknown) => void) | undefined;
    mockOnAuthStateChange.mockImplementation((cb: (event: string, session: unknown) => void) => {
      authListener = cb;
    });
    const store = await loadStore();
    store.getState().initialize();
    await flushMicrotasks();
    expect(store.getState().session).toBeNull();

    authListener?.('SIGNED_IN', fakeSession);
    expect(store.getState().session).toEqual(fakeSession);
  });

  it('initialize 幂等：重复调用只恢复一次会话', async () => {
    const store = await loadStore();
    store.getState().initialize();
    store.getState().initialize();
    await flushMicrotasks();

    expect(mockGetSession).toHaveBeenCalledTimes(1);
  });
});

describe('signIn · 登录与中文报错', () => {
  it('成功：返回账号 id', async () => {
    mockSignInWithPassword.mockResolvedValue({
      data: { user: { id: 'user-a' } },
      error: null,
    });
    const store = await loadStore();

    await expect(store.getState().signIn('a@example.com', 'pw')).resolves.toBe('user-a');
    expect(mockSignInWithPassword).toHaveBeenCalledWith({
      email: 'a@example.com',
      password: 'pw',
    });
  });

  it('凭据错误：抛中文「邮箱或密码不正确」', async () => {
    mockSignInWithPassword.mockResolvedValue({
      data: {},
      error: { message: 'Invalid login credentials' },
    });
    const store = await loadStore();

    await expect(store.getState().signIn('a@example.com', 'bad')).rejects.toThrow(
      '邮箱或密码不正确',
    );
  });

  it('网络异常：抛中文网络提示', async () => {
    mockSignInWithPassword.mockResolvedValue({
      data: {},
      error: { message: 'Network request failed' },
    });
    const store = await loadStore();

    await expect(store.getState().signIn('a@example.com', 'pw')).rejects.toThrow(
      '网络连接异常，请检查网络后重试',
    );
  });
});

describe('sendPasswordReset · 重置邮件', () => {
  it('成功：resolve 且带公网重置页回跳地址', async () => {
    mockResetPasswordForEmail.mockResolvedValue({ error: null });
    const store = await loadStore();

    await expect(
      store.getState().sendPasswordReset('a@example.com'),
    ).resolves.toBeUndefined();
    expect(mockResetPasswordForEmail).toHaveBeenCalledWith('a@example.com', {
      redirectTo: 'https://test.local/reset',
    });
  });

  it('限频：抛中文「请求过于频繁」', async () => {
    mockResetPasswordForEmail.mockResolvedValue({
      error: { message: 'too many requests' },
    });
    const store = await loadStore();

    await expect(store.getState().sendPasswordReset('a@example.com')).rejects.toThrow(
      '请求过于频繁，请稍后再试',
    );
  });
});
