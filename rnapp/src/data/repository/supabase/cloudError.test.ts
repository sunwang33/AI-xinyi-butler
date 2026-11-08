/**
 * 云端报错中文翻译单测（T58 4.3 验收期补齐，2026-11-08）。
 * 契约：写入链路抓到的 Supabase/PostgREST 错误必须翻成可读中文真因，
 * 不允许把云端故障冒充成笼统的「本地写入失败」；未知错误透传原始信息便于排查。
 */
import { translateCloudError } from './cloudError';

declare const describe: (name: string, fn: () => void) => void;
declare const it: (name: string, fn: () => void) => void;
declare const expect: any;

describe('translateCloudError · 云端错误中文翻译', () => {
  it('网络类错误（fetch 失败/超时）→ 提示改动未上云、请检查网络', () => {
    const cases = ['Network request failed', 'Failed to fetch', 'NetworkError: ...', 'timeout of 30000ms exceeded'];
    for (const message of cases) {
      expect(translateCloudError({ message, code: '' } as any, '兜底').message).toBe(
        '网络连接异常，改动尚未保存到云端，请检查网络后重试',
      );
    }
  });

  it('鉴权/RLS 类错误（401/403/jwt/42501）→ 引导重新登录', () => {
    expect(
      translateCloudError({ message: 'jwt expired', code: '401' } as any, '兜底').message,
    ).toBe('登录状态已失效或无权限，请退出后重新登录');
    expect(
      translateCloudError({ message: 'new row violates row-level security policy', code: '42501' } as any, '兜底')
        .message,
    ).toBe('登录状态已失效或无权限，请退出后重新登录');
  });

  it('唯一约束冲突（23505）→ 提示记录已存在', () => {
    expect(
      translateCloudError({ message: 'duplicate key value violates unique constraint', code: '23505' } as any, '兜底')
        .message,
    ).toBe('该记录已存在，请勿重复操作');
  });

  it('PGRST116 空结果 → 提示目标数据不存在', () => {
    expect(translateCloudError({ message: 'JSON object requested, multiple (or no) rows returned', code: 'PGRST116' } as any, '兜底').message).toBe(
      '目标数据不存在或已被删除',
    );
  });

  it('未知错误：透传服务端原始信息，不冒充本地失败', () => {
    const err = translateCloudError({ message: 'relation "persons" does not exist', code: 'PGRST205' } as any, '云端写入失败');
    expect(err.message).toBe('relation "persons" does not exist');
  });

  it('error 为空或 message 为空：使用调用方兜底文案', () => {
    expect(translateCloudError(null, '云端写入失败').message).toBe('云端写入失败');
    expect(translateCloudError({ message: '', code: '' } as any, '云端写入失败').message).toBe('云端写入失败');
  });
});
