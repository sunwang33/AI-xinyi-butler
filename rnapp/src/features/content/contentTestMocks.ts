/**
 * content 模块测试辅助（同 reminders/remindersTestMocks 约定）：
 * jest.mock 工厂不允许引用未以 mock 前缀声明的外部变量，故工厂集中在本文件。
 */
declare const jest: any;

/** ./api 的 mock 工厂：两个云函数调用均为 jest.fn，由各用例配置返回/拒绝 */
export function mockCreateContentApi(): {
  fetchBlessings: (...args: unknown[]) => unknown;
  fetchGifts: (...args: unknown[]) => unknown;
} {
  return {
    fetchBlessings: jest.fn(),
    fetchGifts: jest.fn(),
  };
}
